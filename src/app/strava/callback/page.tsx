"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type StatusVariant = "pending" | "success" | "error";
type ExchangeResponse = { error?: string };

const StatusBadge = ({ status }: { status: StatusVariant }) => {
  if (status === "success") {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Connected
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700">
        Error
      </span>
    );
  }

  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
      Connecting
    </span>
  );
};

const StravaCallbackLayout = ({ status, message }: { status: StatusVariant; message: string }) => (
  <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16">
    <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/95 p-8 text-center shadow-2xl">
      <StatusBadge status={status} />
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">
        {status === "success"
          ? "All set!"
          : status === "error"
            ? "Something went wrong"
            : "Finishing up..."}
      </h1>
      <p className={`mt-4 text-sm ${status === "error" ? "text-rose-600" : "text-slate-600"}`}>
        {message}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white"
        >
          Back to dashboard
        </Link>
        {status === "error" ? (
          <a
            href="/api/strava/authorize"
            className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-400"
          >
            Try again
          </a>
        ) : null}
      </div>
    </div>
  </main>
);

const StravaCallbackContent = () => {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<StatusVariant>("pending");
  const [message, setMessage] = useState("Completing Strava authorization...");

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (errorCode) {
      setStatus("error");
      setMessage("Strava reported an error. Please try connecting again.");
      return;
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code) {
      setStatus("error");
      setMessage("Missing authorization code.");
      return;
    }

    const connect = async () => {
      try {
        const response = await fetch("/api/strava/exchange", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code, state }),
        });

        let payload: ExchangeResponse | null = null;
        try {
          payload = (await response.json()) as ExchangeResponse;
        } catch {
          // Ignore JSON errors; handled via status below.
        }

        if (!response.ok) {
          const reason = payload?.error ?? "Unable to finish Strava authorization.";
          throw new Error(reason);
        }

        setStatus("success");
        setMessage("Strava account connected. You can return to the dashboard and run a sync.");
      } catch (error) {
        setStatus("error");
        setMessage(`Unable to complete Strava connection: ${(error as Error).message}`);
      }
    };

    connect();
  }, [searchParams]);

  return <StravaCallbackLayout status={status} message={message} />;
};

const StravaCallbackPage = () => (
  <Suspense fallback={<StravaCallbackLayout status="pending" message="Completing Strava authorization..." />}>
    <StravaCallbackContent />
  </Suspense>
);

export default StravaCallbackPage;
