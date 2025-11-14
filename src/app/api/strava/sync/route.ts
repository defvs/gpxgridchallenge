import { NextResponse } from "next/server";

import { syncStravaActivities } from "../../../../server/strava";
import { resolveUserId, unauthorized } from "../../activities/helpers";
import { toActivityResponse } from "../../activities/to-activity-response";

export const POST = async () => {
  const userId = resolveUserId();
  if (!userId) {
    return unauthorized();
  }

  try {
    const { imported, summary } = await syncStravaActivities(userId);
    return NextResponse.json({
      activities: imported.map(toActivityResponse),
      summary,
    });
  } catch (error) {
    console.error("Failed to sync Strava activities", error);
    const message = (error as Error).message ?? "Unable to sync from Strava";
    const isConnectionIssue = message.toLowerCase().includes("not connected");
    return NextResponse.json(
      { error: message },
      { status: isConnectionIssue ? 400 : 500 },
    );
  }
};
