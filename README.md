# GPX Grid Challenge

A Next.js (App Router) playground for chasing grid coverage on top of OpenStreetMap. Upload GPX tracks, categorize them per sport, and watch the grid fill up. Built with Tailwind CSS, Clerk authentication, and React Leaflet.

## Features

- **Clerk authentication** with protected routes, modal sign-in, and user dropdown.
- **OpenStreetMap canvas** rendered with `react-leaflet`, including live grid lines and highlighted cells for every GPX the user shows.
- **GPX ingestion** in the browser – parsing is done client-side to avoid uploading raw files elsewhere.
- **Multi-sport management** (walking, hiking, multiple ski disciplines, and three cycling types) with per-sport statistics.
- **Responsive dashboard** containing a sidebar for activities, grid controls, map, and statistics panel.
- **Strava sync** via OAuth to pull recent activities directly into the local storage backend.

## Prerequisites

- Node.js 18.18+ (Next.js 16 requirement).
- `pnpm` (the repo already uses the lockfile); `npm`/`yarn` will also work if you prefer manually updating scripts.
- A Clerk project with publishable + secret keys.

## Environment Setup

1. Copy the sample environment file and fill in your keys from the [Clerk dashboard](https://clerk.com/):

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Description |
   | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public key used by the browser bundle |
| `CLERK_SECRET_KEY` | Secret key used by Next.js middleware/server components |
| `DEV_STORAGE_USER_ID` (optional) | Static user id for local testing if you want to skip Clerk sign-in |
| `STRAVA_CLIENT_ID` (optional) | Strava app client id to enable Strava syncing |
| `STRAVA_CLIENT_SECRET` (optional) | Strava client secret counterpart |
| `STRAVA_REDIRECT_URI` (optional) | Redirect URI configured in the Strava app (e.g. `http://localhost:3000/strava/callback`) |
| `STRAVA_SCOPE` (optional) | Override the Strava scopes if you need something besides `read,activity:read_all` |

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Run the dev server:

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) and sign in with your Clerk user. Upload one or multiple `.gpx` files, choose the sport category, and adjust the grid size. The map automatically colors every cell visited by the activities you keep visible.

## Strava Sync (optional)

If you want to pull activities from Strava instead of uploading GPX files manually:

1. Create an API application in the [Strava dashboard](https://www.strava.com/settings/api) and set the callback/redirect URL to your `STRAVA_REDIRECT_URI` (for local dev the sample `.env` uses `http://localhost:3000/strava/callback`).
2. Copy the client id/secret into `.env.local` (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, and optionally `STRAVA_SCOPE`).
3. Restart the dev server so the new environment variables load.
4. Open the dashboard and use the "Strava sync" card to connect your account and import recent activities. The sync endpoint keeps track of previously imported activity ids to avoid duplicates.

## Tech Stack Highlights

- **Next.js 16 App Router** with TypeScript + Tailwind CSS v4.
- **Clerk** middleware + React components to keep the dashboard behind a login.
- **React Leaflet & Leaflet** for map rendering and vector overlays.
- **Local GPX parsing** using the browser `DOMParser` for tracks and routes.

## Future Ideas

- Persist activities in a database keyed by Clerk user IDs.
- Add shareable heatmaps or challenge leaderboards.
- Support FIT/TCX uploads and auto sport detection.
