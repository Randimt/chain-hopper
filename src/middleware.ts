import { NextRequest, NextResponse } from "next/server";

// Hostname-based routing:
// - app.lyxsa.xyz       → rewrite "/" to "/dashboard" (skip landing, app entry)
// - lyxsa.xyz / www     → keep landing at "/"
// - chain-hopper.*.dev  → keep landing at "/" (backup URL preserves old behavior)
// - localhost           → keep landing at "/" (dev experience)
//
// Other paths (/bridge, /batch, /history, /recipes, /dashboard, etc.) pass
// through unchanged — they always work the same on every host.

const APP_HOST = "app.lyxsa.xyz";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  const { pathname, search } = req.nextUrl;

  // Only rewrite the root path. Everything else (e.g. /dashboard, /bridge,
  // /batch) flows normally so deep links keep working on every domain.
  if (pathname === "/" && host.startsWith(APP_HOST)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    if (search) url.search = search;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

// Match only what we need — root path. Avoids running middleware on every
// asset request which keeps Workers cold-start fast.
export const config = {
  matcher: ["/"],
};
