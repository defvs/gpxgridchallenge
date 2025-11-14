import { NextResponse } from "next/server";

import { exchangeStravaCode } from "../../../../server/strava";
import { invalid, resolveUserId, unauthorized } from "../../activities/helpers";

interface ExchangePayload {
  code?: unknown;
  state?: unknown;
}

export const POST = async (request: Request) => {
  const userId = await resolveUserId();
  if (!userId) {
    return unauthorized();
  }

  let payload: ExchangePayload;
  try {
    payload = (await request.json()) as ExchangePayload;
  } catch {
    return invalid("Invalid JSON payload");
  }

  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  if (!code) {
    return invalid("Missing authorization code");
  }

  const state = typeof payload.state === "string" ? payload.state.trim() : null;

  try {
    await exchangeStravaCode(userId, code, state);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to exchange Strava authorization code", error);
    return NextResponse.json(
      { error: (error as Error).message ?? "Unable to connect to Strava" },
      { status: 500 },
    );
  }
};
