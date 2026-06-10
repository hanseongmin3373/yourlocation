export interface KakaoAddressDetail {
  full: string;
  road: string | null;
  sido: string;
  sigungu: string;
  dong: string;
}

interface KakaoCoordResponse {
  documents?: Array<{
    road_address?: {
      address_name?: string;
      region_1depth_name?: string;
      region_2depth_name?: string;
      region_3depth_name?: string;
    } | null;
    address?: {
      address_name?: string;
      region_1depth_name?: string;
      region_2depth_name?: string;
      region_3depth_name?: string;
    };
  }>;
}

export async function resolveAddressFromCoords(
  lat: number,
  lng: number,
): Promise<KakaoAddressDetail | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}&input_coord=WGS84`,
      {
        headers: { Authorization: `KakaoAK ${key}` },
        next: { revalidate: 86400 },
      },
    );

    if (!res.ok) return null;

    const json = (await res.json()) as KakaoCoordResponse;
    const doc = json.documents?.[0];
    if (!doc) return null;

    const legal = doc.address;
    const road = doc.road_address;

    const sido = legal?.region_1depth_name || road?.region_1depth_name || "";
    const sigungu = legal?.region_2depth_name || road?.region_2depth_name || "";
    const dong = legal?.region_3depth_name || road?.region_3depth_name || "";

    const full =
      road?.address_name ||
      legal?.address_name ||
      [sido, sigungu, dong].filter(Boolean).join(" ");

    return {
      full,
      road: road?.address_name ?? null,
      sido,
      sigungu,
      dong,
    };
  } catch {
    return null;
  }
}
