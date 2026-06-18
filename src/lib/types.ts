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
  locationSource?: "ip" | "gps" | "crowd" | "pinpoint";
  accuracyNote?: string;
  /** true — 지도에 오차 원 없이 단일 좌표 표시 */
  exactPin?: boolean;
  /** 사용자가 도로명 주소를 직접 확인한 등록 DB */
  userVerified?: boolean;
  /** 조회에 사용된 IP 지오로케이션 제공자 */
  geoProvider?: string;
  isVpn?: boolean;
  isMobile?: boolean;
  /** 초정밀 모드 신뢰도 점수 (0–100) */
  precisionScore?: number;
  confidenceLevel?: "high" | "medium" | "low";
  roadAddress?: string;
  legalAddress?: string;
  sido?: string;
  sigungu?: string;
  /** 융합에 사용된 지오 DB 목록 */
  geoSources?: string[];
  addressSource?: string;
  expertMode?: boolean;
}

export interface GeoApiResponse {
  success: boolean;
  data?: GeoLocationData;
  error?: string;
  remaining?: number | null;
  isMember?: boolean;
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
