import { NextRequest, NextResponse } from "next/server";
import {
  searchAddressCandidates,
  searchKeywordCandidates,
} from "@/lib/kakao-geocode";

export const dynamic = "force-dynamic";

/** 위치 등록용 주소 검색 — 일일 조회 한도 미차감 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json(
      { success: false, error: "주소를 2글자 이상 입력해주세요." },
      { status: 400 },
    );
  }

  try {
    let candidates = await searchAddressCandidates(query, 8);
    if (candidates.length === 0) {
      candidates = await searchKeywordCandidates(query, 6);
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        { success: false, error: "주소를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const results = candidates.map((c) => ({
      address: c.road || c.full,
      roadAddress: c.road || c.full,
      legalAddress: c.legal,
      sido: c.sido,
      sigungu: c.sigungu,
      dong: c.dong,
      lat: c.lat,
      lon: c.lng,
    }));

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("location-register geocode error", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "주소 검색에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
