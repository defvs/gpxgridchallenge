import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isClerkConfigured } from "./lib/auth-config";

const publicRoutes = ["/"] as const;

const middleware = isClerkConfigured
  ? clerkMiddleware({ publicRoutes })
  : () => NextResponse.next();

export default middleware;

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};
