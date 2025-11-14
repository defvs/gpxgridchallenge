"use client";

import type {
  LatLngBounds,
  LatLngBoundsLiteral,
  LatLngTuple,
  Map as LeafletMap,
} from "leaflet";
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
const MIN_GRID_ZOOM = 10;

export interface GridMapProps {
  activities: Activity[];
  cells: CellEntry[];
  gridSize: number;
  variant?: "card" | "full";
  onMapReady?: (map: LeafletMap | null) => void;
}

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

const GridVisibilityController = ({
  onVisibilityChange,
}: {
  onVisibilityChange: (visible: boolean) => void;
}) => {
  const map = useMapEvents({
    zoomend: () => {
      onVisibilityChange(map.getZoom() >= MIN_GRID_ZOOM);
    },
  });

  useEffect(() => {
    onVisibilityChange(map.getZoom() >= MIN_GRID_ZOOM);
  }, [map, onVisibilityChange]);

  return null;
};

const MapReadyEffect = ({ onReady }: { onReady?: (map: LeafletMap | null) => void }) => {
  const map = useMap();

  useEffect(() => {
    onReady?.(map);
    return () => {
      onReady?.(null);
    };
  }, [map, onReady]);

  return null;
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

const GridMap = ({
  activities,
  cells,
  gridSize,
  variant = "card",
  onMapReady,
}: GridMapProps) => {
  const containerClasses =
    variant === "card"
      ? "relative z-0 h-full min-h-[480px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      : "relative z-0 h-full w-full overflow-hidden bg-slate-950";

  const visibleActivities = useMemo(
    () => activities.filter((activity) => activity.visible && activity.points.length),
    [activities],
  );

  const [isGridVisible, setIsGridVisible] = useState(true);

  return (
    <div className={containerClasses}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={9}
        minZoom={3}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
      >
        <MapReadyEffect onReady={onMapReady} />
        <GridVisibilityController onVisibilityChange={setIsGridVisible} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {isGridVisible ? <GridLines gridSize={gridSize} /> : null}
        {isGridVisible ? <FilledCellsLayer cells={cells} /> : null}
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
      {!isGridVisible ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
          Zoom in to see your grid
        </div>
      ) : null}
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
