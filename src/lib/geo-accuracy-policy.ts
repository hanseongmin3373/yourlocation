/**
 * 고신뢰(동 350m) / 일반(구 800m) / 저신뢰 이중·삼중 정책
 */
import {
  GU_LEVEL_MAX_ACCURACY_M,
  HIGH_CONFIDENCE_AGREEMENT_M,
  HIGH_CONFIDENCE_PROVIDER_MIN,
  MAX_ALLOWED_ACCURACY_M,
  refineAccuracyForAdminLevel,
} from "./geo-accuracy";

/** 고신뢰 — 행정동 + 작은 오차 원 */
export const HIGH_CONFIDENCE_DONG_MAX_ACCURACY_M = 350;

/** 일반 — 시·군·구 중심 */
export const NORMAL_GU_MAX_ACCURACY_M = 800;

/** ipinfo Plus radius 상한 (고신뢰 dong) */
export const HIGH_CONFIDENCE_RADIUS_KM = 5;

/** 다중 DB spread 상한 (고신뢰) */
export const HIGH_CONFIDENCE_SPREAD_M = 400;

export type AccuracyTier = "high" | "normal" | "low";

export type AccuracyPolicyInput = {
  baseAccuracyM: number;
  trustGeoCity: boolean;
  addressAligned: boolean;
  hasDong: boolean;
  resolvedDong?: string | null;
  krAddressLevel?: "road" | "dong" | "district";
  ipinfoRadiusKm?: number | null;
  spreadM?: number | null;
  independentProviderCount?: number;
  highConfidenceAgreement?: boolean;
  geoTrustScore?: number;
  isVpn?: boolean;
  isHosting?: boolean;
  isAnycast?: boolean;
  ispCorrectionBoost?: boolean;
  crowdDbBoost?: boolean;
  expertRefinedM?: number | null;
};

export type AccuracyPolicyResult = {
  tier: AccuracyTier;
  displayAccuracyM: number;
  showDong: boolean;
  tierNote: string;
};

export function qualifiesHighConfidenceTier(
  input: AccuracyPolicyInput,
): boolean {
  if (input.isVpn || input.isHosting || input.isAnycast) return false;
  if (!input.hasDong) return false;

  const spread = input.spreadM ?? 99999;
  const providers = input.independentProviderCount ?? 1;
  const radius = input.ipinfoRadiusKm;
  const trust =
    input.trustGeoCity ||
    input.addressAligned ||
    Boolean(input.ispCorrectionBoost);

  if (!trust) return false;

  const geoOk =
    input.geoTrustScore == null || input.geoTrustScore >= 58;

  if (
    radius != null &&
    radius > 0 &&
    radius <= HIGH_CONFIDENCE_RADIUS_KM &&
    input.addressAligned &&
    geoOk
  ) {
    return true;
  }

  if (
    providers >= 2 &&
    spread < HIGH_CONFIDENCE_SPREAD_M &&
    input.addressAligned &&
    geoOk
  ) {
    return true;
  }

  if (
    input.highConfidenceAgreement &&
    providers >= HIGH_CONFIDENCE_PROVIDER_MIN &&
    spread <= HIGH_CONFIDENCE_AGREEMENT_M &&
    input.addressAligned
  ) {
    return true;
  }

  if (input.ispCorrectionBoost && input.addressAligned && spread < 800 && geoOk) {
    return true;
  }

  if (
    input.crowdDbBoost &&
    input.addressAligned &&
    input.hasDong &&
    spread <= 1200
  ) {
    return true;
  }

  if (
    input.krAddressLevel === "dong" &&
    input.trustGeoCity &&
    spread < 600 &&
    (radius == null || radius <= 15)
  ) {
    return true;
  }

  return false;
}

/** base 오차 → tier별 displayAccuracyM + 동 표시 여부 */
export function applyDualAccuracyPolicy(
  input: AccuracyPolicyInput,
): AccuracyPolicyResult {
  let refined = refineAccuracyForAdminLevel({
    accuracyM: input.baseAccuracyM,
    hasDong: input.hasDong,
    trustGeoCity: input.trustGeoCity,
    addressAligned: input.addressAligned,
    ipinfoRadiusKm: input.ipinfoRadiusKm,
    spreadM: input.spreadM,
    expertRefinedM: input.expertRefinedM,
  });

  const high = qualifiesHighConfidenceTier(input);

  if (high) {
    if (input.ipinfoRadiusKm != null && input.ipinfoRadiusKm > 0) {
      const rM = input.ipinfoRadiusKm * 1000;
      refined = Math.min(
        refined,
        Math.max(160, Math.round(rM * 0.35)),
        HIGH_CONFIDENCE_DONG_MAX_ACCURACY_M,
      );
    } else {
      refined = Math.min(refined, HIGH_CONFIDENCE_DONG_MAX_ACCURACY_M);
    }

    const spread = input.spreadM ?? 0;
    if (spread > 0 && spread < HIGH_CONFIDENCE_SPREAD_M) {
      refined = Math.min(
        refined,
        Math.max(180, Math.round(spread / 2 + 80)),
      );
    }

    return {
      tier: "high",
      displayAccuracyM: Math.max(160, refined),
      showDong: Boolean(input.hasDong && input.resolvedDong),
      tierNote: `고신뢰 행정동 (±${Math.round(Math.min(refined, HIGH_CONFIDENCE_DONG_MAX_ACCURACY_M))}m)`,
    };
  }

  const normalTrust =
    input.trustGeoCity ||
    input.addressAligned ||
    Boolean(input.ispCorrectionBoost) ||
    Boolean(input.crowdDbBoost);

  if (input.crowdDbBoost && input.addressAligned) {
    refined = Math.min(
      refined,
      input.hasDong ? HIGH_CONFIDENCE_DONG_MAX_ACCURACY_M + 80 : NORMAL_GU_MAX_ACCURACY_M,
    );
  }

  if (normalTrust) {
    refined = Math.min(refined, NORMAL_GU_MAX_ACCURACY_M);

    const showDong = Boolean(
      input.hasDong &&
        input.resolvedDong &&
        (input.trustGeoCity || input.addressAligned) &&
        refined <= NORMAL_GU_MAX_ACCURACY_M + 120,
    );

    return {
      tier: "normal",
      displayAccuracyM: Math.max(280, refined),
      showDong,
      tierNote: showDong
        ? `시·군·구·동 추정 (±${Math.round(refined)}m)`
        : `시·군·구 추정 (±${Math.round(refined)}m)`,
    };
  }

  refined = Math.min(refined, GU_LEVEL_MAX_ACCURACY_M);

  return {
    tier: "low",
    displayAccuracyM: Math.max(400, Math.min(refined, MAX_ALLOWED_ACCURACY_M)),
    showDong: false,
    tierNote: `저신뢰 구역 (±${Math.round(refined)}m)`,
  };
}
