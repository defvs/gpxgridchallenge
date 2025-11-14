"use client";

import { UserButton } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import type { LatLngTuple, Map as LeafletMap } from "leaflet";
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GridMapProps } from "../map/grid-map";
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

interface ParsedGpx {
  name: string;
  points: LatLngTuple[];
  rawGpx: string;
}

interface UploadDraft {
  name: string;
  sport: Sport;
  fileName: string;
  points: LatLngTuple[];
  rawGpx: string;
}

interface StravaSyncSummary {
  attemptedAt: number;
  imported: number;
  considered: number;
}

interface StravaStatusSummary {
  configured: boolean;
  connected: boolean;
  athleteName?: string;
  lastSync?: StravaSyncSummary;
}

type StravaSyncResponsePayload = {
  activities?: Activity[];
  summary?: StravaSyncSummary;
  error?: string;
};

type StoreActivitiesResponsePayload = {
  activities?: Activity[];
  error?: string;
};

const formatDistance = (distanceKm: number) =>
  distanceKm < 1 ? `${(distanceKm * 1000).toFixed(0)} m` : `${distanceKm.toFixed(1)} km`;

const formatTimestamp = (value: number) => new Date(value).toLocaleString();

const SORT_OPTIONS = [
  { value: "distance", label: "Length" },
  { value: "date", label: "Date" },
  { value: "title", label: "Title" },
] as const;

type ActivitySort = (typeof SORT_OPTIONS)[number]["value"];

const parseGpx = async (file: File): Promise<ParsedGpx> => {
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

  return { name, points, rawGpx: text };
};

const TrashIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={className}
    aria-hidden
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21.75H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79l-1.021-.166m15.477 0a48.108 48.108 0 0 0-3.478-.397m-12-.768A48.11 48.11 0 0 1 8.478 4.5m0 0L9.2 3.16A2.25 2.25 0 0 1 11.078 2.25h1.844A2.25 2.25 0 0 1 15.8 3.16l.723 1.34m-8.045 0a48.667 48.667 0 0 0 8.445 0"
    />
  </svg>
);

const EyeIcon = ({ className, hidden }: { className?: string; hidden?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={className}
    aria-hidden
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M1.458 12C2.732 7.943 6.523 5 11 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7s-8.268-2.943-9.542-7z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
    />
    {hidden ? (
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l14 16" />
    ) : null}
  </svg>
);

const GridMap = dynamic<GridMapProps>(
  () => import("../map/grid-map"),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-900/10" />,
  },
);

const isClerkFrontendEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const isStravaFrontendEnabled = process.env.NEXT_PUBLIC_STRAVA_ENABLED === "true";

const SIDEBAR_WIDTH_DEFAULT = 450;
const SIDEBAR_WIDTH_MIN = 280;
const SIDEBAR_WIDTH_MAX = 750;

