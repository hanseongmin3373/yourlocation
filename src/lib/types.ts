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
