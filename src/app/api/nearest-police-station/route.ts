import { NextRequest, NextResponse } from "next/server";
import { resolveAddressFromCoords } from "@/lib/kakao-geocode";
import { findPoliceForLocation, policeDbMeta } from "@/lib/police-db";

export const dynamic = "force-dynamic";

/** IP/GPS 좌표 → 경찰청 [별표2] PDF 관할구역 · 최근접 관서 */
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(
    request.nextUrl.searchParams.get("lng") ??
      request.nextUrl.searchParams.get("lon"),
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { success: false, error: "위도와 경도가 필요합니다." },
      { status: 400 },
    );
  }

  let sido = request.nextUrl.searchParams.get("sido") ?? undefined;
  let sigungu = request.nextUrl.searchParams.get("sigungu") ?? undefined;
  let dong = request.nextUrl.searchParams.get("dong") ?? undefined;

  if (!dong || !sigungu) {
    const geo = await resolveAddressFromCoords(lat, lng);
    if (geo) {
      sido = sido || geo.sido;
      sigungu = sigungu || geo.sigungu;
      dong = dong || geo.dong;
    }
  }

  try {
    const data = findPoliceForLocation({ lat, lon: lng, sido, sigungu, dong });

    if (!data) {
      const meta = policeDbMeta();
      return NextResponse.json({
        success: false,
        error:
          meta.count === 0
            ? "경찰관서 DB가 설치되지 않았습니다. npm run police:update-db 실행"
            : "근처 경찰관서를 찾을 수 없습니다.",
      });
    }

    return NextResponse.json({
      success: true,
      data,
      matchHint: sigungu
        ? dong
          ? `구 관할(${sigungu} · ${dong})`
          : `구 관할(${sigungu})`
        : "거리 기준",
    });
  } catch (error) {
    console.error("nearest-police-station error", error);
    return NextResponse.json(
      { success: false, error: "경찰관서 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
