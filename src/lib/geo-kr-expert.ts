import {
  ADDRESS_COORD_ALIGN_M,
  buildDistrictAddress,
  type AddressDisplayLevel,
} from "./geo-accuracy";
import { sanitizeGeoText } from "./geo-field-sanitize";
import {
  buildAllKoreanQueries,
  isMetroOnlyCity,
  mapCityToKorean,
  mapRegionToKorean,
} from "./ipinfo-kr";
import { haversineMeters } from "./geo-fusion";
import {
  resolveAddressFromCoords,
  searchAddressCandidates,
  searchKeywordCandidates,
  type KakaoAddressDetail,
} from "./kakao-geocode";
import type { GeoLocationData } from "./types";

export type KrAddressResult = {
  address: string;
  roadAddress?: string;
  legalAddress?: string;
  dong?: string;
  sido?: string;
  sigungu?: string;
  lat: number;
  lon: number;
  addressSource: string;
  precisionScore: number;
  dongUncertain?: boolean;
  refinedAccuracyM?: number;
  exactPin?: boolean;
  addressAligned?: boolean;
  addressLevel?: AddressDisplayLevel;
};

type ScoredCandidate = {
  full: string;
  road: string | null;
  legal: string;
  sido: string;
  sigungu: string;
  dong: string;
  lat: number;
  lon: number;
  source: string;
  queryBreadth: number;
  score: number;
};

export type KrExpertInput = {
  partial: Partial<GeoLocationData>;
  anchorLat: number;
  anchorLon: number;
  radiusM: number;
  regionCode?: string;
  trustedSigungu?: string;
  trustedSido?: string;
  /** ip-api district (동·읍면) */
  district?: string;
  kisaAddress?: string;
  kisaOrg?: string;
  /** GeoIP 구·군명을 주소 검색에 강하게 반영할지 */
  trustGeoCity?: boolean;
  /** 도로명 주소 표시 허용 (고신뢰 융합 시만) */
  allowRoadAddress?: boolean;
  /** 이미 조회한 coord2address 결과 (중복 Kakao 호출 방지) */
  prefetchedCoords?: KakaoAddressDetail | null;
  /** IP2Location 등 고신뢰 좌표 — Kakao 대량 검색 생략 */
  preferFastPath?: boolean;
};

function normalizeGu(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/(특별시|광역시|특별자치시|시|군|구)$/g, "");
}

function queryBreadth(query: string): number {
  return query.trim().split(/\s+/).filter(Boolean).length;
}

function toLegalAddress(d: KakaoAddressDetail): string {
  return (
    d.legal ||
    [d.sido, d.sigungu, d.dong].filter(Boolean).join(" ") ||
    d.full
  );
}

function scoreCandidate(
  c: ScoredCandidate,
  anchorLat: number,
  anchorLon: number,
  krPartial: Partial<GeoLocationData>,
  radiusM: number,
  trustedSigungu?: string,
  trustGeoCity = true,
): number {
  let score = 0;

  if (c.dong && c.dong.length >= 2) score += 38;
  if (c.sigungu) score += 18;
  if (c.sido) score += 8;
  if (c.road) score += 14;
  if (/\d+(-\d+)?/.test(c.legal)) score += 28;
  if (c.source.startsWith("search:") && /\d/.test(c.legal)) score += 12;

  const dist = haversineMeters(c.lat, c.lon, anchorLat, anchorLon);
  const tightRadius = Math.min(Math.max(radiusM, 2000), 12000);

  if (dist <= tightRadius * 0.5) score += 28;
  else if (dist <= tightRadius) score += 18;
  else if (dist <= tightRadius * 1.5) score += 6;
  else score -= 25;

  const cityKo = mapCityToKorean(krPartial.city);
  const regionKo = mapRegionToKorean(krPartial.region);
  const fullNorm = c.full.replace(/\s+/g, "");

  if (cityKo && fullNorm.includes(cityKo.replace(/\s+/g, ""))) score += 12;
  if (regionKo && fullNorm.includes(regionKo.replace(/\s+/g, ""))) score += 8;

  if (trustGeoCity && trustedSigungu) {
    const trusted = normalizeGu(trustedSigungu);
    const candGu = normalizeGu(c.sigungu);
    if (candGu && trusted && candGu === trusted) score += 50;
    else if (candGu && trusted && candGu !== trusted) score -= 35;
  } else if (!trustGeoCity && c.source === "coord2address") {
    score += 22;
  }

  if (c.source === "coord2address") score += 12;
  else if (c.source.startsWith("search:kisa")) score += 28;
  else if (c.source.startsWith("search:")) score += 14;
  else if (c.source.startsWith("keyword:")) score += 8;

  if (c.source.startsWith("search:") && c.queryBreadth <= 1) score -= 18;

  score += Math.min(Math.floor(c.full.length / 4), 12);

  return score;
}

