import type { LatLngBoundsLiteral, LatLngTuple } from "leaflet";

import type { Sport } from "./sports";

export interface Activity {
  id: string;
  name: string;
  sport: Sport;
  color: string;
  visible: boolean;
  fileName: string;
  points: LatLngTuple[];
  distanceKm: number;
  createdAt: number;
}

export interface CellEntry {
  id: string;
  bounds: LatLngBoundsLiteral;
  activityIds: string[];
  sports: Partial<Record<Sport, number>>;
}
