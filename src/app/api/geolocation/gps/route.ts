import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertQueryAllowed, recordQuery } from "@/lib/query-access";
import { getClientIp } from "@/lib/geo";
import { resolveAddressFromCoords } from "@/lib/kakao-geocode";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { lat?: number; lng?: number };
    const lat = body.lat;
    const lng = body.lng;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json(
        { success: false, error: "위도와 경도가 필요합니다." },
        { status: 400 },
      );
    }

    const user = await getSessionUser();
    const clientIp = getClientIp(request.headers);
    const access = await assertQueryAllowed(user?.id ?? null, clientIp);

    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: 429 },
      );
    }

    const detail = await resolveAddressFromCoords(lat, lng);
    const address =
      detail?.full || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    const recorded = await recordQuery({
      userId: user?.id ?? null,
      ip: clientIp,
      queryType: "gps_lookup",
      queryValue: `${lat.toFixed(6)},${lng.toFixed(6)}`,
      resultAddress: address,
    });

    return NextResponse.json({
      success: true,
      address,
      dong: detail?.dong ?? "",
      sigungu: detail?.sigungu ?? "",
      sido: detail?.sido ?? "",
      remaining: recorded.remaining ?? access.remaining,
      isMember: access.isMember,
    });
  } catch (error) {
    console.error("gps lookup error", error);
    return NextResponse.json(
      { success: false, error: "GPS 위치 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
