<p align="center">
  <img src="gpxgridchallenge.png" alt="GPX Grid Challenge icon" width="96">
</p>

# GPX Grid Challenge

Chase every map tile you have ever crossed. GPX Grid Challenge is a Next.js dashboard where you upload GPX tracks, tag them per sport, and watch an OpenStreetMap overlay fill up as you explore.

## Highlights

- Upload individual or bulk GPX files, categorize them per sport, and watch the live grid re-color as you toggle each activity.
- Adjustable dashboard layout with a resizable sidebar so you can prioritize the map or statistics panel.
- Activity list sorting/grouping plus quick map controls for hiding, highlighting, or zooming to any track.
- Signed-out landing page that previews the challenge before you authenticate with Clerk.
- Strava sync via OAuth to import your latest efforts without manually exporting GPX files.
- Offline-friendly local storage keeps imported activities available between sessions.

## Quick Start

1. Ensure you have Node.js 18.18+ and `pnpm`.
2. Copy the sample environment file and provide your keys from the [Clerk dashboard](https://clerk.com/) (and optional Strava app):

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Purpose |
   | --- | --- |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser key required by Clerk |
   | `CLERK_SECRET_KEY` | Server-side Clerk key used by middleware and API routes |
   | `DEV_STORAGE_USER_ID` (optional) | Static user id for local development when skipping Clerk UI |
   | `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | OAuth credentials for Strava syncing |
   | `STRAVA_REDIRECT_URI` | Redirect URL registered in Strava (e.g. `http://localhost:3000/strava/callback`) |
   | `STRAVA_SCOPE` (optional) | Override the default `read,activity:read_all` scopes |

3. Install and run the dev server:

   ```bash
   pnpm install
   pnpm dev
   ```

4. Visit [http://localhost:3000](http://localhost:3000), sign in with your Clerk user (or the dev storage id), drop in `.gpx` files, and resize the layout while monitoring grid coverage.

## Strava Sync (optional)

1. Create an application at [Strava](https://www.strava.com/settings/api) with your local redirect URL.
2. Fill in the Strava environment variables described above and restart `pnpm dev` so they are picked up.
3. Connect your account from the "Strava sync" card in the dashboard to pull recent activities; duplicates are ignored automatically.

## Future Ideas

- Persist activity history in a hosted database keyed by Clerk users.
- Share grid progress via public profiles or leaderboards.
- Accept FIT/TCX uploads with automatic sport detection.
