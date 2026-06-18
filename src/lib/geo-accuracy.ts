/** IP/GPS 위치 허용 최대 오차 (5km) */
import { sanitizeGeoText } from "./geo-field-sanitize";

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
export const ADDRESS_COORD_ALIGN_M = 250;

/** GPS 단일 핀 허용 최대 오차 */
export const EXACT_GPS_ACCURACY_M = 20;

/** 크라우드 /24 클러스터 사용 조건 */
export const CROWD_CLUSTER_MAX_SPREAD_M = 500;
export const CROWD_CLUSTER_MAX_ACCURACY_M = 30;

export const ESTIMATED_IP_ACCURACY_NOTE =
  "IP 추정 (시·군·구) — 도로명·오차 없는 위치는 GPS 등록·주소 확인 필요";

export const VERIFIED_ZERO_ERROR_NOTE =
  "사용자 확인 주소 — 오차 없음";

/** IP2Location 로컬 BIN 도시·구군급 추정 오차 */
export const IP2LOCATION_CITY_ACCURACY_M = 3000;

/** IP2Location + 역지오코딩 일치 시 허용 오차 */
export const IP2LOCATION_ALIGNED_ACCURACY_M = 2000;

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
