import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { LatLngTuple } from "leaflet";
import stravaApi, {
  type DetailedActivityResponse,
  type RefreshTokenResponse,
  type Strava,
} from "strava-v3";

import type { Sport } from "../lib/sports";
import type { ActivityDTO, ActivityInput } from "./activity-storage";
import { storeActivities } from "./activity-storage";

const STRAVA_SCOPE = process.env.STRAVA_SCOPE ?? "read,activity:read_all";

export const getRequiredStravaScope = () => STRAVA_SCOPE;

interface BaseStravaConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface StoredStravaState {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  athlete?: {
    id?: number;
    firstname?: string;
    lastname?: string;
    username?: string;
    profile?: string;
  };
  importedActivityIds?: number[];
  lastActivityCursor?: number;
  lastSyncSummary?: StravaSyncSummary;
  pendingAuthState?: string | null;
}

export interface StravaSyncSummary {
  attemptedAt: number;
  imported: number;
  considered: number;
}

export interface StravaStatus {
  configured: boolean;
  connected: boolean;
  athleteName?: string;
  lastSync?: StravaSyncSummary;
}

export interface StravaSyncResult {
  imported: ActivityDTO[];
  summary: StravaSyncSummary;
}

interface TokenExchangeResult extends RefreshTokenResponse {
  athlete?: {
    id?: number;
    firstname?: string;
    lastname?: string;
    username?: string;
    profile?: string;
  };
}

const STORAGE_ROOT = path.join(process.cwd(), "storage", "strava");
const MAX_TRACKED_ACTIVITY_IDS = 500;
const POLYLINE_SCALE = 1e5;
const TOKEN_EXPIRY_BUFFER_SECONDS = 60;
const PER_PAGE = 50;
const MAX_SYNC_PAGES = 3;

const STRAVA_SPORT_MAP: Partial<Record<string, Sport>> = {
  Run: "walking",
  TrailRun: "walking",
  Walk: "walking",
  Hike: "hiking",
  AlpineSki: "alpine-ski",
  BackcountrySki: "touring-ski",
  NordicSki: "nordic-ski",
  CrossCountrySki: "nordic-ski",
  SkateSki: "nordic-ski",
  GravelRide: "gravel-cycling",
  Ride: "road-cycling",
  VirtualRide: "road-cycling",
  EBikeRide: "road-cycling",
  E_BikeRide: "road-cycling",
  MountainBikeRide: "mountain-cycling",
  EMountainBikeRide: "mountain-cycling",
};

const ensureStorageDir = async () => {
  await mkdir(STORAGE_ROOT, { recursive: true });
};

const getStatePath = (userId: string) => path.join(STORAGE_ROOT, `${userId}.json`);