function fromKakaoDetail(
  d: KakaoAddressDetail & { lat?: number; lng?: number },
  source: string,
  anchorLat: number,
  anchorLon: number,
  queryBreadth = 3,
): ScoredCandidate {
  const legal = toLegalAddress(d);
  const display = d.road || d.full || legal;
  return {
    full: display,
    road: d.road,
    legal,
    sido: d.sido,
    sigungu: d.sigungu,
    dong: d.dong,
    lat: d.lat ?? anchorLat,
    lon: d.lng ?? anchorLon,
    source,
    queryBreadth,
    score: 0,
  };
}

function dedupeCandidates(list: ScoredCandidate[]): ScoredCandidate[] {
  const seen = new Set<string>();
  const out: ScoredCandidate[] = [];
  for (const c of list) {
    const key = `${c.full}|${c.dong}|${Math.round(c.lat * 1000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function isRoadAnchored(
  candidate: ScoredCandidate,
  anchorLat: number,
  anchorLon: number,
): boolean {
  if (candidate.source === "coord2address") return true;
  return (
    haversineMeters(candidate.lat, candidate.lon, anchorLat, anchorLon) <=
    ADDRESS_COORD_ALIGN_M
  );
}

export async function resolveKoreanAddressExpert(
  input: KrExpertInput,
): Promise<KrAddressResult> {
  const {
    partial,
    anchorLat,
    anchorLon,
    radiusM,
    regionCode,
    trustedSigungu: inputSigungu,
    trustedSido: inputSido,
    district: rawDistrict,
    kisaAddress,
    kisaOrg,
    trustGeoCity = true,
    allowRoadAddress = false,
    prefetchedCoords,
    preferFastPath = false,
  } = input;

  const district = sanitizeGeoText(rawDistrict);

  const sidoKo =
    mapRegionToKorean(inputSido || partial.region) ||
    inputSido ||
    partial.region ||
    "";
  let sigunguKo = mapCityToKorean(inputSigungu || partial.city) || "";

  if (
    isMetroOnlyCity(partial.region, partial.city) ||
    sigunguKo === sidoKo ||
    sigunguKo === "대전" ||
    sigunguKo === "서울"
  ) {
    sigunguKo = "";
  }

  const fromCoords =
    prefetchedCoords !== undefined
      ? prefetchedCoords
      : await resolveAddressFromCoords(anchorLat, anchorLon);

  if (!sigunguKo && fromCoords?.sigungu) {
    sigunguKo = fromCoords.sigungu;
  }

  const coordGu = fromCoords?.sigungu ? normalizeGu(fromCoords.sigungu) : "";
  const trustedGu = sigunguKo ? normalizeGu(sigunguKo) : "";
  const coordGuMatchesTrusted =
    !fromCoords?.sigungu || !trustedGu || coordGu === trustedGu;
  const fastTrustedGu = trustedGu || coordGu;
  const guAligned =
    !fastTrustedGu ||
    !coordGu ||
    coordGu === fastTrustedGu ||
    !trustGeoCity;

  if (
    preferFastPath &&
    fromCoords?.sido &&
    fromCoords?.sigungu &&
    guAligned
  ) {
    const hasRoad = allowRoadAddress && Boolean(fromCoords.road);
    const resolvedDong = fromCoords.dong || undefined;
    return {
      address: hasRoad
        ? fromCoords.road!
        : buildDistrictAddress({
            sido: fromCoords.sido,
            sigungu: fromCoords.sigungu,
            dong: resolvedDong,
            includeDong: Boolean(resolvedDong),
          }),
      roadAddress: hasRoad ? fromCoords.road! : undefined,
      legalAddress:
        fromCoords.legal !== fromCoords.full ? fromCoords.legal : undefined,
      dong: resolvedDong,
      sido: fromCoords.sido,
      sigungu: fromCoords.sigungu,
      lat: anchorLat,
      lon: anchorLon,
      addressSource: "coord2address-fast",
      precisionScore: hasRoad ? 78 : 58,
      addressAligned: true,
      exactPin: hasRoad,
      addressLevel: hasRoad ? "road" : resolvedDong ? "dong" : "district",
    };
  }

  const krPartial: Partial<GeoLocationData> = {
    ...partial,
    region: sidoKo,
    city: sigunguKo || partial.city,
  };

  const queries = buildAllKoreanQueries({
    region: sidoKo || partial.region,
    city: sigunguKo || partial.city,
    zip: partial.zip,
    regionCode,
  });

  if (trustGeoCity && sidoKo && sigunguKo) {
    queries.unshift(`${sidoKo} ${sigunguKo}`);
  }
  if (trustGeoCity && district && sidoKo && sigunguKo) {
    queries.unshift(`${sidoKo} ${sigunguKo} ${district}`);
    queries.unshift(`${sigunguKo} ${district}`);
  }
  if (trustGeoCity && district && sigunguKo) {
    queries.unshift(`${sigunguKo} ${district}`);
  }
  if (kisaAddress) {
    queries.unshift(kisaAddress);
  }
  if (kisaOrg && sidoKo) {
    queries.unshift(`${sidoKo} ${kisaOrg}`);
  }
  if (fromCoords?.sido && fromCoords?.sigungu) {
    queries.unshift(`${fromCoords.sido} ${fromCoords.sigungu}`);
  }
  if (partial.zip && partial.zip.length >= 5) {
    queries.unshift(partial.zip);
    if (sidoKo) queries.unshift(`${sidoKo} ${partial.zip}`);
  }

  const uniqueQueries = [...new Set(queries)].slice(0, preferFastPath ? 3 : 6);

  const keywordQuery =
    !preferFastPath && trustGeoCity && sidoKo && sigunguKo
      ? `${sidoKo} ${sigunguKo}`
      : null;

  const [addressSearches, keywordResults] = await Promise.all([
    Promise.all(
      uniqueQueries.map(async (q) => ({
        query: q,
        breadth: queryBreadth(q),
        results: await searchAddressCandidates(q, 6),
      })),
    ),
    keywordQuery
      ? searchKeywordCandidates(keywordQuery, 5)
      : Promise.resolve([]),
  ]);

  const searchResults = [
    ...addressSearches,
    ...(keywordQuery
      ? [{ query: keywordQuery, breadth: 2, results: keywordResults }]
      : []),
  ];

  const candidates: ScoredCandidate[] = [];

  if (fromCoords) {
    candidates.push(
      fromKakaoDetail(fromCoords, "coord2address", anchorLat, anchorLon, 3),
    );
  }

  for (const { query, breadth, results } of searchResults) {
    for (const r of results) {
      const src = r.sido ? `search:${query}` : `keyword:${query}`;
      candidates.push(
        fromKakaoDetail(r, src, anchorLat, anchorLon, breadth),
      );
    }
  }

  const unique = dedupeCandidates(candidates);

  if (unique.length === 0) {
    const fallback = buildDistrictAddress({
      sido: sidoKo,
      sigungu: sigunguKo,
      dong: fromCoords?.dong,
      includeDong: false,
    });
    return {
      address: fallback || "주소를 확인할 수 없습니다",
      lat: anchorLat,
      lon: anchorLon,
      addressSource: "fallback",
      precisionScore: 20,
      dongUncertain: true,
      addressAligned: false,
      addressLevel: "district",
    };
  }

  for (const c of unique) {
    c.score = scoreCandidate(
      c,
      anchorLat,
      anchorLon,
      krPartial,
      radiusM,
      sigunguKo,
      trustGeoCity,
    );
  }

  unique.sort((a, b) => b.score - a.score);
  let best = unique[0];

  if (trustGeoCity && trustedGu) {
    const trustedMatch = unique.find(
      (c) => c.sigungu && normalizeGu(c.sigungu) === trustedGu,
    );
    if (trustedMatch && trustedMatch.score >= best.score - 15) {
      best = trustedMatch;
    }
  }

  const coordCandidate = unique.find((c) => c.source === "coord2address");
  const guMatch =
    !trustGeoCity ||
    !trustedGu ||
    !best.sigungu ||
    normalizeGu(best.sigungu) === trustedGu;

  const useCoordDong = guMatch && coordGuMatchesTrusted;

  const roadAnchored = isRoadAnchored(best, anchorLat, anchorLon);
  const addressAligned =
    (best.source === "coord2address" && guMatch) ||
    (roadAnchored && guMatch) ||
    (coordCandidate != null && guMatch);

  const finalLat = anchorLat;
  const finalLon = anchorLon;

  const anchorDetail = coordCandidate ?? fromCoords;
  const resolvedSido =
    (trustGeoCity && sigunguKo ? sidoKo : undefined) ||
    anchorDetail?.sido ||
    best.sido ||
    sidoKo ||
    undefined;
  const resolvedSigungu =
    trustGeoCity && sigunguKo
      ? sigunguKo
      : guMatch
        ? anchorDetail?.sigungu || best.sigungu || sigunguKo || undefined
        : anchorDetail?.sigungu || fromCoords?.sigungu || sigunguKo || undefined;
  const resolvedDong =
    (trustGeoCity && district && !guMatch ? district : undefined) ||
    (useCoordDong ? anchorDetail?.dong : undefined) ||
    (trustGeoCity && district && guMatch ? district : undefined) ||
    (guMatch ? best.dong : undefined) ||
    (useCoordDong ? fromCoords?.dong : undefined) ||
    undefined;

  let addressLevel: AddressDisplayLevel = "district";
  let address: string;
  let roadAddress: string | undefined;
  let legalAddress: string | undefined;
  let dong: string | undefined;

  if (allowRoadAddress && addressAligned && anchorDetail) {
    addressLevel = "road";
    address = anchorDetail.road || anchorDetail.full;
    roadAddress = anchorDetail.road || undefined;
    legalAddress =
      anchorDetail.legal !== address ? anchorDetail.legal : undefined;
    dong = resolvedDong || undefined;
  } else if (guMatch && resolvedDong && (addressAligned || trustGeoCity || district)) {
    addressLevel = "dong";
    address = buildDistrictAddress({
      sido: resolvedSido,
      sigungu: resolvedSigungu,
      dong: resolvedDong,
      includeDong: true,
    });
    dong = resolvedDong;
  } else {
    addressLevel = "district";
    address = buildDistrictAddress({
      sido: resolvedSido,
      sigungu: resolvedSigungu,
      dong: resolvedDong,
      includeDong: Boolean(guMatch && resolvedDong && trustGeoCity),
    });
    dong =
      guMatch && resolvedDong && trustGeoCity ? resolvedDong : undefined;
  }

  if (!guMatch || !trustGeoCity) {
    addressLevel = resolvedDong ? "dong" : "district";
    address = buildDistrictAddress({
      sido: resolvedSido,
      sigungu: resolvedSigungu,
      dong: resolvedDong,
      includeDong: Boolean(resolvedDong && (guMatch || trustGeoCity)),
    });
    if (resolvedDong && (guMatch || trustGeoCity)) {
      dong = resolvedDong;
    }
    roadAddress = undefined;
    legalAddress = undefined;
  }

  if (!allowRoadAddress || !roadAnchored) {
    roadAddress = undefined;
    if (addressLevel === "road") {
      addressLevel = resolvedDong ? "dong" : "district";
      address = buildDistrictAddress({
        sido: resolvedSido,
        sigungu: resolvedSigungu,
        dong: resolvedDong,
        includeDong: addressLevel === "dong",
      });
    }
  }

  const addressSource =
    anchorDetail && (allowRoadAddress || !roadAnchored)
      ? "coord2address"
      : best.source;

  const refinedAccuracyM =
    addressLevel === "dong"
      ? 520
      : addressLevel === "district"
        ? guMatch && trustGeoCity
          ? 900
          : 1100
        : allowRoadAddress && addressAligned
          ? 380
          : undefined;

  return {
    address,
    roadAddress,
    legalAddress,
    dong,
    sido: resolvedSido,
    sigungu: resolvedSigungu,
    lat: finalLat,
    lon: finalLon,
    addressSource,
    precisionScore: Math.max(40, Math.min(78, best.score)),
    dongUncertain: addressLevel === "district",
    refinedAccuracyM,
    exactPin: false,
    addressAligned,
    addressLevel,
  };
}
