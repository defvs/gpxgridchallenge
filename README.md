<p align="center">
  <img src="gpxgridchallenge.png" alt="GPX Grid Challenge icon" width="96">
</p>

# GPX Grid Challenge

Chase every map tile you have ever crossed. GPX Grid Challenge is a Next.js dashboard where you upload GPX tracks, tag them per sport, and watch an OpenStreetMap overlay fill up as you explore.

## Highlights

- Upload individual or bulk GPX files, categorize them per sport, and watch the live grid re-color as you toggle each activity.
- Adjustable dashboard layout with a resizable sidebar so you can prioritize the map or statistics panel.
- Activity list sorting/grouping plus quick map controls for hiding, highlighting, or zooming to any track.
- Optional Clerk auth: configure it for multi-user dashboards or skip it for instant single-user mode.
- Strava sync via OAuth to import your latest efforts without manually exporting GPX files.
- Offline-friendly local storage keeps imported activities available between sessions.

## Quick Start

1. Ensure you have Node.js 18.18+ and `pnpm`.
2. Copy the sample environment file and provide your keys from the [Clerk dashboard](https://clerk.com/) (and/or optional Strava app). If you skip the Clerk keys the app runs in single-user mode using the storage id below.

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Purpose |
   | --- | --- |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser key required by Clerk |
   | `CLERK_SECRET_KEY` | Server-side Clerk key used by middleware and API routes |
   | `DEV_STORAGE_USER_ID` (optional) | Storage folder for single-user mode (defaults to `dev-user`) |
   | `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | OAuth credentials for Strava syncing |
   | `STRAVA_REDIRECT_URI` | Redirect URL registered in Strava (e.g. `http://localhost:3000/strava/callback`) |
   | `STRAVA_SCOPE` (optional) | Override the default `read,activity:read_all` scopes |

   The Strava section in the dashboard only appears when the three required `STRAVA_*` variables above are configured.

3. Install and run the dev server:

   ```bash
   pnpm install
   pnpm dev
   ```

4. Visit [http://localhost:3000](http://localhost:3000), sign in with your Clerk user, or simply start uploading `.gpx` files if Clerk is disabled.

## Strava Sync (optional)

1. Create an application at [Strava](https://www.strava.com/settings/api) with your local redirect URL.
2. Fill in the Strava environment variables described above and restart `pnpm dev` so they are picked up.
3. Connect your account from the "Strava sync" card in the dashboard to pull recent activities; duplicates are ignored automatically.
