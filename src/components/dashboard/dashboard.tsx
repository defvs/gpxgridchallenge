"use client";

import { UserButton } from "@clerk/nextjs";
import type { LatLngTuple } from "leaflet";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";

import GridMap from "../map/grid-map";
import { calculatePolylineDistance } from "../../lib/geo";
import { buildCellIndex } from "../../lib/grid";
import { getSportMeta, SPORT_OPTIONS } from "../../lib/sports";
import type { Sport } from "../../lib/sports";
import type { Activity } from "../../lib/types";
import { DEFAULT_GRID_SIZE } from "../../lib/constants";

type MessageTone = "success" | "error";

interface StatusMessage {
  text: string;
  tone: MessageTone;
}

const formatDistance = (distanceKm: number) =>
  distanceKm < 1 ? `${(distanceKm * 1000).toFixed(0)} m` : `${distanceKm.toFixed(1)} km`;

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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedSport, setSelectedSport] = useState<Sport>(SPORT_OPTIONS[0].value);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [editingSportId, setEditingSportId] = useState<string | null>(null);
  const gridSize = DEFAULT_GRID_SIZE;

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

  const activeSportCount = useMemo(
    () =>
      SPORT_OPTIONS.filter((option) => stats.perSport[option.value].activities > 0).length,
    [stats.perSport],
  );

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

  const handleSportUpdate = (id: string, sport: Sport) => {
    const meta = getSportMeta(sport);
    setActivities((prev) =>
      prev.map((activity) =>
        activity.id === id ? { ...activity, sport, color: meta.color } : activity,
      ),
    );
    setEditingSportId(null);
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
  const renderSidebarContent = (onClose?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Activities</h2>
          <p className="text-sm text-slate-500">
            Upload GPX tracks and categorize them.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleToggleAll}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-white cursor-pointer"
          >
            {activities.every((activity) => activity.visible) ? "Hide all" : "Show all"}
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-white"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-4 text-slate-900">
        <label className="block text-sm font-medium text-slate-700">
          Upload GPX files
          <div className="mt-1 space-y-2">
            <select
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              value={selectedSport}
              onChange={(event) => setSelectedSport(event.target.value as Sport)}
            >
              {SPORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="file"
              accept=".gpx"
              multiple
              onChange={handleUpload}
              className="block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center text-sm text-slate-500 hover:border-slate-400"
            />
          </div>
        </label>
        {message ? (
          <button
            type="button"
            onClick={() => setMessage(null)}
            className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            <span className="whitespace-pre-line">{message.text}</span>
            <span aria-hidden className="text-lg leading-none">
              ×
            </span>
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1">
        {!hasActivities ? (
          <p className="rounded-2xl border border-slate-100/70 bg-white/80 p-4 text-sm text-slate-600">
            No activities yet. Choose a sport, upload one or more GPX files, and they will
            appear here with quick stats.
          </p>
        ) : (
          activities.map((activity) => {
                const meta = getSportMeta(activity.sport);
                const coveredCells = activityCellCounts[activity.id] ?? 0;
                const isEditingSport = editingSportId === activity.id;
                return (
                  <div
                    key={activity.id}
                    className="flex items-start justify-between rounded-2xl border border-slate-100/80 bg-white/80 p-3 shadow-sm"
                  >
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-6 rounded-full"
                          style={{ backgroundColor: activity.color }}
                        />
                        <p className="font-medium text-slate-900">{activity.name}</p>
                      </div>
                      <p className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                        {isEditingSport ? (
                          <select
                            value={activity.sport}
                            autoFocus
                            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
                            onChange={(event) => handleSportUpdate(activity.id, event.target.value as Sport)}
                            onBlur={() =>
                              setEditingSportId((current) => (current === activity.id ? null : current))
                            }
                          >
                            {SPORT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingSportId(activity.id)}
                            className="cursor-pointer rounded-full border border-transparent px-2 py-0.5 text-left font-medium text-slate-600 transition hover:border-slate-200 hover:text-slate-900"
                          >
                            {meta.label}
                          </button>
                        )}
                        <span>• {formatDistance(activity.distanceKm)}</span>
                        <span>• {coveredCells} cells</span>
                      </p>
                    </div>
                <button
                  type="button"
                  onClick={() => handleToggle(activity.id)}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
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
    </div>
  );

  return (
    <div className="relative h-[100dvh] min-h-screen w-full overflow-hidden bg-slate-950">
      <div className="absolute inset-0 z-0">
        <GridMap
          activities={activities}
          cells={Array.from(visibleCells.values())}
          gridSize={gridSize}
          variant="full"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute left-4 top-4 bottom-4 hidden w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-white/15 bg-white/95 p-5 shadow-2xl backdrop-blur lg:flex">
          {renderSidebarContent()}
        </div>

        <div className="pointer-events-auto absolute right-4 top-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowStatsModal(true)}
            className="cursor-pointer rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg backdrop-blur transition hover:bg-white"
          >
            View stats
          </button>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg backdrop-blur transition hover:bg-white lg:hidden"
          >
            Activities
          </button>
          <div className="rounded-full border border-white/40 bg-white/90 p-1 shadow-lg backdrop-blur">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-10 w-10",
                },
              }}
            />
          </div>
        </div>
      </div>

      {isSidebarOpen ? (
        <div className="fixed inset-0 z-30 flex lg:hidden">
          <button
            type="button"
            aria-label="Close activities"
            onClick={() => setIsSidebarOpen(false)}
            className="h-full flex-1 bg-slate-950/60 backdrop-blur-sm"
          />
          <div className="h-full w-[min(85vw,360px)] bg-white p-5 shadow-2xl">
            {renderSidebarContent(() => setIsSidebarOpen(false))}
          </div>
        </div>
      ) : null}

      {showStatsModal ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4"
          onClick={() => setShowStatsModal(false)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  Progress
                </p>
                <h3 className="text-2xl font-semibold text-slate-900">Statistics</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowStatsModal(false)}
                className="cursor-pointer rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Cells filled
                </p>
                <p className="mt-2 text-3xl font-bold text-emerald-900">
                  {stats.totalCells}
                </p>
                <p className="text-xs text-emerald-700">Visible now: {stats.visibleCells}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
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
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Total activities
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {stats.totalActivities}
                </p>
                <p className="text-xs text-slate-500">
                  Across {activeSportCount} sport{activeSportCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
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
                    <li key={option.value} className="flex items-center justify-between">
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
        </div>
      ) : null}
    </div>
  );
};

export default Dashboard;