const Dashboard = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedSport, setSelectedSport] = useState<Sport>(SPORT_OPTIONS[0].value);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [editingSportId, setEditingSportId] = useState<string | null>(null);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [stravaStatus, setStravaStatus] = useState<StravaStatusSummary | null>(null);
  const [stravaScope, setStravaScope] = useState<string | null>(null);
  const [isLoadingStravaStatus, setIsLoadingStravaStatus] = useState(true);
  const [isSyncingStrava, setIsSyncingStrava] = useState(false);
  const [stravaStatusError, setStravaStatusError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<ActivitySort>("date");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [groupBySport, setGroupBySport] = useState(false);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH_DEFAULT);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const deleteIntentTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const gridSize = DEFAULT_GRID_SIZE;

  useEffect(() => {
    let isMounted = true;
    const loadActivities = async () => {
      try {
        const response = await fetch("/api/activities");
        if (!response.ok) {
          throw new Error("Server returned an error");
        }
        const payload = (await response.json()) as { activities?: Activity[] };
        if (payload.activities && isMounted) {
          setActivities(
            payload.activities.map((activity) => ({
              ...activity,
              visible: activity.visible ?? true,
            })),
          );
        }
      } catch (error) {
        if (isMounted) {
          setMessage({
            text: `Unable to load stored activities. ${(error as Error).message}`,
            tone: "error",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoadingActivities(false);
        }
      }
    };

    loadActivities();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchStravaStatus = useCallback(async () => {
    if (!isStravaFrontendEnabled) {
      return;
    }

    setIsLoadingStravaStatus(true);
    setStravaStatusError(null);
    try {
      const response = await fetch("/api/strava/status");
      if (!response.ok) {
        throw new Error("Server returned an error");
      }
      const payload = (await response.json()) as {
        status?: StravaStatusSummary;
        scope?: string;
      };
      setStravaStatus(payload.status ?? null);
      setStravaScope(payload.scope ?? null);
    } catch (error) {
      setStravaStatus(null);
      setStravaStatusError((error as Error).message);
    } finally {
      setIsLoadingStravaStatus(false);
    }
  }, []);

  useEffect(() => {
    if (!isStravaFrontendEnabled) {
      return;
    }
    fetchStravaStatus();
  }, [fetchStravaStatus]);

  useEffect(() => {
    return () => {
      if (deleteIntentTimeout.current) {
        clearTimeout(deleteIntentTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSortMenuOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (!sortMenuRef.current) {
        return;
      }
      if (!sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isSortMenuOpen]);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!sidebarRef.current) {
        return;
      }

      const rect = sidebarRef.current.getBoundingClientRect();
      const nextWidth = event.clientX - rect.left;
      if (!Number.isFinite(nextWidth)) {
        return;
      }

      const clampedWidth = Math.min(
        Math.max(nextWidth, SIDEBAR_WIDTH_MIN),
        SIDEBAR_WIDTH_MAX,
      );
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [isResizingSidebar]);

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

  const sortedActivities = useMemo(() => {
    const list = [...activities];
    list.sort((a, b) => {
      if (sortMode === "distance") {
        return b.distanceKm - a.distanceKm;
      }
      if (sortMode === "title") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      return b.createdAt - a.createdAt;
    });
    return list;
  }, [activities, sortMode]);

  const groupedActivities = useMemo(() => {
    if (!groupBySport) {
      return [] as Array<{ sport: Sport; label: string; activities: Activity[] }>;
    }

    const perSportMap = new Map<Sport, Activity[]>();
    sortedActivities.forEach((activity) => {
      if (!perSportMap.has(activity.sport)) {
        perSportMap.set(activity.sport, []);
      }
      perSportMap.get(activity.sport)!.push(activity);
    });

    return SPORT_OPTIONS.filter((option) => perSportMap.has(option.value)).map((option) => ({
      sport: option.value,
      label: option.label,
      activities: perSportMap.get(option.value)!,
    }));
  }, [groupBySport, sortedActivities]);

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

  const handleZoomIn = () => {
    mapInstance?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstance?.zoomOut();
  };

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

  const handleGroupVisibilityToggle = (sport: Sport, exclusive: boolean) => {
    setActivities((prev) => {
      if (exclusive) {
        return prev.map((activity) => ({
          ...activity,
          visible: activity.sport === sport,
        }));
      }

      const groupActivities = prev.filter((activity) => activity.sport === sport);
      const groupAllVisible = groupActivities.every((activity) => activity.visible);

      return prev.map((activity) =>
        activity.sport === sport
          ? {
              ...activity,
              visible: !groupAllVisible,
            }
          : activity,
      );
    });
  };

  const handleSidebarResizeStart = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsResizingSidebar(true);
  };

  const handleGroupVisibilityClick = (sport: Sport, event: ReactMouseEvent<HTMLButtonElement>) => {
    const exclusive = event.ctrlKey || event.metaKey;
    event.preventDefault();
    event.stopPropagation();
    handleGroupVisibilityToggle(sport, exclusive);
  };

  const handleSortSelection = (value: ActivitySort) => {
    setSortMode(value);
    setIsSortMenuOpen(false);
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

  const resetDeleteIntent = () => {
    if (deleteIntentTimeout.current) {
      clearTimeout(deleteIntentTimeout.current);
      deleteIntentTimeout.current = null;
    }
    setPendingDeleteId(null);
  };

  const handleDeleteActivityRequest = async (activity: Activity) => {
    if (deletingActivityId && deletingActivityId !== activity.id) {
      return;
    }

    if (pendingDeleteId === activity.id) {
      setDeletingActivityId(activity.id);
      try {
        const response = await fetch(`/api/activities/${activity.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          let reason = "Unable to delete activity.";
          try {
            const payload = (await response.json()) as { error?: string };
            if (payload?.error) {
              reason = payload.error;
            }
          } catch {
            // Ignore JSON errors; handled via reason fallback.
          }
          throw new Error(reason);
        }

        setActivities((prev) => prev.filter((item) => item.id !== activity.id));
        setMessage({
          text: `"${activity.name}" deleted.`,
          tone: "success",
        });
      } catch (error) {
        setMessage({
          text: `Failed to delete activity: ${(error as Error).message}`,
          tone: "error",
        });
      } finally {
        setDeletingActivityId(null);
        resetDeleteIntent();
      }
      return;
    }

    if (deleteIntentTimeout.current) {
      clearTimeout(deleteIntentTimeout.current);
    }

    setPendingDeleteId(activity.id);
    deleteIntentTimeout.current = setTimeout(() => {
      setPendingDeleteId((current) => (current === activity.id ? null : current));
      deleteIntentTimeout.current = null;
    }, 2000);
  };

  const handleStravaConnect = () => {
    if (!isStravaFrontendEnabled) {
      return;
    }
    window.location.href = "/api/strava/authorize";
  };

  const handleStravaSync = async () => {
    if (!isStravaFrontendEnabled || isSyncingStrava) {
      return;
    }
    setIsSyncingStrava(true);
    try {
      const response = await fetch("/api/strava/sync", {
        method: "POST",
      });
      let payload: StravaSyncResponsePayload | null = null;
      try {
        payload = (await response.json()) as StravaSyncResponsePayload;
      } catch {
        // Response may not include JSON on failure; handled below.
      }

      if (!response.ok || !payload) {
        const reason = payload?.error ?? "Unable to sync from Strava.";
        throw new Error(reason);
      }

      const imported = payload.activities ?? [];
      if (imported.length) {
        setActivities((prev) => [...imported, ...prev]);
      }

      await fetchStravaStatus();

      const summary = payload.summary;
      const summaryText =
        summary && typeof summary.considered === "number"
          ? ` Checked ${summary.considered} activit${summary.considered === 1 ? "y" : "ies"}.`
          : "";

      setMessage({
        text: imported.length
          ? `Imported ${imported.length} Strava activit${imported.length === 1 ? "y" : "ies"}.${summaryText}`
          : `Strava sync completed but no new activities were available.${summaryText}`,
        tone: "success",
      });
    } catch (error) {
      setMessage({
        text: `Strava sync failed: ${(error as Error).message}`,
        tone: "error",
      });
    } finally {
      setIsSyncingStrava(false);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    const selectedFiles = files ? Array.from(files) : [];
    if (!selectedFiles.length || isUploading) {
      return;
    }

    const currentSport = selectedSport;
    const drafts: UploadDraft[] = [];
    const failures: string[] = [];

    await Promise.all(
      selectedFiles.map(async (file) => {
        try {
          const parsed = await parseGpx(file);
          if (parsed.points.length < 2) {
            throw new Error("This file does not contain enough coordinates.");
          }

          drafts.push({
            name: parsed.name,
            sport: currentSport,
            fileName: file.name,
            points: parsed.points,
            rawGpx: parsed.rawGpx,
          });
        } catch (error) {
          failures.push(`${file.name}: ${(error as Error).message}`);
        }
      }),
    );

    event.target.value = "";

    if (!drafts.length) {
      if (failures.length) {
        setMessage({
          text: `Some files could not be processed:\n${failures.join("\n")}`,
          tone: "error",
        });
      }
      return;
    }

    try {
      setIsUploading(true);
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ activities: drafts }),
      });

      let payload: StoreActivitiesResponsePayload | null = null;
      try {
        payload = (await response.json()) as StoreActivitiesResponsePayload;
      } catch {
        // Ignore JSON errors; handled below.
      }

      if (!response.ok || !payload?.activities) {
        const reason = payload?.error ?? "Unable to store activities.";
        throw new Error(reason);
      }

      setActivities((prev) => [...payload.activities!, ...prev]);

      const successText = `${payload.activities.length} activit${
        payload.activities.length === 1 ? "y" : "ies"
      } saved as ${getSportMeta(currentSport).label}.`;

      if (failures.length) {
        setMessage({
          text: `${successText}\nSome files could not be processed:\n${failures.join("\n")}`,
          tone: failures.length === selectedFiles.length ? "error" : "success",
        });
      } else {
        setMessage({
          text: successText,
          tone: "success",
        });
      }
    } catch (error) {
      setMessage({
        text: `Failed to save activities: ${(error as Error).message}`,
        tone: "error",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const hasActivities = activities.length > 0;

  const renderActivityItem = (activity: Activity) => {
    const meta = getSportMeta(activity.sport);
    const coveredCells = activityCellCounts[activity.id] ?? 0;
    const isEditingSport = editingSportId === activity.id;
    const isAwaitingDeleteConfirmation = pendingDeleteId === activity.id;
    const isDeletingActivity = deletingActivityId === activity.id;

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
            <span className="inline-flex items-center gap-1">
              • {coveredCells} cells
              <button
                type="button"
                onClick={() => handleDeleteActivityRequest(activity)}
                disabled={isDeletingActivity}
                aria-label={
                  isAwaitingDeleteConfirmation
                    ? "Click again to delete this activity"
                    : "Delete this activity"
                }
                title={
                  isAwaitingDeleteConfirmation
                    ? "Click again to delete this activity"
                    : "Delete this activity"
                }
                className={`rounded-full p-0.5 transition ${
                  isDeletingActivity
                    ? "cursor-wait text-slate-400 opacity-60"
                    : isAwaitingDeleteConfirmation
                      ? "bg-rose-50 text-rose-600"
                      : "text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                }`}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </span>
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
  };

  const renderSidebarContent = (onClose?: () => void) => {
    const activeSortLabel = SORT_OPTIONS.find((option) => option.value === sortMode)?.label ?? "Date";

    return (
      <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Activities</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={sortMenuRef}>
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={isSortMenuOpen}
                onClick={() => setIsSortMenuOpen((current) => !current)}
                className="cursor-pointer rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-white"
              >
                Sort: {activeSortLabel}
              </button>
              {isSortMenuOpen ? (
                <div className="absolute right-0 z-10 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSortSelection(option.value)}
                      className={`w-full rounded-lg px-2 py-1 text-left text-xs font-medium transition ${
                        option.value === sortMode
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setGroupBySport((current) => !current);
                setIsSortMenuOpen(false);
              }}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition ${
                groupBySport
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-600 hover:bg-white"
              }`}
            >
              {groupBySport ? "Ungroup" : "Group by type"}
            </button>
          </div>
          <button
            type="button"
            onClick={handleToggleAll}
            className="cursor-pointer rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-white"
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
              disabled={isUploading}
              className="block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center text-sm text-slate-500 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {isUploading ? (
              <p className="text-xs text-slate-500">Uploading and saving activities...</p>
            ) : null}
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
      {isStravaFrontendEnabled ? (
        <div className="mt-4 rounded-2xl border border-slate-100/70 bg-white/80 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Strava sync</p>
              <p
                className={`text-xs ${
                  stravaStatusError ? "text-rose-600" : "text-slate-500"
                }`}
              >
                {stravaStatusError
                  ? "Unable to load Strava status."
                  : isLoadingStravaStatus
                    ? "Checking your Strava connection..."
                    : !stravaStatus
                      ? "Connect Strava to import activities."
                      : !stravaStatus.configured
                        ? "Server missing Strava credentials."
                        : stravaStatus.connected
                          ? stravaStatus.athleteName
                            ? `Connected as ${stravaStatus.athleteName}`
                            : "Connected to Strava"
                          : "Connect your Strava account to import activities."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchStravaStatus()}
              disabled={isLoadingStravaStatus}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 transition hover:bg-white disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
          <p
            className={`mt-3 text-xs ${
              stravaStatusError ? "text-rose-600" : "text-slate-600"
            }`}
          >
            {stravaStatusError
              ? stravaStatusError
              : !stravaStatus
                ? "Authorize Strava to pull your recorded tracks directly into this dashboard."
                : !stravaStatus.configured
                  ? "Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REDIRECT_URI to enable syncing."
                  : stravaStatus.connected && stravaStatus.lastSync
                    ? `Last sync ${formatTimestamp(stravaStatus.lastSync.attemptedAt)} · Imported ${stravaStatus.lastSync.imported} of ${stravaStatus.lastSync.considered} checked.`
                    : stravaStatus.connected
                      ? "Strava connected. Run your first sync to copy recent activities."
                      : "Use the button below to connect Strava and import your GPX history."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {stravaStatus && stravaStatus.configured ? (
              stravaStatus.connected ? (
                <>
                  <button
                    type="button"
                    onClick={handleStravaSync}
                    disabled={isSyncingStrava}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {isSyncingStrava ? "Syncing..." : "Sync from Strava"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleStravaConnect}
                    disabled={isLoadingStravaStatus}
                    className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-400 disabled:opacity-60"
                  >
                    Connect Strava
                  </button>
                  <p className="text-[11px] text-slate-500">
                    Scope: {stravaScope ?? "activity:read_all"}
                  </p>
                </>
              )
            ) : (
              <p className="text-[11px] text-amber-600">
                Configure STRAVA_* environment variables to enable syncing.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1">
        {isLoadingActivities ? (
          <p className="rounded-2xl border border-slate-100/70 bg-white/80 p-4 text-sm text-slate-600">
            Loading stored activities...
          </p>
        ) : !hasActivities ? (
          <p className="rounded-2xl border border-slate-100/70 bg-white/80 p-4 text-sm text-slate-600">
            No activities yet. Choose a sport, upload one or more GPX files, and they will
            appear here with quick stats.
          </p>
        ) : groupBySport ? (
          <>
            {groupedActivities.map((group) => {
              const groupAllVisible = group.activities.every((activity) => activity.visible);
              const groupHasVisibleActivities = group.activities.some((activity) => activity.visible);
              const totalDistance = group.activities.reduce(
                (sum, activity) => sum + activity.distanceKm,
                0,
              );
              const groupCells = group.activities.reduce(
                (sum, activity) => sum + (activityCellCounts[activity.id] ?? 0),
                0,
              );
              const groupActivityLabel =
                group.activities.length === 1 ? "activity" : "activities";

              return (
                <div
                  key={group.sport}
                  className="space-y-2 rounded-2xl border border-slate-100/80 bg-white/70 p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{group.label}</p>
                      <p className="text-xs text-slate-500">
                        {group.activities.length} {groupActivityLabel} • {formatDistance(totalDistance)} • {groupCells} cells
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={!groupAllVisible}
                      onClick={(event) => handleGroupVisibilityClick(group.sport, event)}
                      className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        groupAllVisible
                          ? "border-slate-200 text-slate-600 hover:bg-white"
                          : "border-slate-200 text-slate-400 hover:text-slate-600"
                      }`}
                      title={`${groupAllVisible ? "Hide" : "Show"} ${group.label} activities. Ctrl+Click to show only this type.`}
                    >
                      <EyeIcon className="h-4 w-4" hidden={!groupAllVisible} />
                    </button>
                  </div>
                  {groupHasVisibleActivities ? (
                    <div className="space-y-3">
                      {group.activities.map((activity) => renderActivityItem(activity))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : (
          sortedActivities.map((activity) => renderActivityItem(activity))
        )}
      </div>
    </div>
  );
  };

  return (
    <div className="relative h-[100dvh] min-h-screen w-full overflow-hidden bg-slate-950">
      <div className="absolute inset-0 z-0">
        <GridMap
          activities={activities}
          cells={Array.from(visibleCells.values())}
          gridSize={gridSize}
          variant="full"
          onMapReady={setMapInstance}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        <div
          ref={sidebarRef}
          style={{ width: sidebarWidth }}
          className="pointer-events-auto absolute left-4 top-4 bottom-4 hidden lg:block"
        >
          <div className="relative h-full">
            <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/15 bg-white/95 p-5 shadow-2xl backdrop-blur">
              {renderSidebarContent()}
            </div>
            <button
              type="button"
              aria-label="Resize sidebar"
              title="Drag to resize sidebar"
              onMouseDown={handleSidebarResizeStart}
              className={`absolute top-1/2 -right-3 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-white/90 text-slate-500 shadow-lg backdrop-blur transition ${
                isResizingSidebar
                  ? "cursor-ew-resize border-emerald-200 bg-emerald-50"
                  : "cursor-ew-resize border-white/60 hover:border-white"
              }`}
            >
              <span className="h-6 w-0.5 rounded-full bg-slate-400" />
              <span className="ml-1 h-6 w-0.5 rounded-full bg-slate-400" />
            </button>
          </div>
        </div>

        <div className="pointer-events-auto absolute right-4 top-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowStatsModal(true)}
            className="cursor-pointer rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg backdrop-blur transition hover:bg-white"
          >
            View stats
          </button>
          <div className="flex overflow-hidden rounded-full border border-white/40 bg-white/90 text-slate-900 shadow-lg backdrop-blur">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={handleZoomIn}
              className="cursor-pointer px-3 py-2 text-sm font-semibold transition hover:bg-white"
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={handleZoomOut}
              className="cursor-pointer border-l border-white/40 px-3 py-2 text-sm font-semibold transition hover:bg-white"
            >
              -
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg backdrop-blur transition hover:bg-white lg:hidden"
          >
            Activities
          </button>
          {isClerkFrontendEnabled ? (
            <div className="rounded-full border border-white/40 bg-white/90 p-1 shadow-lg backdrop-blur">
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-10 w-10",
                  },
                }}
              />
            </div>
          ) : (
            <div className="rounded-full border border-white/40 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg backdrop-blur">
              Single-user mode
            </div>
          )}
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
