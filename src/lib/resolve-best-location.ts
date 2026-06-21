import { fetchOwnIpWithGps } from "./client-location";
import type { GeoLocationData } from "./types";
import type { LocationFetchResult } from "./client-location";

export type LocationResolvedVia = "gps" | "ip";

export type BestLocationResult = {
  data: GeoLocationData;
  resolvedVia: LocationResolvedVia;
  gpsFailed?: boolean;
  remaining?: number | null;
};

async function fetchIpGeolocation(ip: string): Promise<LocationFetchResult | null> {
  try {
    const res = await fetch(
      `/api/geolocation?ip=${encodeURIComponent(ip)}`,
      { cache: "no-store" },
    );
    const json = await res.json();
    if (!json.success || !json.data) return null;
    return { data: json.data as GeoLocationData, remaining: json.remaining };
  } catch {
    return null;
  }
}

/** GPS + IPinfo VPN/ISP 병합 (기기 위치 — IP와 다를 수 있음) */
export function mergeGpsWithIpMeta(
  gps: GeoLocationData,
  ip: GeoLocationData,
): GeoLocationData {
  const parts: string[] = [
    gps.accuracyM != null
      ? `기기 GPS ±${Math.round(gps.accuracyM)}m (IP 위치와 다를 수 있음)`
      : "기기 GPS",
  ];
  if (ip.isVpn || ip.privacyServiceName) {
    parts.push(
      ip.privacyServiceName
        ? `${ip.privacyServiceName} 감지`
        : "VPN/프록시 감지",
    );
  }

  return {
    ...gps,
    isp: ip.isp || gps.isp,
    org: ip.org || gps.org,
    as: ip.as || gps.as,
    isVpn: ip.isVpn,
    isProxy: ip.isProxy,
    isTor: ip.isTor,
    isRelay: ip.isRelay,
    isHosting: ip.isHosting,
    isAnycast: ip.isAnycast,
    isMobile: ip.isMobile,
    privacyServiceName: ip.privacyServiceName,
    mobileCarrier: ip.mobileCarrier,
    networkFlags: ip.networkFlags,
    ipinfoPlus: ip.ipinfoPlus,
    ipinfoRadiusKm: ip.ipinfoRadiusKm,
    geoTrustScore: ip.geoTrustScore,
    geoSources: [
      ...new Set([
        ...(gps.geoSources || []),
        ...(ip.geoSources || []),
        "browser-gps",
        ...(ip.geoProvider ? [ip.geoProvider] : []),
      ]),
    ],
    accuracyNote: parts.join(" · "),
    resolvedVia: "gps",
  };
}

/** IP 위치 — 서버 crowd DB / ipinfo / mylocation backfill */
export async function resolveIpLocation(
  ip: string,
): Promise<BestLocationResult> {
  const ipResult = await fetchIpGeolocation(ip);
  if (!ipResult?.data) {
    throw new Error("IP 위치 조회에 실패했습니다.");
  }
  return {
    data: { ...ipResult.data, resolvedVia: "ip" },
    resolvedVia: "ip",
    remaining: ipResult.remaining,
  };
}

/** 기기 GPS (별도 버튼) — IP 조회와 분리 */
export async function resolveGpsOverlay(
  ip: string,
): Promise<BestLocationResult> {
  const ipResult = await fetchIpGeolocation(ip);
  const gpsResult = await fetchOwnIpWithGps(ip, { fast: true });
  const data = ipResult?.data
    ? mergeGpsWithIpMeta(gpsResult.data, ipResult.data)
    : { ...gpsResult.data, resolvedVia: "gps" as const };

  return {
    data,
    resolvedVia: "gps",
    remaining: gpsResult.remaining ?? ipResult?.remaining,
  };
}

export async function resolveBestVisitorLocation(
  ip: string,
): Promise<BestLocationResult> {
  return resolveIpLocation(ip);
}
