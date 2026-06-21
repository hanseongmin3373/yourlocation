/** IP/GPS 위치 허용 최대 오차 (5km) */
import { sanitizeGeoText } from "./geo-field-sanitize";
import type { GeoLocationData } from "./types";

export const MAX_ALLOWED_ACCURACY_M = 5000;

export const ACCURACY_EXCEEDED_NOTE =
  "오차 5km 초과 — GPS 위치 등록 권장";

/** 다중 제공자 합의 시 단일 핀 허용 거리 */
export const EXACT_PROVIDER_AGREEMENT_M = 500;

/** 3+ 독립 DB 고신뢰 합의 거리 */
export const HIGH_CONFIDENCE_AGREEMENT_M = 200;

/** 고신뢰 exactPin에 필요한 최소 독립 제공자 수 */
export const HIGH_CONFIDENCE_PROVIDER_MIN = 3;

/** 주소·좌표 정합 허용 거리 (도로명 표시 기준) */
export const ADDRESS_COORD_ALIGN_M = 200;

/** GPS 단일 핀 허용 최대 오차 */
export const EXACT_GPS_ACCURACY_M = 20;

/** 등록 모달 — GPS 경고·확인 차단 기준 */
export const REGISTRATION_GPS_WARN_M = 80;
export const REGISTRATION_GPS_BLOCK_CONFIRM_M = 200;

/** 크라우드 /24 클러스터 사용 조건 (GPS 자발 등록) */
export const CROWD_CLUSTER_MAX_SPREAD_M = 500;
export const CROWD_CLUSTER_MAX_ACCURACY_M = 30;

/** mylocation-import 대량 데이터 — GPS 오차·연령 제한 완화 */
export const MYLOCATION_IMPORT_MAX_ACCURACY_M = 500;
export const MYLOCATION_IMPORT_MAX_SPREAD_M = 2000;

/** lookup-absorb — 고품질 결과만 crowd DB·클러스터에 사용 */
export const LOOKUP_ABSORB_MAX_ACCURACY_M = 450;
export const LOOKUP_ABSORB_MAX_SPREAD_M = 800;

/** 행정동 단위 표시·오차 원 상한 */
export const DONG_LEVEL_MAX_ACCURACY_M = 550;

/** 시·군·구 단위 표시 상한 */
export const GU_LEVEL_MAX_ACCURACY_M = 1100;

/** IP2Location + 역지오코딩 일치 시 허용 오차 (구·동급) */
export const IP2LOCATION_ALIGNED_ACCURACY_M = 1200;

export const ESTIMATED_IP_ACCURACY_NOTE =
  "IP 추정 (시·군·구) — 도로명·오차 없는 위치는 GPS 등록·주소 확인 또는 crowd DB 필요";

/** ipinfo 1차 엔진 — Plus/Lookup API 기준 */
export const IPINFO_PRIMARY_NOTE =
  "ipinfo.io 1차 조회 — 등록 DB·GPS 확인 주소 우선";

export const VERIFIED_ZERO_ERROR_NOTE =
  "사용자 확인 주소 — 오차 없음";

/** IP2Location 로컬 BIN 도시·구군급 추정 오차 */
export const IP2LOCATION_CITY_ACCURACY_M = 3000;

export type AddressDisplayLevel = "road" | "dong" | "district";

export function isWithinAccuracyLimit(accuracyM?: number | null): boolean {
  if (accuracyM == null) return true;
  return accuracyM <= MAX_ALLOWED_ACCURACY_M;
}

export function effectiveAccuracyM(
  accuracyM?: number | null,
  spreadM?: number | null,
): number {
  const a = accuracyM ?? 0;
  const s = spreadM ?? 0;
  return Math.max(a, s);
}

