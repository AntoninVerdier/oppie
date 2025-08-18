import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    const host = req.headers.get("host") || "";
    // Normalize dev access to localhost to avoid dev HMR cross-origin/cache issues
    if (host.startsWith("127.0.0.1")) {
      const url = req.nextUrl.clone();
      const port = url.port || "3000";
      url.hostname = "localhost";
      url.host = `localhost:${port}`;
      return NextResponse.redirect(url);
    }
  }
  const url = req.nextUrl;
  // Allow public auth + login page
  if (url.pathname === '/login' || url.pathname.startsWith('/api/auth/')) return NextResponse.next();
  if (url.pathname.startsWith('/_next') || url.pathname.startsWith('/favicon') ) return NextResponse.next();
  if (url.pathname === '/manifest.json' || url.pathname.startsWith('/apple-touch-') || url.pathname.startsWith('/icon')) return NextResponse.next();
  // Check cookie
  const cookie = req.cookies.get('oppie_session')?.value || '';
  // Edge runtime: cannot access fs; perform lightweight presence check only.
  if (!cookie) {
    if (url.pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' }});
    }
    // Avoid redirect loop
    if (url.pathname !== '/login') {
      const loginUrl = new URL('/login', req.url);
      if (!loginUrl.searchParams.has('next')) {
        loginUrl.searchParams.set('next', url.pathname + url.search);
      }
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude static assets and Next internal paths
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};


