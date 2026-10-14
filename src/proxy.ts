// First lock: everything except the public form, its submit API and /login
// requires the admin session cookie. Pages redirect to /login; APIs get 404.

import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, authBypassed, verifyToken } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/login" ||
    path === "/apply" ||
    path.startsWith("/apply/") ||
    path.startsWith("/api/apply/");
  if (isPublic || authBypassed()) return NextResponse.next();

  if (await verifyToken(request.cookies.get(COOKIE)?.value)) return NextResponse.next();

  if (path.startsWith("/api/")) return new NextResponse(null, { status: 404 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
