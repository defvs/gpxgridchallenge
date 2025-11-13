"use client";

import type { LatLngTuple } from "leaflet";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";

import GridMap from "../map/grid-map";
import { calculatePolylineDistance } from "../../lib/geo";
import { buildCellIndex } from "../../lib/grid";
import { getSportMeta, SPORT_OPTIONS } from "../../lib/sports";
import type { Sport } from "../../lib/sports";
import type { Activity } from "../../lib/types";

const GRID_CHOICES = [0.0025, 0.005, 0.01, 0.02, 0.05];
const DEFAULT_GRID_SIZE = 0.01;

type MessageTone = "success" | "error";

interface StatusMessage {
  text: string;
  tone: MessageTone;
}

const formatDistance = (distanceKm: number) =>
  distanceKm < 1 ? `${(distanceKm * 1000).toFixed(0)} m` : `${distanceKm.toFixed(1)} km`;

const approxMetersFromDegrees = (degrees: number) =>
  Math.round(degrees * 111_139);

const parseGpx = async (file: File) => {
  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "application/xml");

  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    throw new Error("Invalid GPX file");
  }

  const points: LatLngTuple[] = [];
  const pushPoints = (tag: string) => {
    xml.querySelectorAll(tag).forEach((node) => {
      const lat = Number(node.getAttribute("lat"));
      const lng = Number(node.getAttribute("lon"));
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push([lat, lng]);
      }
    });
  };

  pushPoints("trkpt");
  if (!points.length) {
    pushPoints("rtept");
  }

  const name =
    xml.querySelector("trk > name")?.textContent?.trim() ||
    xml.querySelector("name")?.textContent?.trim() ||
    file.name.replace(/\.gpx$/i, "");

  return { name, points };
};

