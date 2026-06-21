import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { normalizeIp } from "@/lib/client-ip";
import { assertQueryAllowed, recordQuery } from "@/lib/query-access";
import {
  checkDistinctIpLookupBurst,
  checkGeoLookupRateLimit,
} from "@/lib/rate-limit";
import { getClientIp, isValidIp, lookupIp } from "@/lib/geo";
import type { GeoApiResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const ip = request.nextUrl.searchParams.get("ip");

  if (!ip) {
    return NextResponse.json<GeoApiResponse>(
      { success: false, error: "IP 주소를 입력해주세요." },
      { status: 400 },
    );
  }

  const trimmedIp = ip.trim();

  if (!isValidIp(trimmedIp)) {
    return NextResponse.json<GeoApiResponse>(
      { success: false, error: "올바른 IP 주소 형식이 아닙니다." },
      { status: 400 },
    );
  }

  try {
    const clientIp = getClientIp(request.headers);
    const rl = checkGeoLookupRateLimit(clientIp);
    if (!rl.allowed) {
      return NextResponse.json<GeoApiResponse>(
        {
          success: false,
          error: `요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해 주세요.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        },
      );
    }

    const burst = checkDistinctIpLookupBurst(clientIp, normalizeIp(trimmedIp));
    if (!burst.allowed) {
      return NextResponse.json<GeoApiResponse>(
        {
          success: false,
          error:
            "짧은 시간에 너무 많은 IP를 조회했습니다. 잠시 후 다시 시도해 주세요.",
        },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    const user = await getSessionUser();
    const [access, data] = await Promise.all([
      assertQueryAllowed(user, clientIp),
      lookupIp(trimmedIp),
    ]);

    if (!access.allowed) {
      return NextResponse.json<GeoApiResponse>(
        { success: false, error: access.error },
        { status: 429 },
      );
    }

    data.ip = normalizeIp(trimmedIp);

    void recordQuery({
      user,
      ip: clientIp,
      queryType: "ip_lookup",
      queryValue: trimmedIp,
      resultAddress: data.address,
    }).catch(() => {});

    const remaining =
      access.remaining != null ? Math.max(0, access.remaining - 1) : null;

    return NextResponse.json(
      {
        success: true,
        data,
        remaining,
        isMember: access.isMember,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "IP 조회에 실패했습니다.";
    return NextResponse.json<GeoApiResponse>(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
