"use client";

import type { LatLngBounds, LatLngBoundsLiteral, LatLngTuple } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Polyline,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";

import { getSportMeta } from "../../lib/sports";
import type { Sport } from "../../lib/sports";
import type { Activity, CellEntry } from "../../lib/types";

const DEFAULT_CENTER: LatLngTuple = [46.2044, 6.1432];

export interface GridMapProps {
  activities: Activity[];
  cells: CellEntry[];
  gridSize: number;
  variant?: "card" | "full";
}

const FitBounds = ({ bounds }: { bounds: LatLngBoundsLiteral | null }) => {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [32, 32] });
    }
  }, [bounds, map]);

  return null;
};

const getGridLineCoords = (
  bounds: LatLngBoundsLiteral | null,
  gridSize: number,
) => {
  if (!bounds) {
    return { latLines: [], lngLines: [] };
  }

  const [[south, west], [north, east]] = bounds;

  const latStart = Math.floor(south / gridSize) * gridSize;
  const latEnd = Math.ceil(north / gridSize) * gridSize;
  const lngStart = Math.floor(west / gridSize) * gridSize;
  const lngEnd = Math.ceil(east / gridSize) * gridSize;

  const latLines: LatLngTuple[][] = [];
  const lngLines: LatLngTuple[][] = [];

  for (let lat = latStart; lat <= latEnd; lat += gridSize) {
    latLines.push([
      [lat, lngStart],
      [lat, lngEnd],
    ]);
  }

  for (let lng = lngStart; lng <= lngEnd; lng += gridSize) {
    lngLines.push([
      [latStart, lng],
      [latEnd, lng],
    ]);
  }

  return { latLines, lngLines };
};

const toLiteralBounds = (bounds: LatLngBounds): LatLngBoundsLiteral => [
  [bounds.getSouth(), bounds.getWest()],
  [bounds.getNorth(), bounds.getEast()],
];

const GridLines = ({ gridSize }: { gridSize: number }) => {
  const [, setRevision] = useState(0);

  const map = useMapEvents({
    moveend: () => setRevision((value) => value + 1),
    zoomend: () => setRevision((value) => value + 1),
  });

  const bounds = toLiteralBounds(map.getBounds());

  const { latLines, lngLines } = useMemo(
    () => getGridLineCoords(bounds, gridSize),
    [bounds, gridSize],
  );

  return (
    <>
      {latLines.map((line, index) => (
        <Polyline
          key={`lat-${line[0][0]}-${index}`}
          positions={line}
          pathOptions={{ color: "#94a3b8", weight: 0.7, opacity: 0.6 }}
        />
      ))}
      {lngLines.map((line, index) => (
        <Polyline
          key={`lng-${line[0][1]}-${index}`}
          positions={line}
          pathOptions={{ color: "#94a3b8", weight: 0.7, opacity: 0.6 }}
        />
      ))}
    </>
  );
};

const getDominantSport = (sports: CellEntry["sports"]) => {
  let leadingSport: Sport | null = null;
  let leadingValue = -Infinity;

  Object.entries(sports).forEach(([sport, value]) => {
    if (value > leadingValue) {
      leadingSport = sport as Sport;
      leadingValue = value;
    }
  });

  return leadingSport;
};

const FilledCellsLayer = ({ cells }: { cells: CellEntry[] }) => (
  <>
    {cells.map((cell) => {
      const dominantSport = getDominantSport(cell.sports);
      const color = dominantSport
        ? getSportMeta(dominantSport).color
        : "#22c55e";

      return (
        <Rectangle
          key={cell.id}
          bounds={cell.bounds}
          pathOptions={{
            weight: 1,
            opacity: 0,
            fillOpacity: 0.35,
            color,
            fillColor: color,
          }}
        >
          <Tooltip direction="center" opacity={0.9}>
            <div className="text-xs font-medium">
              <p>{cell.activityIds.length} activities</p>
              {Object.entries(cell.sports).map(([sport, value]) => (
                <p key={sport}>
                  {getSportMeta(sport as Sport).label}: {value}
                </p>
              ))}
            </div>
          </Tooltip>
        </Rectangle>
      );
    })}
  </>
);

const polylineOptions = {
  weight: 3,
  opacity: 0.85,
};

const GridMap = ({ activities, cells, gridSize, variant = "card" }: GridMapProps) => {
  const containerClasses =
    variant === "card"
      ? "relative z-0 h-full min-h-[480px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      : "relative z-0 h-full w-full overflow-hidden bg-slate-950";

  const visibleActivities = useMemo(
    () => activities.filter((activity) => activity.visible && activity.points.length),
    [activities],
  );

  const bounds = useMemo(() => {
    if (!visibleActivities.length) {
      return null;
    }

    let minLat = Number.POSITIVE_INFINITY;
    let minLng = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;

    visibleActivities.forEach((activity) => {
      activity.points.forEach(([lat, lng]) => {
        minLat = Math.min(minLat, lat);
        minLng = Math.min(minLng, lng);
        maxLat = Math.max(maxLat, lat);
        maxLng = Math.max(maxLng, lng);
      });
    });

    if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) {
      return null;
    }

    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ] as LatLngBoundsLiteral;
  }, [visibleActivities]);

  return (
    <div className={containerClasses}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={9}
        minZoom={3}
        scrollWheelZoom
        className="h-full w-full"
      >
        {bounds ? <FitBounds bounds={bounds} /> : null}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GridLines gridSize={gridSize} />
        <FilledCellsLayer cells={cells} />
        {visibleActivities.map((activity) => (
          <Polyline
            key={activity.id}
            positions={activity.points}
            pathOptions={{
              ...polylineOptions,
              color: activity.color,
            }}
          />
        ))}
      </MapContainer>
      {!visibleActivities.length ? (
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm ${
            variant === "card"
              ? "bg-white/70 text-slate-600"
              : "bg-slate-950/60 text-white"
          }`}
        >
          Upload a GPX file to start filling the grid.
        </div>
      ) : null}
    </div>
  );
};

export default GridMap;
