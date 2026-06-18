import { createMemoryCache } from "./memory-cache";

const COORD_CACHE_TTL_MS = 10 * 60 * 1000;
const coordCache = createMemoryCache<KakaoAddressDetail | null>(COORD_CACHE_TTL_MS, 800);

function coordCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export interface KakaoAddressDetail {
  full: string;
  road: string | null;
  legal: string;
  sido: string;
  sigungu: string;
  dong: string;
  lat?: number;
  lng?: number;
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

function parseKakaoDoc(
  doc: NonNullable<KakaoCoordResponse["documents"]>[number],
  lat?: number,
  lng?: number,
): KakaoAddressDetail | null {
  const legalAddr = doc.address;
  const roadAddr = doc.road_address;

  const sido = legalAddr?.region_1depth_name || roadAddr?.region_1depth_name || "";
  const sigungu = legalAddr?.region_2depth_name || roadAddr?.region_2depth_name || "";
  const dong = legalAddr?.region_3depth_name || roadAddr?.region_3depth_name || "";

  const legal =
    legalAddr?.address_name ||
    [sido, sigungu, dong].filter(Boolean).join(" ");
  const road = roadAddr?.address_name ?? null;
  const full = road || legal;

  if (!full) return null;

  return { full, road, legal, sido, sigungu, dong, lat, lng };
}

export async function resolveAddressFromCoords(
  lat: number,
  lng: number,
): Promise<KakaoAddressDetail | null> {
  const cacheKey = coordCacheKey(lat, lng);
  const cached = coordCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}&input_coord=WGS84`,
      {
        headers: { Authorization: `KakaoAK ${key}` },
        cache: "no-store",
      },
    );

    if (!res.ok) return null;

    const json = (await res.json()) as KakaoCoordResponse;
    const doc = json.documents?.[0];
    if (!doc) {
      coordCache.set(cacheKey, null);
      return null;
    }

    const detail = parseKakaoDoc(doc, lat, lng);
    coordCache.set(cacheKey, detail);
    return detail;
  } catch {
    return null;
  }
}

interface KakaoKeywordSearchResponse {
  documents?: Array<{
    place_name?: string;
    address_name?: string;
    road_address_name?: string;
    x?: string;
    y?: string;
  }>;
}

/** 장소 키워드 검색 (주소 API 실패 시 폴백) */
export async function searchKeywordCandidates(
  query: string,
  size = 5,
): Promise<(KakaoAddressDetail & { lat: number; lng: number })[]> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key || !query.trim()) return [];

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=${size}`,
      {
        headers: { Authorization: `KakaoAK ${key}` },
        cache: "no-store",
      },
    );

    if (!res.ok) return [];

    const json = (await res.json()) as KakaoKeywordSearchResponse;
    const results: (KakaoAddressDetail & { lat: number; lng: number })[] = [];

    for (const doc of json.documents ?? []) {
      const lng = Number(doc.x);
      const lat = Number(doc.y);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const road = doc.road_address_name ?? null;
      const legal = doc.address_name || doc.place_name || "";
      const full = road || legal || doc.place_name || "";
      if (!full) continue;

      results.push({
        full,
        road,
        legal: legal || full,
        sido: "",
        sigungu: "",
        dong: "",
        lat,
        lng,
      });
    }

    return results;
  } catch {
    return [];
  }
}

interface KakaoAddressSearchResponse {
  documents?: Array<{
    address_name?: string;
    road_address_name?: string;
    region_1depth_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
    x?: string;
    y?: string;
  }>;
}

/** 다중 후보 주소 검색 (초정밀 스코어링용) */
export async function searchAddressCandidates(
  query: string,
  size = 5,
): Promise<(KakaoAddressDetail & { lat: number; lng: number })[]> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key || !query.trim()) return [];

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=${size}`,
      {
        headers: { Authorization: `KakaoAK ${key}` },
        cache: "no-store",
      },
    );

    if (!res.ok) return [];

    const json = (await res.json()) as KakaoAddressSearchResponse;
    const results: (KakaoAddressDetail & { lat: number; lng: number })[] = [];

    for (const doc of json.documents ?? []) {
      const lng = Number(doc.x);
      const lat = Number(doc.y);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const sido = doc.region_1depth_name || "";
      const sigungu = doc.region_2depth_name || "";
      const dong = doc.region_3depth_name || "";
      const legal = doc.address_name || [sido, sigungu, dong].filter(Boolean).join(" ");
      const road = doc.road_address_name ?? null;
      const full = road || legal;

      results.push({
        full,
        road,
        legal,
        sido,
        sigungu,
        dong,
        lat,
        lng,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/** 단일 최상위 주소 검색 */
export async function searchAddressByQuery(
  query: string,
): Promise<(KakaoAddressDetail & { lat: number; lng: number }) | null> {
  const results = await searchAddressCandidates(query, 1);
  return results[0] ?? null;
}

const sigunguCenterCache = createMemoryCache<{ lat: number; lon: number } | null>(
  COORD_CACHE_TTL_MS,
  200,
);

/** 시·군·구 행정 중심 좌표 (GeoIP 불일치 시 앵커) */
export async function geocodeSigunguCenter(
  sido: string,
  sigungu: string,
): Promise<{ lat: number; lon: number } | null> {
  const query = `${sido} ${sigungu}`.trim();
  if (!query) return null;

  const cached = sigunguCenterCache.get(query);
  if (cached !== undefined) return cached;

  const hit = await searchAddressByQuery(query);
  const result = hit ? { lat: hit.lat, lon: hit.lng } : null;
  sigunguCenterCache.set(query, result);
  return result;
}
