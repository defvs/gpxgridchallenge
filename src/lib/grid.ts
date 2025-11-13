import type { LatLngBoundsLiteral, LatLngTuple } from "leaflet";

import type { Activity, CellEntry } from "./types";

export const getCellId = (lat: number, lng: number, gridSize: number) => {
  const latIndex = Math.floor(lat / gridSize);
  const lngIndex = Math.floor(lng / gridSize);
  return `${latIndex}:${lngIndex}`;
};

export const getCellBounds = (
  latIndex: number,
  lngIndex: number,
  gridSize: number,
): LatLngBoundsLiteral => [
  [latIndex * gridSize, lngIndex * gridSize],
  [(latIndex + 1) * gridSize, (lngIndex + 1) * gridSize],
];

const parseCellId = (cellId: string) => {
  const [latIndex, lngIndex] = cellId.split(":").map((value) => Number(value));
  return { latIndex, lngIndex };
};

export const buildCellIndex = (
  activities: Activity[],
  gridSize: number,
  includeHidden = true,
) => {
  const cells = new Map<string, CellEntry>();

  activities.forEach((activity) => {
    if (!includeHidden && !activity.visible) {
      return;
    }

    const seen = new Set<string>();

    activity.points.forEach(([lat, lng]) => {
      const cellId = getCellId(lat, lng, gridSize);
      if (seen.has(cellId)) {
        return;
      }

      seen.add(cellId);

      const { latIndex, lngIndex } = parseCellId(cellId);
      const bounds = getCellBounds(latIndex, lngIndex, gridSize);

      const cell = cells.get(cellId) ?? {
        id: cellId,
        bounds,
        activityIds: [],
        sports: {},
      };

      cell.activityIds.push(activity.id);
      cell.sports[activity.sport] = (cell.sports[activity.sport] ?? 0) + 1;

      cells.set(cellId, cell);
    });
  });

  return cells;
};

export const combineBounds = (points: LatLngTuple[]): LatLngBoundsLiteral | null => {
  if (!points.length) {
    return null;
  }

  let minLat = Number.POSITIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  points.forEach(([lat, lng]) => {
    minLat = Math.min(minLat, lat);
    minLng = Math.min(minLng, lng);
    maxLat = Math.max(maxLat, lat);
    maxLng = Math.max(maxLng, lng);
  });

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
};

export const boundsFromActivities = (activities: Activity[]) => {
  const allPoints = activities.flatMap((activity) => activity.points);
  return combineBounds(allPoints);
};
