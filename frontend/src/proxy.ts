import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic check only: the Django API enforces real authorisation on every call.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("reskure_token") && request.cookies.has("reskure_tenant");
  const onLogin = request.nextUrl.pathname === "/login";
  if (!hasSession && !onLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (hasSession && onLogin) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
