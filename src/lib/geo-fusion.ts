/** 다중 IP 지오 DB 좌표 융합 */

import {
  countIndependentProviders,
  EXACT_PROVIDER_AGREEMENT_M,
  HIGH_CONFIDENCE_AGREEMENT_M,
  HIGH_CONFIDENCE_PROVIDER_MIN,
  IP2LOCATION_ALIGNED_ACCURACY_M,
  IP2LOCATION_CITY_ACCURACY_M,
  MAX_ALLOWED_ACCURACY_M,
} from "./geo-accuracy";
import type { IpinfoPlusIntel } from "./ipinfo-plus";
import { plusAgreementRadiusM } from "./ipinfo-plus";

export type GeoPointCandidate = {
  lat: number;
  lon: number;
  provider: string;
  weight: number;
  radiusKm?: number;
};

export type FuseOptions = {
  countryCode?: string;
  /** db-ip·ip-api 등 시·군·구 텍스트 합의 */
  cityHintAgreement?: boolean;
  /** ipinfo.io 1차 엔진 — LITE BIN·저신뢰 제공자 배제 */
  ipinfoPrimary?: boolean;
  /** Plus 32속성 — radius·네트워크 플래그 기반 가중치·신뢰도 */
  ipinfoPlus?: IpinfoPlusIntel | null;
};

const PROVIDER_WEIGHT: Record<string, number> = {
  ipinfo: 18,
  ip2location: 4,
  "ip-api": 6,
  geojs: 7,
  ipwho: 3,
};

function effectiveIpinfoWeight(intel?: IpinfoPlusIntel | null): number {
  if (!intel?.isPlus) return 14;
  if (intel.radiusKm != null && intel.radiusKm <= 5) return 26;
  if (intel.radiusKm != null && intel.radiusKm <= 15) return 22;
  if (intel.radiusKm != null && intel.radiusKm <= 50) return 20;
  if (intel.geoTrustScore >= 70) return 18;
  if (intel.isHosting || intel.isAnycast || intel.isAnonymous) return 10;
  return 14;
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

function maxPairwiseSpread(candidates: GeoPointCandidate[]): number {
  let max = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      max = Math.max(
        max,
        haversineMeters(
          candidates[i].lat,
          candidates[i].lon,
          candidates[j].lat,
          candidates[j].lon,
        ),
      );
    }
  }
  return max;
}

/** ipinfo가 시청·을지로 허브로 몰리는 경우만 제외 (서울 우선 아님) */
function isSeoulHubCoords(lat: number, lon: number): boolean {
  const hubs = [
    { lat: 37.5665, lon: 126.978, r: 2500 },
    { lat: 37.5636, lon: 126.997, r: 2000 },
  ];
  return hubs.some((h) => haversineMeters(lat, lon, h.lat, h.lon) < h.r);
}

/** IP2Location LITE vs ip-api — 광역 불일치 시 LITE BIN 제외 (한국 IP 오배치 빈번) */
export const IP2LOC_REJECT_DISTANCE_M = 25_000;

function shouldDropIp2Location(
  ip2loc: GeoPointCandidate | undefined,
  ipApi: GeoPointCandidate | undefined,
): boolean {
  if (!ip2loc || !ipApi) return false;
  return (
    haversineMeters(ip2loc.lat, ip2loc.lon, ipApi.lat, ipApi.lon) >
    IP2LOC_REJECT_DISTANCE_M
  );
}

function effectiveWeight(c: GeoPointCandidate): number {
  const base = c.weight || PROVIDER_WEIGHT[c.provider] || 3;
  if (c.radiusKm != null && c.radiusKm > 0) {
    const radiusM = c.radiusKm * 1000;
    const radiusFactor = Math.min(3, Math.max(0.35, 8000 / radiusM));
    return base * radiusFactor;
  }
  return base;
}

function largestAgreementCluster(
  candidates: GeoPointCandidate[],
  thresholdM = EXACT_PROVIDER_AGREEMENT_M,
): { members: GeoPointCandidate[]; spreadM: number } {
  if (candidates.length <= 1) {
    return { members: candidates, spreadM: 0 };
  }

  let best: GeoPointCandidate[] = [candidates[0]];

  for (const seed of candidates) {
    const cluster = candidates.filter(
      (c) => haversineMeters(seed.lat, seed.lon, c.lat, c.lon) <= thresholdM,
    );
    if (cluster.length > best.length) best = cluster;
  }

  return {
    members: best,
    spreadM: best.length > 1 ? maxPairwiseSpread(best) : 0,
  };
}

function weightedCentroid(candidates: GeoPointCandidate[]): {
  lat: number;
  lon: number;
} {
  let wSum = 0;
  let lat = 0;
  let lon = 0;
  for (const c of candidates) {
    const w = effectiveWeight(c);
    lat += c.lat * w;
    lon += c.lon * w;
    wSum += w;
  }
  return { lat: lat / wSum, lon: lon / wSum };
}

