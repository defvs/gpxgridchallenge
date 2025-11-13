import type { LatLngTuple } from "leaflet";

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const haversineDistance = (
  [lat1, lng1]: LatLngTuple,
  [lat2, lng2]: LatLngTuple,
) => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

export const calculatePolylineDistance = (points: LatLngTuple[]) => {
  if (points.length < 2) {
    return 0;
  }

  let distance = 0;
  for (let i = 1; i < points.length; i += 1) {
    distance += haversineDistance(points[i - 1], points[i]);
  }

  return distance;
};
