import { resolveAddressFromCoords } from "./kakao-geocode";
import type { GeoLocationData } from "./types";

interface IpApiResponse {
  status: string;
  message?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  query?: string;
}

interface IpWhoResponse {
  success?: boolean;
  ip?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: { id?: string };
  connection?: { isp?: string; org?: string; asn?: number };
  message?: string;
}

interface GeoCandidate {
  lat: number;
  lon: number;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  zip: string;
  timezone: string;
  isp: string;
  org: string;
  as: string;
  ip: string;
  provider: string;
}

const KR_IP_DEFAULT_ACCURACY_M = 2500;

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function lookupFromIpApi(ip: string): Promise<GeoCandidate | null> {
  const fields =
    "status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query";
  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=ko&fields=${fields}`;

  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) return null;

  const data: IpApiResponse = await response.json();
  if (data.status !== "success" || data.lat == null || data.lon == null) {
    return null;
  }

  return {
    lat: data.lat,
    lon: data.lon,
    country: data.country || "",
    countryCode: data.countryCode || "",
    region: data.regionName || "",
    city: data.city || "",
    zip: data.zip || "",
    timezone: data.timezone || "",
    isp: data.isp || "",
    org: data.org || "",
    as: data.as || "",
    ip: data.query || ip,
    provider: "ip-api",
  };
}

async function lookupFromIpWho(ip: string): Promise<GeoCandidate | null> {
  const url = `https://ipwho.is/${encodeURIComponent(ip)}?language=ko`;

  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) return null;

  const data: IpWhoResponse = await response.json();
  if (
    !data.success ||
    data.latitude == null ||
    data.longitude == null
  ) {
    return null;
  }

  return {
    lat: data.latitude,
    lon: data.longitude,
    country: data.country || "",
    countryCode: data.country_code || "",
    region: data.region || "",
    city: data.city || "",
    zip: "",
    timezone: data.timezone?.id || "",
    isp: data.connection?.isp || "",
    org: data.connection?.org || "",
    as: data.connection?.asn ? `AS${data.connection.asn}` : "",
    ip: data.ip || ip,
    provider: "ipwho",
  };
}

function mergeCandidates(candidates: GeoCandidate[]): {
  lat: number;
  lon: number;
  accuracyM: number;
  providerNote: string;
  base: GeoCandidate;
} {
  if (candidates.length === 1) {
    return {
      lat: candidates[0].lat,
      lon: candidates[0].lon,
      accuracyM: KR_IP_DEFAULT_ACCURACY_M,
      providerNote: `${candidates[0].provider} 단일 추정`,
      base: candidates[0],
    };
  }

  const [a, b] = candidates;
  const spreadM = haversineMeters(a.lat, a.lon, b.lat, b.lon);
  const lat = (a.lat + b.lat) / 2;
  const lon = (a.lon + b.lon) / 2;

  const accuracyM = Math.max(
    KR_IP_DEFAULT_ACCURACY_M,
    Math.round(spreadM / 2 + 1200),
  );

  const providerNote =
    spreadM > 1500
      ? `복수 DB 불일치 (약 ${Math.round(spreadM / 100) / 10}km) — 추정 범위 확대`
      : `복수 DB 평균 (오차 약 ${Math.round(accuracyM / 100) / 10}km)`;

  return {
    lat,
    lon,
    accuracyM,
    providerNote,
    base: a.isp ? a : b,
  };
}

export async function lookupIp(ip: string): Promise<GeoLocationData> {
  const [ipApi, ipWho] = await Promise.all([
    lookupFromIpApi(ip),
    lookupFromIpWho(ip),
  ]);

  const candidates = [ipApi, ipWho].filter(
    (item): item is GeoCandidate => item !== null,
  );

  if (candidates.length === 0) {
    throw new Error("IP 조회 서비스에 연결할 수 없습니다.");
  }

  const merged = mergeCandidates(candidates);
  const kakaoAddress = await resolveAddressFromCoords(merged.lat, merged.lon);

  const fallbackAddress = [
    merged.base.country,
    merged.base.region,
    merged.base.city,
  ]
    .filter(Boolean)
    .join(" ");

  const address = kakaoAddress?.full || fallbackAddress || "주소 정보 없음";
  const city = kakaoAddress?.sigungu || merged.base.city;
  const region = kakaoAddress?.sido || merged.base.region;

  return {
    ip: merged.base.ip || ip,
    country: merged.base.country,
    countryCode: merged.base.countryCode,
    region,
    city,
    zip: merged.base.zip,
    lat: merged.lat,
    lon: merged.lon,
    timezone: merged.base.timezone,
    isp: merged.base.isp,
    org: merged.base.org,
    as: merged.base.as,
    address,
    dong: kakaoAddress?.dong || "",
    accuracyM: merged.accuracyM,
    locationSource: "ip",
    accuracyNote: `IP 위치 추정 (동 단위 부정확할 수 있음). ${merged.providerNote}. 정확한 위치는 GPS「현재 위치 확인」을 이용하세요.`,
  };
}

export function isValidIp(ip: string): boolean {
  const ipv4 =
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  const ipv6 =
    /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)\.){3}(25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)\.){3}(25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d))$/;
  return ipv4.test(ip) || ipv6.test(ip);
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "127.0.0.1";
}

export { resolveAddressFromCoords } from "./kakao-geocode";