/** 수도권·광역시 권역 (ISP 등록지 오배치 판별용) */
export function isKrMetroCoords(lat: number, lon: number): boolean {
  const metros = [
    { lat: 37.55, lon: 126.98, r: 38_000 },
    { lat: 35.18, lon: 129.08, r: 28_000 },
    { lat: 37.46, lon: 126.7, r: 22_000 },
    { lat: 35.87, lon: 128.6, r: 22_000 },
    { lat: 36.35, lon: 127.38, r: 18_000 },
    { lat: 35.16, lon: 126.85, r: 18_000 },
  ];
  return metros.some(
    (m) => haversineMeters(lat, lon, m.lat, m.lon) < m.r,
  );
}

function filterKrCandidates(
  candidates: GeoPointCandidate[],
  options?: FuseOptions,
): GeoPointCandidate[] {
  if (candidates.length <= 1) return candidates;

  const ip2loc = candidates.find((c) => c.provider === "ip2location");
  const ipApi = candidates.find((c) => c.provider === "ip-api");

  if (shouldDropIp2Location(ip2loc, ipApi)) {
    return candidates.filter((c) => c.provider !== "ip2location");
  }

  if (options?.cityHintAgreement && ip2loc && ipApi) {
    const ip2locVsApi = haversineMeters(
      ip2loc.lat,
      ip2loc.lon,
      ipApi.lat,
      ipApi.lon,
    );
    if (ip2locVsApi > EXACT_PROVIDER_AGREEMENT_M * 2) {
      const ipinfo = candidates.find((c) => c.provider === "ipinfo");
      const apiAllies = candidates.filter(
        (c) =>
          c.provider !== "ip2location" &&
          haversineMeters(c.lat, c.lon, ipApi.lat, ipApi.lon) <=
            EXACT_PROVIDER_AGREEMENT_M * 4,
      );
      const independentAllies = countIndependentProviders(apiAllies);
      const ipinfoNearApi =
        ipinfo != null &&
        haversineMeters(ipinfo.lat, ipinfo.lon, ipApi.lat, ipApi.lon) <=
          MAX_ALLOWED_ACCURACY_M;
      if (independentAllies >= 2 || (ipinfoNearApi && apiAllies.length >= 2)) {
        return candidates.filter((c) => c.provider !== "ip2location");
      }
    }
  }

  if (ip2loc) {
    const aligned = candidates.filter(
      (c) =>
        haversineMeters(c.lat, c.lon, ip2loc.lat, ip2loc.lon) <=
        MAX_ALLOWED_ACCURACY_M,
    );
    if (aligned.some((c) => c.provider === "ip2location")) {
      const distant = candidates.length - aligned.length;
      if (distant > 0) {
        if (aligned.length === 1 && shouldDropIp2Location(ip2loc, ipApi)) {
          return candidates.filter((c) => c.provider !== "ip2location");
        }
        return aligned.length === 1 ? [ip2loc] : aligned;
      }
    }
  }

  return filterKrOutliers(candidates);
}

function filterKrOutliers(candidates: GeoPointCandidate[]): GeoPointCandidate[] {
  if (candidates.length <= 1) return candidates;

  const ipApi = candidates.find((c) => c.provider === "ip-api");
  const ip2loc = candidates.find((c) => c.provider === "ip2location");
  if (!ipApi) return candidates;

  const coreAgree =
    ip2loc != null &&
    haversineMeters(ip2loc.lat, ip2loc.lon, ipApi.lat, ipApi.lon) <=
      EXACT_PROVIDER_AGREEMENT_M * 4;

  return candidates.filter((c) => {
    if (c.provider === "ipwho") {
      const d = haversineMeters(c.lat, c.lon, ipApi.lat, ipApi.lon);
      if (d > 20_000) return false;
    }
    if (c.provider === "ipinfo") {
      const d = haversineMeters(c.lat, c.lon, ipApi.lat, ipApi.lon);
      if (d > MAX_ALLOWED_ACCURACY_M) return false;
      if (coreAgree && d > EXACT_PROVIDER_AGREEMENT_M * 8) return false;
      if (isSeoulHubCoords(c.lat, c.lon) && d > 2500) return false;
    }
    return true;
  });
}

export type FusedCoordinates = {
  lat: number;
  lon: number;
  accuracyM: number;
  spreadM: number;
  rawSpreadM: number;
  providers: string[];
  precisionScore: number;
  confidenceLevel: "high" | "medium" | "low";
  agreementCount?: number;
  independentProviderCount?: number;
  highDisagreement?: boolean;
  maxProviderRadiusM?: number;
  trustLocalBin?: boolean;
  highConfidenceAgreement?: boolean;
};

