import { formatAppliedAddress } from "./coord-validation";

import { normalizeIp } from "./client-ip";

import {
  formatPreciseCoord,
  getRegisterGpsPosition,
  getUltraPrecisePosition,
  getFastGpsPosition,
  gpsAccuracyM,
} from "./ultra-gps";
import { REGISTRATION_GPS_WARN_M } from "./geo-accuracy";

import type { GeoLocationData } from "./types";



export type GpsPreview = {
  lat: number;
  lon: number;
  accuracyM: number;
  address: string;
  appliedAddress: string;
  roadAddress?: string;
  dong?: string;
  sido?: string;
  sigungu?: string;
  /** 사용자가 도로명 주소를 직접 확인·선택 */
  userVerified?: boolean;
  /** GPS 원본 좌표 (주소 검색 선택 시 비교용) */
  gpsLat?: number;
  gpsLon?: number;
};

export type AddressSearchHit = {
  address: string;
  roadAddress: string;
  legalAddress?: string;
  sido?: string;
  sigungu?: string;
  dong?: string;
  lat: number;
  lon: number;
};



export type LocationRegisterResponse = {

  success: boolean;

  totalCount?: number;

  appliedAddress?: string;

  address?: string;

  dong?: string;

  sido?: string;

  sigungu?: string;

  userVerified?: boolean;

  error?: string;

};



/** 등록 모달용 주소 검색 (조회 한도 미차감) */
export async function searchRegisterAddress(
  query: string,
): Promise<AddressSearchHit[]> {
  const res = await fetch(
    `/api/location-register/geocode?q=${encodeURIComponent(query)}`,
    { cache: "no-store" },
  );
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || "주소 검색에 실패했습니다.");
  }
  return json.results as AddressSearchHit[];
}



/** 위치 DB에 GPS+IP 등록 (조회 한도 미차감) */

export async function submitLocationRegister(

  preview: GpsPreview,

  isp?: string,

  source = "gps-register",

): Promise<LocationRegisterResponse> {

  const res = await fetch("/api/location-register", {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify({
      lat: preview.lat,
      lon: preview.lon,
      accuracyM: preview.accuracyM,
      address: preview.address,
      appliedAddress: preview.userVerified
        ? preview.address
        : preview.appliedAddress,
      roadAddress: preview.roadAddress || preview.address,
      dong: preview.dong,
      sido: preview.sido,
      sigungu: preview.sigungu,
      isp,
      source,
      userVerified: preview.userVerified,
    }),

    cache: "no-store",

  });

  return res.json();

}



export function isOwnIpQuery(queryIp: string, clientIp: string): boolean {

  const q = normalizeIp(queryIp.trim());

  const c = normalizeIp(clientIp.trim());

  return Boolean(q && c && q === c);

}



export type LocationFetchResult = {

  data: GeoLocationData;

  remaining?: number | null;

};



function precisionFromGps(accuracyM: number): number {
  if (accuracyM <= 10) return 92;
  if (accuracyM <= 20) return 88;
  if (accuracyM <= 40) return 82;
  return 72;
}



async function reverseGeocode(lat: number, lon: number) {

  const res = await fetch(

    `/api/reverse-geocode?lat=${lat}&lng=${lon}`,

    { cache: "no-store" },

  );

  const json = await res.json();

  if (!json.success) {

    throw new Error(json.error || "주소 변환에 실패했습니다.");

  }

  return json as {

    address: string;

    dong?: string;

    sido?: string;

    sigungu?: string;

  };

}



