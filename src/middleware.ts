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
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/capture",
  "/analyze",
  "/entries",
  "/insights",
  "/export",
  "/admin",
];

// The S3-compatible object store is a different origin than the app
// (MinIO locally, real S3/a CDN in prod) — presigned URLs for meal photos
// and generated exports are fetched directly from it, so CSP needs to
// allow it explicitly rather than relying on 'self'.
function getStorageOrigin(): string | null {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return null;
  try {
    return new URL(endpoint).origin;
  } catch {
    return null;
  }
}

/**
 * Nonce-based CSP, per Next.js's own documented recipe: a per-request
 * nonce is forwarded to Server Components via the x-nonce request header
 * (for any future hand-authored inline <script>, though this app has
 * none today) and Next auto-applies the same nonce to its own hydration
 * scripts once it sees a matching CSP response header — no other wiring
 * needed on the page side.
 */
function buildCsp(nonce: string): string {
  const storageOrigin = getStorageOrigin();
  const storageOriginPart = storageOrigin ? ` ${storageOrigin}` : "";
  // Next's dev server (HMR/fast refresh) runs itself through eval() — only
  // a production build can go without 'unsafe-eval'. This is Next's own
  // documented CSP caveat, not a gap specific to this app.
  const scriptSrc =
    process.env.NODE_ENV === "production"
      ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`, // Tailwind emits static CSS, but some browser UI (date/color pickers) injects inline style attributes
    `img-src 'self' blob: data:${storageOriginPart}`,
    `connect-src 'self'${storageOriginPart}`,
    `font-src 'self' data:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join("; ");
}

export async function middleware(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  function withSecurityHeaders(response: NextResponse): NextResponse {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const passThrough = () =>
    withSecurityHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
    );

  // Local-only escape hatch for manual testing without signing in. Never
  // set this outside a local .env — see CLAUDE.md.
  if (process.env.DEV_BYPASS_AUTH === "true") {
    return passThrough();
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    req.nextUrl.pathname.startsWith(prefix),
  );
  if (!isProtected) {
    return passThrough();
  }

  // Must match Auth.js core's own default exactly (@auth/core's init.js:
  // `config.useSecureCookies ?? url.protocol === "https:"`), which our
  // src/auth.ts config doesn't override — not NODE_ENV. Auth.js sets the
  // `__Secure-`-prefixed cookie name only when the *request* is actually
  // HTTPS; keying this off NODE_ENV instead breaks login the moment a
  // production build is served over plain HTTP (a real deployment shape,
  // e.g. TLS terminated upstream without forwarded-proto handling, and
  // also how the local 4G perf harness runs `next start`) — found by
  // that harness failing this exact way during the Phase 10 pass.
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: req.nextUrl.protocol === "https:",
  });

  if (!token) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return passThrough();
}

export const config = {
  matcher: [
    // Run on every route except static assets and image optimization
    // output — CSP/security headers apply site-wide, not just protected
    // pages (those still get their own auth check inside the function).
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
