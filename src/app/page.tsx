import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

import Dashboard from "../components/dashboard/dashboard";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 pb-12 pt-10 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            GPX Grid Challenge
          </p>
          <h1 className="text-xl font-bold text-slate-900">
            Color every square you touch
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton appearance={{ elements: { avatarBox: "h-10 w-10" } }} />
          </SignedIn>
        </div>
      </header>
      <SignedOut>
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">
            Upload GPX files once you sign in
          </h2>
          <p className="mt-3 text-slate-600">
            Authentication is powered by Clerk. Sign in to access the map,
            upload your GPX activities, and start filling the OpenStreetMap grid.
            All parsing happens locally in your browser.
          </p>
          <div className="mt-6">
            <SignInButton mode="modal">
              <button className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                Sign in to continue
              </button>
            </SignInButton>
          </div>
        </section>
      </SignedOut>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </main>
  );
}
