import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

import type { LatLngTuple } from "leaflet";

import { calculatePolylineDistance } from "../lib/geo";
import type { Sport } from "../lib/sports";

const gzipAsync = promisify(gzip);

const STORAGE_ROOT = path.join(process.cwd(), "storage", "activities");

const getUserDir = (userId: string) => path.join(STORAGE_ROOT, userId);
const getMetaFile = (userId: string) => path.join(getUserDir(userId), "activities.json");
const getGpxDir = (userId: string) => path.join(getUserDir(userId), "gpx");

const POINT_SCALE = 1e5;

interface ActivityRecord {
  id: string;
  name: string;
  sport: Sport;
  fileName: string;
  distanceKm: number;
  createdAt: number;
  encodedPoints: string;
  gpxPath: string;
}

export interface ActivityInput {
  name: string;
  sport: Sport;
  fileName: string;
  points: LatLngTuple[];
  rawGpx: string;
}

export interface ActivityDTO {
  id: string;
  name: string;
  sport: Sport;
  fileName: string;
  distanceKm: number;
  createdAt: number;
  points: LatLngTuple[];
}

const ensureUserDirs = async (userId: string) => {
  await mkdir(getGpxDir(userId), { recursive: true });
};

const encodeNumber = (value: number) => {
  let num = value;
  let encoded = "";

  while (num >= 0x20) {
    encoded += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }

  encoded += String.fromCharCode(num + 63);
  return encoded;
};

const encodePoints = (points: LatLngTuple[]) => {
  let prevLat = 0;
  let prevLng = 0;
  let result = "";

  points.forEach(([lat, lng]) => {
    const latE5 = Math.round(lat * POINT_SCALE);
    const lngE5 = Math.round(lng * POINT_SCALE);

    const deltaLat = latE5 - prevLat;
    const deltaLng = lngE5 - prevLng;

    const latCode = deltaLat < 0 ? ~(deltaLat << 1) : deltaLat << 1;
    const lngCode = deltaLng < 0 ? ~(deltaLng << 1) : deltaLng << 1;

    result += encodeNumber(latCode);
    result += encodeNumber(lngCode);

    prevLat = latE5;
    prevLng = lngE5;
  });

  return result;
};

const decodeValue = (encoded: string, startIndex: number) => {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte: number;

  do {
    byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);

  const shouldNegate = result & 1;
  const delta = shouldNegate ? ~(result >> 1) : result >> 1;

  return { delta, nextIndex: index };
};

const decodePoints = (encoded: string): LatLngTuple[] => {
  const points: LatLngTuple[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const { delta: deltaLat, nextIndex: afterLat } = decodeValue(encoded, index);
    index = afterLat;

    const { delta: deltaLng, nextIndex: afterLng } = decodeValue(encoded, index);
    index = afterLng;

    lat += deltaLat;
    lng += deltaLng;

    points.push([lat / POINT_SCALE, lng / POINT_SCALE]);
  }

  return points;
};

const readRecords = async (userId: string): Promise<ActivityRecord[]> => {
  try {
    const content = await readFile(getMetaFile(userId), "utf8");
    const parsed = JSON.parse(content) as ActivityRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const writeRecords = async (userId: string, records: ActivityRecord[]) => {
  await writeFile(getMetaFile(userId), `${JSON.stringify(records, null, 2)}\n`, "utf8");
};

export const getActivities = async (userId: string): Promise<ActivityDTO[]> => {
  const records = await readRecords(userId);
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    sport: record.sport,
    fileName: record.fileName,
    distanceKm: record.distanceKm,
    createdAt: record.createdAt,
    points: decodePoints(record.encodedPoints),
  }));
};

export const storeActivities = async (
  userId: string,
  entries: ActivityInput[],
): Promise<ActivityDTO[]> => {
  if (!entries.length) {
    return [];
  }

  await ensureUserDirs(userId);
  const gpxDir = getGpxDir(userId);

  const existing = await readRecords(userId);

  const newRecords = await Promise.all(
    entries.map(async (entry) => {
      const id = randomUUID();
      const createdAt = Date.now();
      const encodedPoints = encodePoints(entry.points);
      const distanceKm = calculatePolylineDistance(entry.points);
      const gpxFileName = `${id}.gpx.gz`;
      const gpxPath = path.posix.join("gpx", gpxFileName);

      const compressed = await gzipAsync(Buffer.from(entry.rawGpx, "utf8"));
      await writeFile(path.join(gpxDir, gpxFileName), compressed);

      return {
        id,
        name: entry.name,
        sport: entry.sport,
        fileName: entry.fileName,
        distanceKm,
        createdAt,
        encodedPoints,
        gpxPath,
      } satisfies ActivityRecord;
    }),
  );

  const allRecords = [...newRecords, ...existing];
  await writeRecords(userId, allRecords);

  return newRecords.map((record) => ({
    id: record.id,
    name: record.name,
    sport: record.sport,
    fileName: record.fileName,
    distanceKm: record.distanceKm,
    createdAt: record.createdAt,
    points: decodePoints(record.encodedPoints),
  }));
};

export const deleteActivity = async (
  userId: string,
  activityId: string,
): Promise<boolean> => {
  const records = await readRecords(userId);
  const index = records.findIndex((record) => record.id === activityId);
  if (index === -1) {
    return false;
  }

  const [removed] = records.splice(index, 1);
  await writeRecords(userId, records);

  try {
    await unlink(path.join(getUserDir(userId), removed.gpxPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return true;
};
