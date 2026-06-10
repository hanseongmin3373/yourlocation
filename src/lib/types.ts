export interface GeoLocationData {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  org: string;
  as: string;
  address: string;
  /** 행정동 (카카오 역지오코딩) */
  dong?: string;
  /** 추정 오차 반경(미터). IP 조회 시 표시 */
  accuracyM?: number;
  locationSource?: "ip" | "gps";
  accuracyNote?: string;
}

export interface GeoApiResponse {
  success: boolean;
  data?: GeoLocationData;
  error?: string;
}

export interface ClientIpResponse {
  ip: string;
}

export interface MapPosition {
  lat: number;
  lng: number;
}

export interface PoliceStationInfo {
  name: string;
  address: string;
  phone: string;
  distanceM: number;
  lat: number;
  lng: number;
}
