import { NextResponse } from "next/server";

import { getRequiredStravaScope, getStravaStatus } from "../../../../server/strava";
import { resolveUserId, unauthorized } from "../../activities/helpers";

export const GET = async () => {
  const userId = await resolveUserId();
  if (!userId) {
    return unauthorized();
  }

  try {
    const status = await getStravaStatus(userId);
    return NextResponse.json({
      status,
      scope: getRequiredStravaScope(),
    });
  } catch (error) {
    console.error("Failed to load Strava status", error);
    return NextResponse.json({ error: "Unable to load Strava status" }, { status: 500 });
  }
};
