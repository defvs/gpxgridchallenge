import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isClerkConfigured } from "./lib/auth-config";

const isPublicRoute = createRouteMatcher(["/"]);

const middleware = isClerkConfigured
  ? clerkMiddleware((auth, request) => {
      if (!isPublicRoute(request)) {
        auth.protect();
      }
    })
  : () => NextResponse.next();

export default middleware;

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};
