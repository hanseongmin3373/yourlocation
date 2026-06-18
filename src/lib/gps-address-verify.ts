import { haversineMeters } from "./geo-fusion";

/** GPS 역지오코딩 vs 사용자 선택 주소 허용 거리 (m) */
export const GPS_ADDRESS_VERIFY_MAX_M = 800;

export type VerifiedAddressInput = {
  lat: number;
  lon: number;
  address: string;
  roadAddress?: string;
  legalAddress?: string;
  sido?: string;
  sigungu?: string;
  dong?: string;
};

export function pickDisplayAddress(v: VerifiedAddressInput): string {
  return v.roadAddress?.trim() || v.address.trim();
}

/** 사용자가 주소를 직접 고른 경우 — 건물·도로명 좌표 우선 */
export function buildVerifiedRegistration(
  picked: VerifiedAddressInput,
  gpsAccuracyM?: number,
): {
  lat: number;
  lon: number;
  accuracyM: number;
  address: string;
  roadAddress: string;
  appliedAddress: string;
  userVerified: true;
} {
  const road = pickDisplayAddress(picked);
  return {
    lat: picked.lat,
    lon: picked.lon,
    accuracyM: Math.max(3, Math.min(gpsAccuracyM ?? 12, 15)),
    address: road,
    roadAddress: road,
    appliedAddress: road,
    userVerified: true,
  };
}

export function gpsMatchesAddress(
  gpsLat: number,
  gpsLon: number,
  addressLat: number,
  addressLon: number,
  maxM = GPS_ADDRESS_VERIFY_MAX_M,
): boolean {
  return haversineMeters(gpsLat, gpsLon, addressLat, addressLon) <= maxM;
}
