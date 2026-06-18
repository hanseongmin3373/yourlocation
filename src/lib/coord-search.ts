import { resolveAddressFromCoords } from "./kakao-geocode";
import { isValidCoordinate } from "./coord-validation";
import type { GeoLocationData } from "./types";

/** 위도·경도 → 주소·핀포인트 조회 */
export async function lookupCoordinates(
  lat: number,
  lon: number,
): Promise<GeoLocationData> {
  if (!isValidCoordinate(lat, lon)) {
    throw new Error("올바른 위도·경도가 아닙니다.");
  }

  const detail = await resolveAddressFromCoords(lat, lon);
  if (!detail) {
    throw new Error("해당 좌표의 주소를 찾을 수 없습니다.");
  }

  const address = detail.road || detail.full;

  return {
    ip: "-",
    country: detail.sido ? "대한민국" : "",
    countryCode: detail.sido ? "KR" : "",
    region: detail.sido || "",
    city: detail.sigungu || "",
    zip: "",
    lat,
    lon,
    timezone: "Asia/Seoul",
    isp: "",
    org: "",
    as: "",
    address,
    dong: detail.dong || undefined,
    sido: detail.sido || undefined,
    sigungu: detail.sigungu || undefined,
    roadAddress: detail.road || undefined,
    legalAddress:
      detail.legal !== detail.full ? detail.legal : undefined,
    locationSource: "pinpoint",
    accuracyNote: "위도·경도 역지오코딩 좌표 고정",
    geoProvider: "kakao-coord",
    geoSources: ["coord-search"],
    precisionScore: 98,
    confidenceLevel: "high",
    addressSource: "coord2address",
    expertMode: true,
    exactPin: true,
  };
}
