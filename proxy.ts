import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no session cookie → straight to /login. The API enforces the real
// session and permissions on every request, so a stale or forged cookie still gets nothing.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("mcl_session")) {
    // Back to the page asked for after signing in (login checks it is one of this site's pages the role may open).
    const login = new URL("/login", request.url);
    const { pathname, search } = request.nextUrl;
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the auth screens, the API rewrite, Next internals and static files.
  matcher: ["/((?!login|forgot-password|api|_next|favicon.ico|icons|img).*)"],
};
