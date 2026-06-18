import {
  resolveAddressFromCoords,
  searchAddressCandidates,
  searchKeywordCandidates,
  type KakaoAddressDetail,
} from "./kakao-geocode";
import type { GeoLocationData } from "./types";

function pickBestMatch(
  candidates: (KakaoAddressDetail & { lat: number; lng: number })[],
  query: string,
): KakaoAddressDetail & { lat: number; lng: number } {
  const q = query.replace(/\s+/g, "").toLowerCase();

  let best = candidates[0];
  let bestScore = -1;

  for (const c of candidates) {
    let score = 0;
    const compact = c.full.replace(/\s+/g, "").toLowerCase();
    const legalCompact = c.legal.replace(/\s+/g, "").toLowerCase();

    if (compact.includes(q) || q.includes(compact)) score += 40;
    if (legalCompact.includes(q) || q.includes(legalCompact)) score += 30;
    if (c.dong && q.includes(c.dong.replace(/\s+/g, ""))) score += 25;
    if (c.sigungu && q.includes(c.sigungu.replace(/\s+/g, ""))) score += 15;
    if (c.road) score += 8;
    score += Math.min(c.full.length, 40);

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}

/** 사용자 입력 주소 → 카카오 검색 */
export async function lookupAddress(query: string): Promise<GeoLocationData> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    throw new Error("주소를 2글자 이상 입력해주세요.");
  }

  let candidates = await searchAddressCandidates(trimmed, 10);

  if (candidates.length === 0) {
    candidates = await searchKeywordCandidates(trimmed, 8);
  }

  if (candidates.length === 0) {
    throw new Error(
      "주소를 찾을 수 없습니다. 도로명·지번·동 이름을 포함해 다시 입력해주세요.",
    );
  }

  const best = pickBestMatch(candidates, trimmed);

  let enriched = best;
  if (!best.sido || !best.dong) {
    const detail = await resolveAddressFromCoords(best.lat, best.lng);
    if (detail) {
      enriched = {
        ...best,
        full: detail.road || detail.full || best.full,
        road: detail.road ?? best.road,
        legal: detail.legal || best.legal,
        sido: detail.sido || best.sido,
        sigungu: detail.sigungu || best.sigungu,
        dong: detail.dong || best.dong,
      };
    }
  }

  return {
    ip: "-",
    country: "대한민국",
    countryCode: "KR",
    region: enriched.sido,
    city: enriched.sigungu,
    zip: "",
    lat: enriched.lat,
    lon: enriched.lng,
    timezone: "Asia/Seoul",
    isp: "",
    org: "",
    as: "",
    address: enriched.full,
    roadAddress: enriched.road || undefined,
    legalAddress: enriched.legal !== enriched.full ? enriched.legal : undefined,
    dong: enriched.dong || undefined,
    sido: enriched.sido || undefined,
    sigungu: enriched.sigungu || undefined,
    accuracyM: 100,
    locationSource: "ip",
    accuracyNote: "카카오 주소 검색 결과입니다.",
    addressSource: "kakao-search",
    expertMode: true,
    precisionScore: 90,
    confidenceLevel: "high",
  };
}
