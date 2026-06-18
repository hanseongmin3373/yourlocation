import { toGeoCandidate, type GeoPointCandidate } from "./geo-fusion";
import { sanitizeDbIpMeta, sanitizeGeoText } from "./geo-field-sanitize";

const FETCH_OPTS: RequestInit = {
  cache: "no-store",
  headers: {
    "User-Agent": "yourlocation.co.kr/1.0 (+https://www.yourlocation.co.kr)",
    Accept: "application/json",
  },
};

interface GeojsResponse {
  latitude?: string;
  longitude?: string;
  accuracy?: number;
  city?: string;
  region?: string;
  country_code?: string;
  organization_name?: string;
}

interface DbIpResponse {
  countryCode?: string;
  stateProv?: string;
  city?: string;
}

export type DbIpMeta = {
  provider: "db-ip";
  countryCode?: string;
  stateProv?: string;
  city?: string;
};

/** geojs.io — 서버 fetch 가능, accuracy(m) 제공 */
export async function lookupFromGeojs(ip: string): Promise<{
  point: GeoPointCandidate;
  city?: string;
  region?: string;
} | null> {
  try {
    const res = await fetch(
      `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`,
      FETCH_OPTS,
    );
    if (!res.ok) return null;

    const json = (await res.json()) as GeojsResponse;
    const lat = Number(json.latitude);
    const lon = Number(json.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    // geojs accuracy 필드는 km 단위 (예: 50 → 50km 반경)
    const radiusKm =
      json.accuracy != null && json.accuracy > 0 ? json.accuracy : undefined;

    const point = toGeoCandidate(lat, lon, "geojs", radiusKm);
    if (!point) return null;

    return { point, city: sanitizeGeoText(json.city), region: sanitizeGeoText(json.region) };
  } catch {
    return null;
  }
}

/** db-ip.com free — 좌표 없음, 시·도·구 텍스트만 (주소 힌트용) */
export async function lookupFromDbIp(ip: string): Promise<DbIpMeta | null> {
  try {
    const res = await fetch(
      `https://api.db-ip.com/v2/free/${encodeURIComponent(ip)}`,
      FETCH_OPTS,
    );
    if (!res.ok) return null;

    const json = (await res.json()) as DbIpResponse;
    const cleaned = sanitizeDbIpMeta({
      countryCode: json.countryCode,
      stateProv: json.stateProv,
      city: json.city,
    });
    if (!cleaned.city && !cleaned.stateProv) return null;

    return {
      provider: "db-ip",
      ...cleaned,
    };
  } catch {
    return null;
  }
}
