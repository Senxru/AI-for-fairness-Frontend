import { NextRequest, NextResponse } from "next/server";

function isProtectedPath(pathname: string) {
  return pathname.startsWith("/judge/dashboard") || pathname.startsWith("/court-authority/dashboard");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const token = req.cookies.get("auth_token")?.value;
  const role = req.cookies.get("auth_role")?.value;

  if (!token || !role) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith("/judge/") ? "/judge/login" : "/court-authority/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/judge/") && role !== "judge") {
    const url = req.nextUrl.clone();
    url.pathname = "/judge/login";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/court-authority/") && role !== "court_authority") {
    const url = req.nextUrl.clone();
    url.pathname = "/court-authority/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/judge/dashboard/:path*", "/court-authority/dashboard/:path*"],
};

