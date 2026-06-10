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

function buildAddress(data: IpApiResponse): string {
  const parts = [data.country, data.regionName, data.city].filter(Boolean);
  return parts.join(" ") || "주소 정보 없음";
}

export async function lookupIp(ip: string): Promise<GeoLocationData> {
  const fields =
    "status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query";
  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=ko&fields=${fields}`;

  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error("IP 조회 서비스에 연결할 수 없습니다.");
  }

  const data: IpApiResponse = await response.json();

  if (data.status !== "success") {
    throw new Error(data.message || "유효하지 않은 IP 주소입니다.");
  }

  return {
    ip: data.query || ip,
    country: data.country || "",
    countryCode: data.countryCode || "",
    region: data.regionName || "",
    city: data.city || "",
    zip: data.zip || "",
    lat: data.lat ?? 0,
    lon: data.lon ?? 0,
    timezone: data.timezone || "",
    isp: data.isp || "",
    org: data.org || "",
    as: data.as || "",
    address: buildAddress(data),
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
