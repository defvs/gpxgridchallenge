import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export const invalid = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

export const resolveUserId = () => {
  const { userId } = auth();
  if (userId) {
    return userId;
  }

  if (process.env.NODE_ENV !== "production") {
    return process.env.DEV_STORAGE_USER_ID ?? "dev-user";
  }

  return null;
};