const Dashboard = () => {
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedSport, setSelectedSport] = useState<Sport>(SPORT_OPTIONS[0].value);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const allCells = useMemo(
    () => buildCellIndex(activities, gridSize, true),
    [activities, gridSize],
  );
  const visibleCells = useMemo(
    () => buildCellIndex(activities, gridSize, false),
    [activities, gridSize],
  );

  const activityCellCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allCells.forEach((cell) => {
      cell.activityIds.forEach((id) => {
        counts[id] = (counts[id] ?? 0) + 1;
      });
    });
    return counts;
  }, [allCells]);

  const stats = useMemo(() => {
    const totalDistanceKm = activities.reduce(
      (sum, activity) => sum + activity.distanceKm,
      0,
    );

    const perSport = SPORT_OPTIONS.reduce<Record<Sport, { distance: number; activities: number; cells: number }>>(
      (acc, option) => {
        acc[option.value] = { distance: 0, activities: 0, cells: 0 };
        return acc;
      },
      {} as Record<Sport, { distance: number; activities: number; cells: number }>,
    );

    activities.forEach((activity) => {
      const bucket = perSport[activity.sport];
      bucket.activities += 1;
      bucket.distance += activity.distanceKm;
      bucket.cells += activityCellCounts[activity.id] ?? 0;
    });

    return {
      totalActivities: activities.length,
      totalDistanceKm,
      totalCells: allCells.size,
      visibleCells: visibleCells.size,
      perSport,
    };
  }, [activities, activityCellCounts, allCells.size, visibleCells.size]);

  const handleToggle = (id: string) => {
    setActivities((prev) =>
      prev.map((activity) =>
        activity.id === id ? { ...activity, visible: !activity.visible } : activity,
      ),
    );
  };

  const handleToggleAll = () => {
    const allVisible = activities.every((activity) => activity.visible);
    setActivities((prev) =>
      prev.map((activity) => ({
        ...activity,
        visible: !allVisible,
      })),
    );
  };

  const handleGridSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setGridSize(Number(event.target.value));
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (!files?.length) {
      return;
    }

    const currentSport = selectedSport;
    const importResults: Activity[] = [];
    const failures: string[] = [];

    await Promise.all(
      Array.from(files).map(async (file) => {
        try {
          const parsed = await parseGpx(file);
          if (parsed.points.length < 2) {
            throw new Error("This file does not contain enough coordinates.");
          }

          const distanceKm = calculatePolylineDistance(parsed.points);
          const meta = getSportMeta(currentSport);

          importResults.push({
            id: crypto.randomUUID(),
            name: parsed.name,
            sport: currentSport,
            color: meta.color,
            visible: true,
            fileName: file.name,
            points: parsed.points,
            distanceKm,
            createdAt: Date.now(),
          });
        } catch (error) {
          failures.push(`${file.name}: ${(error as Error).message}`);
        }
      }),
    );

    setActivities((prev) => [...importResults, ...prev]);

    if (failures.length) {
      setMessage({
        text: `Some files could not be processed:\n${failures.join("\n")}`,
        tone: "error",
      });
    } else if (importResults.length) {
      setMessage({
        text: `${importResults.length} activit${
          importResults.length === 1 ? "y" : "ies"
        } imported as ${getSportMeta(currentSport).label}.`,
        tone: "success",
      });
    }

    event.target.value = "";
  };

  const hasActivities = activities.length > 0;
  const gridApproxMeters = approxMetersFromDegrees(gridSize);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Activities
              </h2>
              <p className="text-sm text-slate-500">
                Upload GPX tracks and categorize them.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleAll}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              {activities.every((activity) => activity.visible)
                ? "Hide all"
                : "Show all"}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Sport category
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                value={selectedSport}
                onChange={(event) =>
                  setSelectedSport(event.target.value as Sport)
                }
              >
                {SPORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Upload GPX files
              <input
                type="file"
                accept=".gpx"
                multiple
                onChange={handleUpload}
                className="mt-1 block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 hover:border-slate-400"
              />
            </label>
            {message ? (
              <p
                className={`rounded-xl border px-3 py-2 text-sm ${
                  message.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700 whitespace-pre-line"
                }`}
              >
                {message.text}
              </p>
            ) : null}
          </div>

          <div className="mt-6 space-y-3">
            {!hasActivities ? (
              <p className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
                No activities yet. Choose a sport, upload one or more GPX files,
                and they will appear here with quick stats.
              </p>
            ) : (
              activities.map((activity) => {
                const meta = getSportMeta(activity.sport);
                const coveredCells = activityCellCounts[activity.id] ?? 0;
                return (
                  <div
                    key={activity.id}
                    className="flex items-start justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-6 rounded-full"
                          style={{ backgroundColor: activity.color }}
                        />
                        <p className="font-medium text-slate-900">
                          {activity.name}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500">
                        {meta.label} • {formatDistance(activity.distanceKm)} •{" "}
                        {coveredCells} cells
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggle(activity.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                        activity.visible
                          ? "border-slate-200 text-slate-600 hover:bg-white"
                          : "border-slate-200 text-slate-400 hover:text-slate-600"
                      }`}
                      title={activity.visible ? "Hide activity" : "Show activity"}
                    >
                      {activity.visible ? "👁" : "🚫"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">Grid size</p>
                <p className="text-lg font-semibold text-slate-900">
                  {gridSize.toFixed(4)}° • approx. {gridApproxMeters.toLocaleString()}{" "}
                  meters squares
                </p>
              </div>
              <select
                value={gridSize}
                onChange={handleGridSizeChange}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              >
                {GRID_CHOICES.map((option) => (
                  <option key={option} value={option}>
                    {option.toFixed(4)}° • ~
                    {approxMetersFromDegrees(option).toLocaleString()} m
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500">
              Larger cells are faster to fill but provide less detail. Switch the
              grid size at any moment; statistics update automatically.
            </p>
          </div>
          <GridMap
            activities={activities}
            cells={Array.from(visibleCells.values())}
            gridSize={gridSize}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Cells filled
            </p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">
              {stats.totalCells}
            </p>
            <p className="text-xs text-emerald-700">
              Visible now: {stats.visibleCells}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Distance logged
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {stats.totalDistanceKm.toFixed(1)} km
            </p>
            <p className="text-xs text-slate-500">
              Across {stats.totalActivities} activit
              {stats.totalActivities === 1 ? "y" : "ies"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Sports covered
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {SPORT_OPTIONS.map((option) => {
                const bucket = stats.perSport[option.value];
                if (!bucket.activities) {
                  return null;
                }

                return (
                  <li
                    key={option.value}
                    className="flex items-center justify-between"
                  >
                    <span>{option.label}</span>
                    <span className="text-slate-500">
                      {bucket.activities} • {bucket.cells} cells
                    </span>
                  </li>
                );
              })}
            </ul>
            {!stats.totalActivities ? (
              <p className="mt-2 text-xs text-slate-500">
                Upload a GPX file to see per-sport coverage details.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
