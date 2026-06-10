import { NextRequest, NextResponse } from "next/server";
import { resolveAddressFromCoords } from "@/lib/kakao-geocode";

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lng = request.nextUrl.searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { success: false, error: "위도와 경도가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const detail = await resolveAddressFromCoords(Number(lat), Number(lng));

    if (!detail) {
      return NextResponse.json(
        { success: false, error: "주소 변환에 실패했습니다." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      address: detail.full,
      dong: detail.dong,
      sigungu: detail.sigungu,
      sido: detail.sido,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "주소 변환 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
