import { NextResponse } from "next/server";

import { buildAuthorizeUrl, isStravaConfigured } from "../../../../server/strava";
import { resolveUserId, unauthorized } from "../../activities/helpers";

export const GET = async () => {
  const userId = resolveUserId();
  if (!userId) {
    return unauthorized();
  }

  if (!isStravaConfigured()) {
    return NextResponse.json({ error: "Strava is not configured on this server." }, { status: 503 });
  }

  try {
    const authorizeUrl = await buildAuthorizeUrl(userId);
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error("Failed to build Strava authorization URL", error);
    return NextResponse.json({ error: "Unable to start Strava authorization" }, { status: 500 });
  }
};
