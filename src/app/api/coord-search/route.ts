import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { parseCoordinates } from "@/lib/coord-validation";
import { lookupCoordinates } from "@/lib/coord-search";
import { getClientIp } from "@/lib/client-ip";
import { assertQueryAllowed, recordQuery } from "@/lib/query-access";
import type { GeoApiResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const latParam = request.nextUrl.searchParams.get("lat");
  const lonParam = request.nextUrl.searchParams.get("lon");

  let lat: number | null = null;
  let lon: number | null = null;

  if (latParam != null && lonParam != null) {
    lat = Number(latParam);
    lon = Number(lonParam);
  } else if (q) {
    const parsed = parseCoordinates(q);
    if (parsed) {
      lat = parsed.lat;
      lon = parsed.lon;
    }
  }

  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json<GeoApiResponse>(
      {
        success: false,
        error: "위도·경도 형식이 올바르지 않습니다. 예: 37.4957, 126.9526",
      },
      { status: 400 },
    );
  }

  try {
    const user = await getSessionUser();
    const clientIp = getClientIp(request.headers);
    const access = await assertQueryAllowed(user, clientIp);

    if (!access.allowed) {
      return NextResponse.json<GeoApiResponse>(
        { success: false, error: access.error },
        { status: 429 },
      );
    }

    const data = await lookupCoordinates(lat, lon);
    const recorded = await recordQuery({
      user,
      ip: clientIp,
      queryType: "coord_search",
      queryValue: `${lat},${lon}`,
      resultAddress: data.address,
    });

    return NextResponse.json({
      success: true,
      data,
      remaining: recorded.remaining ?? access.remaining,
      isMember: access.isMember,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "좌표 검색에 실패했습니다.";
    return NextResponse.json<GeoApiResponse>(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
