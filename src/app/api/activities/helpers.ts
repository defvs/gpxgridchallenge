import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isClerkConfigured, singleUserId } from "../../../lib/auth-config";

export const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export const invalid = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

export const resolveUserId = async (): Promise<string | null> => {
  if (!isClerkConfigured) {
    return singleUserId;
  }

  const { userId } = await auth();
  if (userId) {
    return userId;
  }

  if (process.env.NODE_ENV !== "production") {
    return singleUserId;
  }

  return null;
};
