import { NextRequest, NextResponse } from "next/server";
import type { PoliceStationInfo } from "@/lib/types";

interface KakaoPlaceDocument {
  place_name: string;
  distance: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  category_name: string;
}

function isPolicePlace(name: string, category: string) {
  const text = `${name} ${category}`;
  return /경찰|지구대|파출소|치안/.test(text);
}

function preferPoliceScore(name: string) {
  if (/경찰서/.test(name)) return 3;
  if (/지구대/.test(name)) return 2;
  if (/파출소/.test(name)) return 1;
  return 0;
}

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
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.searchParams.set("query", "경찰서");
    url.searchParams.set("x", lng);
    url.searchParams.set("y", lat);
    url.searchParams.set("radius", "15000");
    url.searchParams.set("sort", "distance");
    url.searchParams.set("size", "15");

    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "경찰서 검색에 실패했습니다." },
        { status: 502 },
      );
    }

    const json = (await res.json()) as { documents: KakaoPlaceDocument[] };
    const candidates = json.documents.filter((doc) =>
      isPolicePlace(doc.place_name, doc.category_name),
    );

    if (candidates.length === 0) {
      return NextResponse.json({
        success: false,
        error: "근처 경찰서를 찾을 수 없습니다.",
      });
    }

    candidates.sort((a, b) => {
      const scoreDiff =
        preferPoliceScore(b.place_name) - preferPoliceScore(a.place_name);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(a.distance) - Number(b.distance);
    });

    const best = candidates[0];
    const data: PoliceStationInfo = {
      name: best.place_name,
      address: best.road_address_name || best.address_name,
      phone: best.phone,
      distanceM: Number(best.distance),
      lat: Number(best.y),
      lng: Number(best.x),
    };

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json(
      { success: false, error: "경찰서 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