/** 구·동 행정단위에 맞춰 오차 반경 축소 */
export function refineAccuracyForAdminLevel(opts: {
  accuracyM: number;
  hasDong: boolean;
  trustGeoCity: boolean;
  addressAligned?: boolean;
  ipinfoRadiusKm?: number | null;
  spreadM?: number | null;
  expertRefinedM?: number | null;
}): number {
  let m = opts.accuracyM;

  if (opts.expertRefinedM != null && opts.expertRefinedM > 0) {
    m = Math.min(m, opts.expertRefinedM);
  }

  const radiusM =
    opts.ipinfoRadiusKm != null && opts.ipinfoRadiusKm > 0
      ? opts.ipinfoRadiusKm * 1000
      : null;

  if (radiusM != null) {
    if (radiusM <= 5000) {
      m = Math.min(m, Math.max(180, Math.round(radiusM * 0.42)));
    } else if (radiusM <= 15000) {
      m = Math.min(m, Math.max(320, Math.round(radiusM * 0.52)));
    } else if (radiusM <= 50000) {
      m = Math.min(m, Math.max(650, Math.round(radiusM * 0.32)));
    }
  }

  const spread = opts.spreadM ?? 0;
  if (spread > 0 && spread < 500) {
    m = Math.min(m, Math.max(220, Math.round(spread / 2 + 100)));
  } else if (spread > 0 && spread < 1200) {
    m = Math.min(m, Math.max(350, Math.round(spread / 2 + 150)));
  }

  if (opts.hasDong && opts.trustGeoCity && opts.addressAligned) {
    m = Math.min(m, DONG_LEVEL_MAX_ACCURACY_M);
  } else if (opts.hasDong && opts.trustGeoCity) {
    m = Math.min(m, 720);
  } else if (opts.hasDong && opts.addressAligned) {
    m = Math.min(m, 820);
  } else if (opts.trustGeoCity) {
    m = Math.min(m, GU_LEVEL_MAX_ACCURACY_M);
  }

  return Math.max(180, Math.min(m, MAX_ALLOWED_ACCURACY_M));
}