export function fuseCoordinates(
  candidates: GeoPointCandidate[],
  options?: FuseOptions,
): FusedCoordinates | null {
  const isKr = options?.countryCode === "KR";
  let valid = candidates.filter(
    (c) => Number.isFinite(c.lat) && Number.isFinite(c.lon),
  );
  if (valid.length === 0) return null;

  const rawSpreadM = valid.length > 1 ? maxPairwiseSpread(valid) : 0;

  if (isKr && valid.length > 1) {
    valid = filterKrCandidates(valid, options);
    if (valid.length === 0) return null;
  }

  if (options?.ipinfoPrimary) {
    const ipinfoPt = valid.find((c) => c.provider === "ipinfo");
    if (ipinfoPt) {
      ipinfoPt.weight = effectiveIpinfoWeight(options.ipinfoPlus);
      const agreeM = plusAgreementRadiusM(options.ipinfoPlus);
      valid = valid.filter(
        (c) =>
          c.provider === "ipinfo" ||
          haversineMeters(c.lat, c.lon, ipinfoPt.lat, ipinfoPt.lon) <= agreeM,
      );
    }
  }

  const providers = [...new Set(valid.map((c) => c.provider))];
  const spreadM = valid.length > 1 ? maxPairwiseSpread(valid) : 0;
  const highDisagreement =
    rawSpreadM > MAX_ALLOWED_ACCURACY_M && !valid.some((c) => c.provider === "ip2location");
  const agreement = largestAgreementCluster(valid);
  const independentProviderCount = countIndependentProviders(valid);
  const hasStrongAgreement =
    independentProviderCount >= 2 &&
    agreement.spreadM < EXACT_PROVIDER_AGREEMENT_M;
  const highConfidenceAgreement =
    independentProviderCount >= HIGH_CONFIDENCE_PROVIDER_MIN &&
    agreement.spreadM <= HIGH_CONFIDENCE_AGREEMENT_M;

  const ip2loc = valid.find((c) => c.provider === "ip2location");
  const ipinfo = valid.find((c) => c.provider === "ipinfo");
  const ipApi = valid.find((c) => c.provider === "ip-api");

  let trustLocalBin = false;
  if (isKr && ip2loc && !options?.ipinfoPrimary) {
    const ip2locStillPresent = valid.some((c) => c.provider === "ip2location");
    if (!ip2locStillPresent) {
      trustLocalBin = false;
    } else if (valid.length === 1) {
      trustLocalBin =
        valid[0].provider === "ip2location" &&
        ipApi != null &&
        !shouldDropIp2Location(ip2loc, ipApi);
    } else {
      const others = valid.filter((c) => c.provider !== "ip2location");
      const nearestOther = Math.min(
        ...others.map((c) =>
          haversineMeters(ip2loc.lat, ip2loc.lon, c.lat, c.lon),
        ),
      );
      if (nearestOther > EXACT_PROVIDER_AGREEMENT_M) {
        const apiAllies = others.filter(
          (c) =>
            ipApi &&
            haversineMeters(c.lat, c.lon, ipApi.lat, ipApi.lon) <=
              EXACT_PROVIDER_AGREEMENT_M * 4,
        );
        const dropLocalBinForCityHints =
          options?.cityHintAgreement &&
          ipApi != null &&
          countIndependentProviders(apiAllies) >= 2;
        trustLocalBin = !dropLocalBinForCityHints;
      }
    }
  }

  const ipinfoRadiusM =
    !trustLocalBin &&
    ipinfo?.radiusKm != null &&
    ipinfo.radiusKm > 0
      ? Math.round(ipinfo.radiusKm * 1000)
      : null;

  let maxProviderRadiusM = 0;
  for (const c of valid) {
    if (trustLocalBin && c.provider !== "ip2location") continue;
    if (c.radiusKm != null && c.radiusKm > 0) {
      maxProviderRadiusM = Math.max(maxProviderRadiusM, c.radiusKm * 1000);
    }
  }

  const fusionPool = trustLocalBin
    ? [ip2loc!]
    : hasStrongAgreement
      ? agreement.members
      : valid;
  let lat: number;
  let lon: number;

  if (fusionPool.length === 1) {
    lat = fusionPool[0].lat;
    lon = fusionPool[0].lon;
  } else {
    const centroid = weightedCentroid(fusionPool);
    lat = centroid.lat;
    lon = centroid.lon;
  }

  const activeSpreadM = trustLocalBin
    ? 0
    : fusionPool.length > 1
      ? maxPairwiseSpread(fusionPool)
      : spreadM;
  const spreadBasedM = Math.round(activeSpreadM / 2 + 400);
  let accuracyM = Math.max(spreadBasedM, valid.length === 1 ? 1800 : 1200);

  if (ipinfoRadiusM != null && ipinfoRadiusM > 0) {
    accuracyM = Math.min(
      Math.max(accuracyM, Math.round(ipinfoRadiusM * 0.85)),
      Math.round(ipinfoRadiusM * 1.15),
    );
  }

  if (hasStrongAgreement) {
    accuracyM = Math.min(
      accuracyM,
      Math.max(400, Math.round(agreement.spreadM / 2 + 200)),
    );
  } else if (activeSpreadM < 1500) {
    accuracyM = Math.min(accuracyM, Math.max(600, Math.round(activeSpreadM / 2 + 300)));
  } else if (activeSpreadM < 4000) {
    accuracyM = Math.min(accuracyM, Math.round(activeSpreadM / 2 + 500));
  }

  accuracyM = Math.max(accuracyM, Math.round(activeSpreadM / 2));
  if (maxProviderRadiusM > 0) {
    accuracyM = Math.max(accuracyM, Math.round(maxProviderRadiusM * 0.9));
  }
  if (isKr && independentProviderCount <= 1 && !trustLocalBin) {
    accuracyM = Math.max(accuracyM, 3500);
  }

  let precisionScore = hasStrongAgreement ? 80 : 68;
  if (activeSpreadM > MAX_ALLOWED_ACCURACY_M) precisionScore -= 30;
  else if (activeSpreadM > 3000) precisionScore -= 22;
  else if (activeSpreadM > 1000) precisionScore -= 10;
  else if (activeSpreadM < 400) precisionScore += 8;

  if (hasStrongAgreement) precisionScore += 10;
  if (ipApi && isKr) precisionScore += 5;
  if (rawSpreadM > 80_000) precisionScore -= 18;
  if (valid.length >= 3) precisionScore += 4;
  else if (valid.length >= 2) precisionScore += 2;

  if (options?.ipinfoPlus) {
    precisionScore += options.ipinfoPlus.precisionDelta;
    if (options.ipinfoPlus.isPlus && options.ipinfoPlus.radiusKm != null) {
      if (options.ipinfoPlus.radiusKm <= 10) precisionScore += 6;
      else if (options.ipinfoPlus.radiusKm > 150) precisionScore -= 8;
    }
  }

  precisionScore = Math.max(12, Math.min(hasStrongAgreement ? 88 : 85, precisionScore));

  if (trustLocalBin) {
    const alignedCount = valid.filter(
      (c) =>
        c.provider !== "ip2location" &&
        haversineMeters(c.lat, c.lon, ip2loc!.lat, ip2loc!.lon) <=
          EXACT_PROVIDER_AGREEMENT_M,
    ).length;
    accuracyM =
      alignedCount > 0
        ? IP2LOCATION_ALIGNED_ACCURACY_M
        : IP2LOCATION_CITY_ACCURACY_M;
    precisionScore = alignedCount > 0 ? 78 : 72;
  }

  if (spreadM > MAX_ALLOWED_ACCURACY_M && !trustLocalBin) {
    precisionScore = Math.min(precisionScore, 42);
  }

  const confidenceLevel: FusedCoordinates["confidenceLevel"] =
    options?.ipinfoPlus?.isAnonymous ||
    options?.ipinfoPlus?.isHosting ||
    options?.ipinfoPlus?.isAnycast
      ? "low"
      : trustLocalBin
        ? accuracyM <= IP2LOCATION_ALIGNED_ACCURACY_M
          ? "high"
          : "medium"
        : spreadM > MAX_ALLOWED_ACCURACY_M || highDisagreement
          ? "low"
          : options?.ipinfoPlus?.isPlus &&
              options.ipinfoPlus.geoTrustScore >= 80 &&
              options.ipinfoPlus.radiusKm != null &&
              options.ipinfoPlus.radiusKm <= 15
            ? hasStrongAgreement
              ? "high"
              : "medium"
            : hasStrongAgreement
              ? "high"
              : rawSpreadM > 80_000
                ? "medium"
                : precisionScore >= 72
                  ? "high"
                  : precisionScore >= 48
                    ? "medium"
                    : "low";

  return {
    lat,
    lon,
    accuracyM,
    spreadM: Math.round(spreadM),
    rawSpreadM: Math.round(rawSpreadM),
    providers,
    precisionScore,
    confidenceLevel,
    agreementCount: agreement.members.length,
    independentProviderCount,
    highDisagreement,
    maxProviderRadiusM: maxProviderRadiusM > 0 ? Math.round(maxProviderRadiusM) : undefined,
    trustLocalBin,
    highConfidenceAgreement,
  };
}

export function toGeoCandidate(
  lat: number | undefined,
  lon: number | undefined,
  provider: string,
  radiusKm?: number,
): GeoPointCandidate | null {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return {
    lat,
    lon,
    provider,
    weight: PROVIDER_WEIGHT[provider] ?? 3,
    radiusKm,
  };
}
