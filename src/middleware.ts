import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Deliberately does NOT import "@/auth": that pulls in the Drizzle/pg
// adapter and bcryptjs, neither of which run in the Edge runtime that
// middleware executes in. getToken() only needs AUTH_SECRET to verify the
// JWT session cookie, so it stays Edge-safe.
//
// Extend this list as more routes land under src/app/(app)/. The (app)
// layout also checks auth server-side as a defense-in-depth backstop.
const PROTECTED_PREFIXES = ["/dashboard", "/profile", "/capture", "/analyze"];

export async function middleware(req: NextRequest) {
  // Local-only escape hatch for manual testing without signing in. Never
  // set this outside a local .env — see CLAUDE.md.
  if (process.env.DEV_BYPASS_AUTH === "true") {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    req.nextUrl.pathname.startsWith(prefix),
  );
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  });

  if (!token) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/capture/:path*",
    "/analyze/:path*",
  ],
};
