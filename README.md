# GPX Grid Challenge

A Next.js (App Router) playground for chasing grid coverage on top of OpenStreetMap. Upload GPX tracks, categorize them per sport, and watch the grid fill up. Built with Tailwind CSS, Clerk authentication, and React Leaflet.

## Features

- **Clerk authentication** with protected routes, modal sign-in, and user dropdown.
- **OpenStreetMap canvas** rendered with `react-leaflet`, including live grid lines and highlighted cells for every GPX the user shows.
- **GPX ingestion** in the browser – parsing is done client-side to avoid uploading raw files elsewhere.
- **Multi-sport management** (walking, hiking, multiple ski disciplines, and three cycling types) with per-sport statistics.
- **Responsive dashboard** containing a sidebar for activities, grid controls, map, and statistics panel.

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

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Run the dev server:

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) and sign in with your Clerk user. Upload one or multiple `.gpx` files, choose the sport category, and adjust the grid size. The map automatically colors every cell visited by the activities you keep visible.

## Tech Stack Highlights

- **Next.js 16 App Router** with TypeScript + Tailwind CSS v4.
- **Clerk** middleware + React components to keep the dashboard behind a login.
- **React Leaflet & Leaflet** for map rendering and vector overlays.
- **Local GPX parsing** using the browser `DOMParser` for tracks and routes.

## Future Ideas

- Persist activities in a database keyed by Clerk user IDs.
- Add shareable heatmaps or challenge leaderboards.
- Support FIT/TCX uploads and auto sport detection.