const readState = async (userId: string): Promise<StoredStravaState> => {
  try {
    const content = await readFile(getStatePath(userId), "utf8");
    const parsed = JSON.parse(content) as StoredStravaState;
    return parsed ?? {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

const writeState = async (userId: string, state: StoredStravaState) => {
  await ensureStorageDir();
  await writeFile(getStatePath(userId), `${JSON.stringify(state, null, 2)}\n`, "utf8");
};

const getBaseConfig = (): BaseStravaConfig | null => {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
};

let configured = false;

const ensureStravaLibraryConfig = () => {
  if (configured) {
    return;
  }

  const baseConfig = getBaseConfig();
  if (!baseConfig) {
    throw new Error("Missing Strava credentials. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REDIRECT_URI.");
  }

  stravaApi.config({
    // Empty access token because OAuth operations only need client metadata.
    access_token: "",
    client_id: baseConfig.clientId,
    client_secret: baseConfig.clientSecret,
    redirect_uri: baseConfig.redirectUri,
  });

  configured = true;
};

export const isStravaConfigured = () => getBaseConfig() !== null;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toIsoDate = (value?: string | number | Date) => {
  if (!value) {
    return new Date().toISOString();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
};

const buildGpxContents = (name: string, startDate: string | number | Date | undefined, points: LatLngTuple[]) => {
  const safeName = escapeXml(name || "Strava Activity");
  const trackPoints = points
    .map(([lat, lng]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`)
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="GPX Grid Challenge" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    `    <name>${safeName}</name>`,
    `    <time>${toIsoDate(startDate)}</time>`,
    "  </metadata>",
    "  <trk>",
    `    <name>${safeName}</name>`,
    "    <trkseg>",
    trackPoints,
    "    </trkseg>",
    "  </trk>",
    "</gpx>",
    "",
  ].join("\n");
};

const decodePolyline = (encoded: string): LatLngTuple[] => {
  const points: LatLngTuple[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push([lat / POLYLINE_SCALE, lng / POLYLINE_SCALE]);
  }

  return points;
};

const resolveSport = (activity: DetailedActivityResponse): Sport | null => {
  const sportType = (activity.sport_type ??
    // @ts-expect-error Older activities use `type`
    activity.type) as string | undefined;
  if (!sportType) {
    return null;
  }

  return STRAVA_SPORT_MAP[sportType] ?? null;
};

const getStateWithDefaults = async (userId: string) => ({
  ...(await readState(userId)),
});

export const buildAuthorizeUrl = async (userId: string) => {
  ensureStravaLibraryConfig();
  const baseConfig = getBaseConfig();
  if (!baseConfig) {
    throw new Error("Strava is not configured on the server.");
  }

  const state = randomUUID();
  const currentState = await getStateWithDefaults(userId);
  currentState.pendingAuthState = state;
  await writeState(userId, currentState);

  const params = new URLSearchParams({
    client_id: baseConfig.clientId,
    redirect_uri: baseConfig.redirectUri,
    response_type: "code",
    scope: STRAVA_SCOPE,
    approval_prompt: "auto",
    state,
  });

  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
};

export const getStravaStatus = async (userId: string): Promise<StravaStatus> => {
  const state = await readState(userId);
  const configuredStatus = isStravaConfigured();

  if (!state.accessToken || !state.refreshToken || !state.expiresAt) {
    return {
      configured: configuredStatus,
      connected: false,
    };
  }

  const athleteName = state.athlete
    ? [state.athlete.firstname, state.athlete.lastname].filter(Boolean).join(" ").trim() ||
      state.athlete.username
    : undefined;

  return {
    configured: configuredStatus,
    connected: true,
    athleteName,
    lastSync: state.lastSyncSummary,
  };
};

const ensureValidTokens = async (userId: string): Promise<StoredStravaState> => {
  ensureStravaLibraryConfig();
  const state = await getStateWithDefaults(userId);

  if (!state.accessToken || !state.refreshToken || !state.expiresAt) {
    throw new Error("Strava is not connected for this user.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (state.expiresAt <= now + TOKEN_EXPIRY_BUFFER_SECONDS) {
    const refreshed = await stravaApi.oauth.refreshToken(state.refreshToken);
    state.accessToken = refreshed.access_token;
    state.refreshToken = refreshed.refresh_token;
    state.expiresAt = refreshed.expires_at;
    await writeState(userId, state);
  }

  return state;
};

const getStravaClient = (token: string): Strava => {
  const Client = stravaApi.client as unknown as new (accessToken: string) => Strava;
  return new Client(token);
};

export const exchangeStravaCode = async (
  userId: string,
  code: string,
  providedState?: string | null,
) => {
  ensureStravaLibraryConfig();
  const currentState = await getStateWithDefaults(userId);

  if (currentState.pendingAuthState && providedState && currentState.pendingAuthState !== providedState) {
    throw new Error("State mismatch. Start the Strava connection again.");
  }

  const tokenPayload = (await stravaApi.oauth.getToken(code)) as TokenExchangeResult;
  if (!tokenPayload?.access_token || !tokenPayload.refresh_token || !tokenPayload.expires_at) {
    throw new Error("Unable to exchange code for tokens.");
  }

  const nextState: StoredStravaState = {
    ...currentState,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    expiresAt: tokenPayload.expires_at,
    athlete: tokenPayload.athlete,
    pendingAuthState: null,
  };

  await writeState(userId, nextState);
};

const buildActivityInput = (activity: DetailedActivityResponse): ActivityInput | null => {
  const sport = resolveSport(activity);
  if (!sport) {
    return null;
  }

  const encodedPolyline = activity.map?.summary_polyline ?? activity.map?.polyline;
  if (!encodedPolyline) {
    return null;
  }

  const points = decodePolyline(encodedPolyline);
  if (points.length < 2) {
    return null;
  }

  const name = activity.name?.trim() || "Strava activity";
  const rawGpx = buildGpxContents(name, activity.start_date, points);
  return {
    name,
    sport,
    fileName: `strava-${activity.id}.gpx`,
    points,
    rawGpx,
  };
};

const fetchRecentActivities = async (
  client: Strava,
  after: number,
): Promise<DetailedActivityResponse[]> => {
  const collected: DetailedActivityResponse[] = [];

  for (let page = 1; page <= MAX_SYNC_PAGES; page += 1) {
    const pageResults = (await client.athlete.listActivities({
      after,
      per_page: PER_PAGE,
      page,
    })) as DetailedActivityResponse[];

    if (!Array.isArray(pageResults) || !pageResults.length) {
      break;
    }

    collected.push(...pageResults);
    if (pageResults.length < PER_PAGE) {
      break;
    }
  }

  return collected;
};

export const syncStravaActivities = async (userId: string): Promise<StravaSyncResult> => {
  const state = await ensureValidTokens(userId);
  const client = getStravaClient(state.accessToken as string);

  const after = state.lastActivityCursor ?? 0;
  const activities = await fetchRecentActivities(client, after);
  const seenIds = new Set(state.importedActivityIds ?? []);

  const inputs: ActivityInput[] = [];
  const newImportedIds: number[] = [];
  let newestCursor = after;

  activities.forEach((activity) => {
    const numericId = Number(activity.id);
    if (seenIds.has(numericId)) {
      return;
    }

    const parsed = buildActivityInput(activity);
    if (parsed) {
      inputs.push(parsed);
      if (Number.isFinite(numericId)) {
        newImportedIds.push(numericId);
      }
      seenIds.add(numericId);
    }

    const startDate = activity.start_date
      ? Math.floor(new Date(activity.start_date as string).getTime() / 1000)
      : 0;
    if (startDate > newestCursor) {
      newestCursor = startDate;
    }
  });

  const stored = await storeActivities(userId, inputs);

  const summary: StravaSyncSummary = {
    attemptedAt: Date.now(),
    imported: stored.length,
    considered: activities.length,
  };

  const orderedIds = [...newImportedIds, ...(state.importedActivityIds ?? [])]
    .filter((id): id is number => Number.isFinite(id))
    .slice(0, MAX_TRACKED_ACTIVITY_IDS);

  const nextState: StoredStravaState = {
    ...state,
    importedActivityIds: orderedIds,
    lastActivityCursor: newestCursor || after,
    lastSyncSummary: summary,
  };

  await writeState(userId, nextState);

  return {
    imported: stored,
    summary,
  };
};