/** GPS 좌표 미리보기 (등록 모달 — 정확도 낮으면 고정밀 재시도) */
export async function previewGpsLocation(): Promise<GpsPreview> {
  let pos = await getRegisterGpsPosition();
  let accuracyM = gpsAccuracyM(pos);

  if (accuracyM > REGISTRATION_GPS_WARN_M) {
    try {
      pos = await getUltraPrecisePosition();
      accuracyM = gpsAccuracyM(pos);
    } catch {
      // 빠른 GPS 결과 유지
    }
  }

  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;



  const json = await reverseGeocode(lat, lon);

  const appliedAddress = formatAppliedAddress(

    json.sido,

    json.sigungu,

    json.dong,

  );



  return {

    lat,

    lon,

    accuracyM,

    address: json.address || appliedAddress,

    appliedAddress: appliedAddress || json.address,

    roadAddress: json.address,

    dong: json.dong,

    sido: json.sido,

    sigungu: json.sigungu,

    gpsLat: lat,

    gpsLon: lon,

  };

}



/** 본인 IP — GPS 초정밀 + 등록 DB (IP GeoIP는 호출하지 않음) */

export async function fetchOwnIpWithGps(

  queryIp: string,

  opts?: { fast?: boolean },

): Promise<LocationFetchResult> {

  const pos = opts?.fast
    ? await getFastGpsPosition()
    : await getUltraPrecisePosition();

  const lat = pos.coords.latitude;

  const lng = pos.coords.longitude;

  const accuracyM = gpsAccuracyM(pos);

  const gpsRes = await fetch("/api/geolocation/gps", {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify({ lat, lng, accuracyM }),

    cache: "no-store",

  });

  const gpsJson = await gpsRes.json();



  if (!gpsJson.success) {

    throw new Error(gpsJson.error || "GPS 주소 변환에 실패했습니다.");

  }



  const data: GeoLocationData = {

    ip: normalizeIp(queryIp),

    country: "대한민국",

    countryCode: "KR",

    region: gpsJson.sido || "",

    city: gpsJson.sigungu || "",

    zip: "",

    lat,

    lon: lng,

    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

    isp: "",

    org: "",

    as: "",

    address:

      gpsJson.address ||

      `${formatPreciseCoord(lat)}, ${formatPreciseCoord(lng)}`,

    dong: gpsJson.dong || "",

    sido: gpsJson.sido || "",

    sigungu: gpsJson.sigungu || "",

    roadAddress: gpsJson.address,

    accuracyM,

    locationSource: "gps",

    accuracyNote: `GPS 미확인 ±${accuracyM}m — 주소 확인·등록 필요`,

    geoProvider: "gps",

    geoSources: ["gps"],

    precisionScore: precisionFromGps(accuracyM),

    confidenceLevel: "medium",

    expertMode: true,

    addressSource: "gps-preview",

    exactPin: false,

    userVerified: false,

  };



  return {

    data,

    remaining: gpsJson.remaining,

  };

}



export async function fetchGpsOnly(

  clientIp: string,

): Promise<LocationFetchResult> {

  const pos = await getUltraPrecisePosition();

  const lat = pos.coords.latitude;

  const lng = pos.coords.longitude;

  const accuracyM = gpsAccuracyM(pos);

  const res = await fetch("/api/geolocation/gps", {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify({ lat, lng, accuracyM }),

  });

  const json = await res.json();



  if (!json.success) {

    throw new Error(json.error || "GPS 조회에 실패했습니다.");

  }



  return {

    data: {

      ip: clientIp || "-",

      country: "대한민국",

      countryCode: "KR",

      region: json.sido || "",

      city: json.sigungu || "",

      zip: "",

      lat,

      lon: lng,

      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

      isp: "",

      org: "",

      as: "",

      address:

        json.address ||

        `${formatPreciseCoord(lat)}, ${formatPreciseCoord(lng)}`,

      dong: json.dong || "",

      sido: json.sido || "",

      sigungu: json.sigungu || "",

      accuracyM,

      locationSource: "gps",

      accuracyNote: `GPS 미확인 ±${accuracyM}m — 주소 확인·등록 필요`,

      precisionScore: precisionFromGps(accuracyM),

      confidenceLevel: "medium",

      exactPin: false,

      userVerified: false,

    },

    remaining: json.remaining,

  };

}

