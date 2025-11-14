import type { NextConfig } from "next";

const hasStravaEnv = Boolean(
  process.env.STRAVA_CLIENT_ID &&
    process.env.STRAVA_CLIENT_SECRET &&
    process.env.STRAVA_REDIRECT_URI,
);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_STRAVA_ENABLED: hasStravaEnv ? "true" : "false",
  },
};

export default nextConfig;
