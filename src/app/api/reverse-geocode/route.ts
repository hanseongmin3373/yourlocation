import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lng = request.nextUrl.searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { success: false, error: "위도와 경도가 필요합니다." },
      { status: 400 },
    );
  }

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return NextResponse.json(
      { success: false, error: "Kakao REST API 키가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${key}` } },
    );

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "주소 변환에 실패했습니다." },
        { status: 502 },
      );
    }

    const json = await res.json();
    const doc = json.documents?.[0];
    const address =
      doc?.road_address?.address_name || doc?.address?.address_name || null;

    return NextResponse.json({ success: true, address });
  } catch {
    return NextResponse.json(
      { success: false, error: "주소 변환 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
