/**
 * ipinfo.io — 1차 GeoIP 엔진 (Plus Lookup API)
 */
import { haversineMeters, toGeoCandidate, type GeoPointCandidate } from "./geo-fusion";
import {
  parseIpinfoPlus,
  plusIntelToGeoFields,
  type IpinfoPlusIntel,
  type IpinfoPlusRaw,
} from "./ipinfo-plus";
import type { GeoLocationData } from "./types";

const FETCH_OPTS: RequestInit = {
  cache: "no-store",
  headers: {
    "User-Agent": "yourlocation.co.kr/2.0 (+https://www.yourlocation.co.kr)",
    Accept: "application/json",
  },
};

interface IpInfoLegacyResponse {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  postal?: string;
  timezone?: string;
  org?: string;
  hostname?: string;
  anycast?: boolean;
  asn?: { asn?: string; name?: string; domain?: string; type?: string };
  privacy?: {
    vpn?: boolean;
    proxy?: boolean;
    tor?: boolean;
    relay?: boolean;
    hosting?: boolean;
    service?: string;
  };
  error?: { title?: string; message?: string };
}

/** @deprecated IpinfoPlusIntel 사용 */
export type IpinfoMeta = IpinfoPlusIntel;

export type IpinfoLookupResult = {
  data: Partial<GeoLocationData>;
  meta: IpinfoPlusIntel;
  point: GeoPointCandidate;
};

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function parseLoc(loc?: string): { lat: number; lon: number } | null {
  if (!loc) return null;
  const [a, b] = loc.split(",").map((s) => Number(s.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { lat: a, lon: b };
}

function plusEndpoint(ip: string): string {
  if (ip.includes(":")) {
    return `https://v6.api.ipinfo.io/lookup/${encodeURIComponent(ip)}`;
  }
  return `https://api.ipinfo.io/lookup/${encodeURIComponent(ip)}`;
}

async function lookupPlus(
  ip: string,
  token: string,
): Promise<IpinfoLookupResult | null> {
  try {
    const res = await fetch(plusEndpoint(ip), {
      ...FETCH_OPTS,
      headers: authHeaders(token),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as IpinfoPlusRaw;
    const intel = parseIpinfoPlus(json);
    if (!intel) return null;

    const geo = json.geo!;
    const point = toGeoCandidate(
      geo.latitude!,
      geo.longitude!,
      "ipinfo",
      geo.radius,
    )!;

    return {
      meta: intel,
      point,
      data: plusIntelToGeoFields(json, intel),
    };
  } catch {
    return null;
  }
}

async function lookupLegacy(
  ip: string,
  token: string,
): Promise<IpinfoLookupResult | null> {
  try {
    const res = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`,
      FETCH_OPTS,
    );
    if (!res.ok) return null;

    const json = (await res.json()) as IpInfoLegacyResponse;
    if (json.error) return null;

    const coords = parseLoc(json.loc);
    if (!coords) return null;

    const privacy = json.privacy;
    const intel: IpinfoPlusIntel = {
      provider: "ipinfo",
      isPlus: false,
      hostname: json.hostname,
      isAnonymous: Boolean(
        privacy?.vpn || privacy?.proxy || privacy?.tor || privacy?.relay,
      ),
      isProxy: Boolean(privacy?.proxy),
      isRelay: Boolean(privacy?.relay),
      isTor: Boolean(privacy?.tor),
      isVpn: Boolean(privacy?.vpn),
      isAnycast: Boolean(json.anycast),
      isHosting: Boolean(privacy?.hosting),
      isMobile: false,
      isSatellite: false,
      privacyServiceName: privacy?.service?.trim() || undefined,
      asn: json.asn?.asn
        ? json.asn.asn.toUpperCase().startsWith("AS")
          ? json.asn.asn.toUpperCase()
          : `AS${json.asn.asn}`
        : undefined,
      ispName: json.asn?.name,
      ispDomain: json.asn?.domain,
      asType: json.asn?.type,
      geoTrustScore: 45,
      precisionDelta: -5,
      trustGeoCity: !privacy?.vpn && !privacy?.hosting,
      allowRoadHint: false,
      geoRecentlyChanged: false,
      asRecentlyChanged: false,
      networkFlags: [
        privacy?.vpn && "vpn",
        privacy?.proxy && "proxy",
        privacy?.tor && "tor",
        privacy?.relay && "relay",
        privacy?.hosting && "hosting",
        json.anycast && "anycast",
      ].filter(Boolean) as string[],
      accuracyNotes: ["Legacy API fallback"],
    };

    return {
      meta: intel,
      point: toGeoCandidate(coords.lat, coords.lon, "ipinfo")!,
      data: {
        country: json.country || "",
        countryCode: json.country || "",
        region: json.region || "",
        city: json.city || "",
        zip: json.postal || "",
        lat: coords.lat,
        lon: coords.lon,
        timezone: json.timezone || "",
        isp: json.asn?.name || "",
        org: json.asn?.domain || json.org || "",
        as: intel.asn || "",
        hostname: json.hostname,
        isVpn: intel.isAnonymous,
        ipinfoPlus: false,
        geoTrustScore: intel.geoTrustScore,
      },
    };
  } catch {
    return null;
  }
}

export function hasIpinfoToken(): boolean {
  return Boolean(process.env.IPINFO_TOKEN?.trim());
}

/** ipinfo.io Plus Lookup API → Legacy JSON fallback */
export async function lookupFromIpinfo(
  ip: string,
): Promise<IpinfoLookupResult | null> {
  const token = process.env.IPINFO_TOKEN?.trim();
  if (!token) return null;
  const plus = await lookupPlus(ip, token);
  if (plus) return plus;
  return lookupLegacy(ip, token);
}

/** ipinfo 1차 + 보조 제공자 합의 좌표 풀 */
export function buildIpinfoPrimaryPoints(
  ipinfo: IpinfoLookupResult,
  supplements: GeoPointCandidate[],
  maxAgreementM = 8000,
): GeoPointCandidate[] {
  const points: GeoPointCandidate[] = [ipinfo.point];
  for (const s of supplements) {
    if (
      haversineMeters(
        ipinfo.point.lat,
        ipinfo.point.lon,
        s.lat,
        s.lon,
      ) <= maxAgreementM
    ) {
      points.push(s);
    }
  }
  return points;
}

export type { IpinfoPlusIntel };
export { haversineMeters };
