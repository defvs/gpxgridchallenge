import { NextResponse } from "next/server";

import { deleteActivity } from "../../../../server/activity-storage";
import { resolveUserId, unauthorized } from "../helpers";

interface Params {
  id?: string;
}

export const DELETE = async (
  _request: Request,
  context: { params: Promise<Params> },
) => {
  const userId = resolveUserId();
  if (!userId) {
    return unauthorized();
  }

  const { id: rawId } = await context.params;
  const id = rawId?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing activity id" }, { status: 400 });
  }

  try {
    const removed = await deleteActivity(userId, id);
    if (!removed) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Failed to delete activity ${id}`, error);
    return NextResponse.json({ error: "Unable to delete activity" }, { status: 500 });
  }
};
