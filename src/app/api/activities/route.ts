import type { LatLngTuple } from "leaflet";
import { NextResponse } from "next/server";

import { getSportMeta, SPORT_OPTIONS } from "../../../lib/sports";
import type { Sport } from "../../../lib/sports";
import type { Activity } from "../../../lib/types";
import {
  getActivities,
  storeActivities,
  type ActivityDTO,
  type ActivityInput,
} from "../../../server/activity-storage";
import { invalid, resolveUserId, unauthorized } from "./helpers";

const VALID_SPORTS = new Set<Sport>(SPORT_OPTIONS.map((option) => option.value));

const sanitizePoints = (value: unknown): LatLngTuple[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const points: LatLngTuple[] = [];

  value.forEach((entry) => {
    if (Array.isArray(entry) && entry.length === 2) {
      const lat = Number(entry[0]);
      const lng = Number(entry[1]);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push([lat, lng]);
      }
    }
  });

  return points;
};

const toActivityResponse = (dto: ActivityDTO): Activity => {
  const meta = getSportMeta(dto.sport);
  return {
    id: dto.id,
    name: dto.name,
    sport: dto.sport,
    color: meta.color,
    visible: true,
    fileName: dto.fileName,
    points: dto.points,
    distanceKm: dto.distanceKm,
    createdAt: dto.createdAt,
  };
};

export const GET = async () => {
  const userId = resolveUserId();
  if (!userId) {
    return unauthorized();
  }

  try {
    const stored = await getActivities(userId);
    return NextResponse.json({ activities: stored.map(toActivityResponse) });
  } catch (error) {
    console.error("Failed to load activities", error);
    return NextResponse.json({ error: "Unable to load activities" }, { status: 500 });
  }
};

interface RawActivityPayload {
  name?: unknown;
  sport?: unknown;
  fileName?: unknown;
  points?: unknown;
  rawGpx?: unknown;
}

export const POST = async (request: Request) => {
  const userId = resolveUserId();
  if (!userId) {
    return unauthorized();
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return invalid("Invalid JSON payload");
  }

  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { activities?: unknown }).activities)) {
    return invalid("Expected an activities array");
  }

  const rawActivities = (payload as { activities: RawActivityPayload[] }).activities;

  const sanitized: ActivityInput[] = rawActivities
    .map((entry) => {
      const points = sanitizePoints(entry.points);
      if (points.length < 2) {
        return null;
      }

      const sport = typeof entry.sport === "string" ? (entry.sport as Sport) : null;
      if (!sport || !VALID_SPORTS.has(sport)) {
        return null;
      }

      const rawGpx = typeof entry.rawGpx === "string" ? entry.rawGpx : null;
      if (!rawGpx || !rawGpx.trim()) {
        return null;
      }

      const name = typeof entry.name === "string" && entry.name.trim()
        ? entry.name.trim()
        : undefined;

      const fileName = typeof entry.fileName === "string" && entry.fileName.trim()
        ? entry.fileName.trim()
        : "activity.gpx";

      return {
        name: name ?? fileName.replace(/\.gpx$/i, ""),
        sport,
        fileName,
        points,
        rawGpx,
      } satisfies ActivityInput;
    })
    .filter(Boolean) as ActivityInput[];

  if (!sanitized.length) {
    return invalid("No valid activities to store");
  }

  try {
    const stored = await storeActivities(userId, sanitized);
    return NextResponse.json(
      { activities: stored.map(toActivityResponse) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to persist activities", error);
    return NextResponse.json({ error: "Unable to store activities" }, { status: 500 });
  }
};
