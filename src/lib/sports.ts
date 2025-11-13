export const SPORT_OPTIONS = [
  { value: "walking", label: "Walking / Running", color: "#0ea5e9" },
  { value: "hiking", label: "Hiking", color: "#f97316" },
  { value: "alpine-ski", label: "Alpine Ski", color: "#6366f1" },
  { value: "nordic-ski", label: "Nordic Ski", color: "#a855f7" },
  { value: "touring-ski", label: "Ski Touring", color: "#14b8a6" },
  { value: "road-cycling", label: "Road Cycling", color: "#ef4444" },
  { value: "gravel-cycling", label: "Gravel Cycling", color: "#84cc16" },
  { value: "mountain-cycling", label: "Mountain Cycling", color: "#22d3ee" },
] as const;

export type Sport = (typeof SPORT_OPTIONS)[number]["value"];

export const getSportMeta = (sport: Sport) =>
  SPORT_OPTIONS.find((entry) => entry.value === sport) ?? SPORT_OPTIONS[0];
