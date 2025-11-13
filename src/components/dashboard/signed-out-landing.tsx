"use client";

import { SignInButton } from "@clerk/nextjs";
import dynamic from "next/dynamic";

import type { GridMapProps } from "../map/grid-map";
import { DEFAULT_GRID_SIZE } from "../../lib/constants";

const GridMap = dynamic<GridMapProps>(
  () => import("../map/grid-map"),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-slate-900/20" />,
  },
);

const SignedOutLanding = () => (
  <div className="relative h-[100dvh] min-h-screen w-full overflow-hidden bg-slate-950">
    <div className="absolute inset-0">
      <GridMap activities={[]} cells={[]} gridSize={DEFAULT_GRID_SIZE} variant="full" />
    </div>
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 px-4 text-center text-white backdrop-blur">
      <div className="max-w-md space-y-4 rounded-3xl border border-white/20 bg-black/40 p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          GPX Grid Challenge
        </p>
        <h1 className="text-3xl font-bold">Sign in to start filling the map</h1>
        <p className="text-sm text-white/80">
          Authentication is powered by Clerk. Sign in to access the map, upload GPX files, and
          watch the OpenStreetMap grid fill up live. All parsing happens in your browser.
        </p>
        <SignInButton mode="modal">
          <button className="w-full rounded-full bg-white/90 px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-white">
            Sign in to continue
          </button>
        </SignInButton>
      </div>
    </div>
  </div>
);

export default SignedOutLanding;
