import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];
const ADMIN_PAGE_PATHS = ["/users"];
const ADMIN_API_PATHS = ["/api/users", "/api/settings/reset"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    // Redirect authenticated users away from /login
    if (pathname === "/login") {
      const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (token && (await verifySessionToken(token))) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    ADMIN_API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !canManageUsers(session.role)
  ) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  if (
    ADMIN_PAGE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !canManageUsers(session.role)
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
