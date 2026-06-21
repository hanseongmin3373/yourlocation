import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(self), camera=(), microphone=()",
  );

  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/admin") && !["GET", "PATCH", "DELETE"].includes(request.method)) {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*"],
};