export function capPrecisionForAccuracy(
  score: number,
  accuracyM?: number | null,
): number {
  if (accuracyM != null && accuracyM > MAX_ALLOWED_ACCURACY_M) {
    return Math.min(score, 45);
  }
  return score;
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 시·군·구 또는 동 수준 주소 (도로명 미표시) */
export function buildDistrictAddress(opts: {
  sido?: string;
  sigungu?: string;
  dong?: string;
  includeDong?: boolean;
}): string {
  const parts = [
    sanitizeGeoText(opts.sido),
    sanitizeGeoText(opts.sigungu),
  ];
  if (opts.includeDong !== false) {
    const dong = sanitizeGeoText(opts.dong);
    if (dong) parts.push(dong);
  }
  return parts.filter(Boolean).join(" ");
}

/** mylocation 스타일 — 시·군·구·동 (도로명 제외) */
export function formatDistrictLocationLabel(data: {
  sido?: string;
  sigungu?: string;
  dong?: string;
  city?: string;
  region?: string;
  address?: string;
}): string {
  const district = buildDistrictAddress({
    sido: data.sido || data.region,
    sigungu: data.sigungu || data.city,
    dong: data.dong,
    includeDong: true,
  });
  if (district) return district;
  return sanitizeGeoText(data.address) || "";
}

/**
 * 모든 IP 조회 결과에 적용
 * - userVerified: 오차 없음 (도로명·단일 핀)
 * - 그 외: 동·구 추정 + 오차 원
 */
export function enforceZeroErrorPolicy(data: GeoLocationData): GeoLocationData {
  if (data.userVerified) {
    return {
      ...data,
      exactPin: true,
      accuracyM: undefined,
      address: data.roadAddress || data.address,
      roadAddress: data.roadAddress || data.address,
      accuracyNote: VERIFIED_ZERO_ERROR_NOTE,
      locationSource: "pinpoint",
      confidenceLevel: "high",
    };
  }

  if (data.addressSource === "kakao-search") {
    return {
      ...data,
      exactPin: true,
      accuracyM: undefined,
      locationSource: "pinpoint",
      confidenceLevel: "high",
    };
  }

  if (
    data.addressSource === "coord2address" &&
    data.locationSource !== "ip" &&
    data.geoProvider !== "ip-api" &&
    data.geoProvider !== "ip2location" &&
    !data.geoSources?.some((s) =>
      ["ip-api", "ip2location", "ipinfo", "db-ip"].includes(s),
    )
  ) {
    return {
      ...data,
      exactPin: true,
      accuracyM: undefined,
      locationSource: "pinpoint",
      confidenceLevel: "high",
    };
  }

  const districtAddress =
    formatDistrictLocationLabel(data) ||
    buildDistrictAddress({
      sido: data.sido || data.region,
      sigungu: data.sigungu || data.city,
      dong: data.dong,
      includeDong: Boolean(data.dong),
    }) ||
    data.address;

  const isCrowd =
    data.geoProvider === "crowd-db" ||
    data.locationSource === "crowd" ||
    data.geoSources?.includes("crowd-db");

  if (isCrowd) {
    if (data.exactPin) {
      return {
        ...data,
        exactPin: true,
        accuracyM: undefined,
        address: data.roadAddress || districtAddress || data.address,
        accuracyNote: data.accuracyNote || VERIFIED_ZERO_ERROR_NOTE,
        locationSource: "pinpoint",
        confidenceLevel: "high",
      };
    }

    const accuracyM =
      data.accuracyM ?? (data.dong ? 420 : data.sigungu || data.city ? 520 : 680);
    const note =
      data.accuracyNote ??
      (data.accuracyTier === "high"
        ? `등록 DB — 행정동 추정 (±${Math.round(accuracyM)}m)`
        : data.accuracyTier === "normal"
          ? `등록 DB — 시·군·구 추정 (±${Math.round(accuracyM)}m)`
          : "등록 DB 추정 — 동·구 단위");

    return {
      ...data,
      exactPin: false,
      userVerified: undefined,
      roadAddress: undefined,
      legalAddress: undefined,
      address: districtAddress,
      accuracyM,
      accuracyNote: note,
      locationSource: "crowd",
      confidenceLevel:
        data.confidenceLevel ??
        (data.accuracyTier === "high"
          ? "high"
          : accuracyM <= 450
            ? "medium"
            : "low"),
    };
  }

  const defaultAccuracy = IP2LOCATION_CITY_ACCURACY_M;
  const accuracyM = data.accuracyM ?? defaultAccuracy;

  return {
    ...data,
    exactPin: false,
    userVerified: undefined,
    roadAddress: undefined,
    legalAddress: undefined,
    address: districtAddress,
    accuracyM,
    accuracyNote: ESTIMATED_IP_ACCURACY_NOTE,
    locationSource: "ip",
    confidenceLevel:
      accuracyM > MAX_ALLOWED_ACCURACY_M ? "low" : "medium",
  };
}

/** 오차 없음 표시 — 사용자가 주소를 직접 확인한 경우만 */
export function isPreciseLocation(data: {
  exactPin?: boolean;
  accuracyM?: number;
  locationSource?: string;
  userVerified?: boolean;
}): boolean {
  return Boolean(data.userVerified);
}

/** 지도 오차 원 반경 (최대 5km) */
export function displayAccuracyRadiusM(
  accuracyM?: number,
): number | undefined {
  if (accuracyM == null || accuracyM <= 0) return undefined;
  return Math.min(accuracyM, MAX_ALLOWED_ACCURACY_M);
}

/** 오차 없음 핀 — 사용자 확인 주소만 */
export function qualifiesExactPin(opts: {
  crowdExactIp?: boolean;
  userVerified?: boolean;
  gpsAccuracyM?: number;
  providerCount?: number;
  independentProviderCount?: number;
  spreadM?: number;
  accuracyM?: number;
  trustLocalBin?: boolean;
  addressAligned?: boolean;
  highDisagreement?: boolean;
  isVpn?: boolean;
  highConfidenceAgreement?: boolean;
}): boolean {
  return Boolean(opts.userVerified);
}

/** 동일 좌표(200m 이내) 제공자는 1개로 취급 */
export function countIndependentProviders(
  candidates: { lat: number; lon: number; provider: string }[],
  thresholdM = HIGH_CONFIDENCE_AGREEMENT_M,
): number {
  const clusters: { lat: number; lon: number }[] = [];
  for (const c of candidates) {
    const hit = clusters.find(
      (cl) =>
        haversineMeters(cl.lat, cl.lon, c.lat, c.lon) <= thresholdM,
    );
    if (!hit) clusters.push({ lat: c.lat, lon: c.lon });
  }
  return clusters.length;
}
