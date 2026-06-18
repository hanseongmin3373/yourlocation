import {
  ACCURACY_EXCEEDED_NOTE,
  buildDistrictAddress,
  capPrecisionForAccuracy,
  effectiveAccuracyM,
  ESTIMATED_IP_ACCURACY_NOTE,
  IP2LOCATION_ALIGNED_ACCURACY_M,
  IP2LOCATION_CITY_ACCURACY_M,
  HIGH_CONFIDENCE_AGREEMENT_M,
  MAX_ALLOWED_ACCURACY_M,
  qualifiesExactPin,
} from "./geo-accuracy";
import { isPrivateIp, normalizeIp } from "./client-ip";
import {
  sanitizeDisplayAddress,
  sanitizeGeoFields,
  sanitizeGeoText,
} from "./geo-field-sanitize";
import {
  fuseCoordinates,
  haversineMeters,
  toGeoCandidate,
  type GeoPointCandidate,
} from "./geo-fusion";
import { resolveKoreanAddressExpert } from "./geo-kr-expert";
import { buildPinpointNote } from "./geo-pinpoint";
import { lookupCrowdIp, lookupCrowdIspCluster, lookupCrowdSibling } from "./crowd-ip-db";
import {
  lookupFromDbIp,
  lookupFromGeojs,
  type DbIpMeta,
} from "./geo-supplementary";
import { lookupFromIp2Location } from "./geo-ip2location";
import { mapCityToKorean, mapRegionToKorean, parseDbIpCityHints, isDongLevelName } from "./ipinfo-kr";
import { lookupKisaWhois } from "./kisa-whois";
import { createMemoryCache } from "./memory-cache";
import { resolveAddressFromCoords, geocodeSigunguCenter } from "./kakao-geocode";
import type { GeoLocationData } from "./types";

const IP_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const ipLookupCache = createMemoryCache<GeoLocationData>(IP_LOOKUP_CACHE_TTL_MS, 300);
const OPTIONAL_PROVIDER_MS = 1000;
const IPINFO_LOOKUP_MS = 1200;
const KISA_WHOIS_MS = 1500;
const DB_IP_LOOKUP_MS = 1500;
const CROWD_LOOKUP_MS = 1400;
const IP_API_MS = 2200;

async function withTimeout<T>(
  promise: Promise<T | null>,
  ms: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function lookupSupplementalProviders(ip: string) {
  return Promise.all([
    withTimeout(lookupFromIpWho(ip), OPTIONAL_PROVIDER_MS),
    withTimeout(lookupFromGeojs(ip), OPTIONAL_PROVIDER_MS),
  ]);
}

function hasIpinfoToken(): boolean {
  return Boolean(process.env.IPINFO_TOKEN?.trim());
}

function cityHintsAgree(
  dbIp: DbIpMeta | null,
  ipApiCity?: string,
  ipinfoCity?: string,
): boolean {
  const dbHints = parseDbIpCityHints(dbIp?.city);
  if (!dbHints.sigungu) return false;
  const dbN = normalizeGuName(dbHints.sigungu);
  const apiN = normalizeGuName(mapCityToKorean(ipApiCity) || ipApiCity || "");
  if (apiN && dbN === apiN) return true;
  const infoN = normalizeGuName(mapCityToKorean(ipinfoCity) || ipinfoCity || "");
  return Boolean(infoN && dbN === infoN);
}

function logLookupPerf(ip: string, startedAt: number) {
  if (process.env.GEO_PERF_LOG !== "1") return;
  console.log(`[lookupIp] ${ip} ${Date.now() - startedAt}ms`);
}

function normalizeGuForFast(name: string): string {
  return name.replace(/\s+/g, "").replace(/(특별시|광역시|특별자치시|시|군|구)$/g, "");
}

function cacheAndReturn(ip: string, data: GeoLocationData, startedAt: number) {
  const clean = sanitizeGeoFields(data) as GeoLocationData;
  ipLookupCache.set(ip, clean);
  logLookupPerf(ip, startedAt);
  return clean;
}

const FETCH_OPTS: RequestInit = {
  cache: "no-store",
  headers: {
    "User-Agent": "yourlocation.co.kr/1.0 (+https://www.yourlocation.co.kr)",
    Accept: "application/json",
  },
};

interface IpApiResponse {
  status: string;
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  district?: string;
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
  success: boolean;
  ip?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  postal?: string;
  latitude?: number;
  longitude?: number;
  timezone?: { id?: string };
  connection?: { isp?: string; org?: string; asn?: number };
}

interface IpInfoLookupResponse {
  ip?: string;
  geo?: {
    city?: string;
    region?: string;
    region_code?: string;
    country?: string;
    country_code?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    postal_code?: string;
    radius?: number;
  };
  as?: {
    asn?: string;
    name?: string;
    domain?: string;
    type?: string;
  };
  is_mobile?: boolean;
  is_hosting?: boolean;
  is_anonymous?: boolean;
  anonymous?: { is_vpn?: boolean; name?: string };
}

interface IpInfoLegacyResponse {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  postal?: string;
  timezone?: string;
  org?: string;
  error?: { title?: string; message?: string };
}

type IpinfoMeta = {
  provider: string;
  isMobile?: boolean;
  isVpn?: boolean;
  isHosting?: boolean;
  radiusKm?: number;
  regionCode?: string;
};

function ipinfoAuthHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function parseLoc(loc?: string): { lat: number; lon: number } | null {
  if (!loc) return null;
  const [a, b] = loc.split(",").map((s) => Number(s.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { lat: a, lon: b };
}

function buildPinpointAccuracyNote(
  meta: IpinfoMeta | null,
  fused: { providers: string[] },
  addressSource: string,
): string {
  const parts = [buildPinpointNote(fused.providers, addressSource)];

  if (meta?.isVpn) {
    parts.push("VPN/프록시 — 실제 위치와 다를 수 있음");
  }

  return parts.join(" · ");
}

async function lookupFromIpinfoLookup(
  ip: string,
  token: string,
): Promise<{
  data: Partial<GeoLocationData>;
  meta: IpinfoMeta;
  point: GeoPointCandidate;
} | null> {
  try {
    const res = await fetch(
      `https://api.ipinfo.io/lookup/${encodeURIComponent(ip)}`,
      { ...FETCH_OPTS, headers: ipinfoAuthHeaders(token) },
    );
    if (!res.ok) return null;

    const json = (await res.json()) as IpInfoLookupResponse;
    const geo = json.geo;
    if (!geo?.latitude || !geo?.longitude) return null;

    const meta: IpinfoMeta = {
      provider: "ipinfo",
      isMobile: json.is_mobile,
      isVpn: json.is_anonymous || json.anonymous?.is_vpn,
      isHosting: json.is_hosting,
      radiusKm: geo.radius,
      regionCode: geo.region_code,
    };

    const point = toGeoCandidate(
      geo.latitude,
      geo.longitude,
      "ipinfo",
      geo.radius,
    )!;

    return {
      meta,
      point,
      data: {
        country: geo.country || "",
        countryCode: geo.country_code || "",
        region: geo.region || "",
        city: geo.city || "",
        zip: geo.postal_code || "",
        lat: geo.latitude,
        lon: geo.longitude,
        timezone: geo.timezone || "",
        isp: json.as?.name || "",
        org: json.as?.domain || "",
        as: json.as?.asn ? `AS${json.as.asn}` : "",
      },
    };
  } catch {
    return null;
  }
}

async function lookupFromIpinfoLegacy(
  ip: string,
  token: string,
): Promise<{
  data: Partial<GeoLocationData>;
  meta: IpinfoMeta;
  point: GeoPointCandidate;
} | null> {
  try {
    const res = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}`,
      { ...FETCH_OPTS, headers: ipinfoAuthHeaders(token) },
    );
    if (!res.ok) return null;

    const json = (await res.json()) as IpInfoLegacyResponse;
    if (json.error) return null;

    const coords = parseLoc(json.loc);
    if (!coords) return null;

    const point = toGeoCandidate(coords.lat, coords.lon, "ipinfo")!;

    return {
      meta: { provider: "ipinfo" },
      point,
      data: {
        country: json.country || "",
        countryCode: json.country || "",
        region: json.region || "",
        city: json.city || "",
        zip: json.postal || "",
        lat: coords.lat,
        lon: coords.lon,
        timezone: json.timezone || "",
        isp: "",
        org: json.org || "",
        as: "",
      },
    };
  } catch {
    return null;
  }
}

async function lookupFromIpinfo(ip: string) {
  const token = process.env.IPINFO_TOKEN?.trim();
  if (!token) return null;
  const plus = await lookupFromIpinfoLookup(ip, token);
  if (plus) return plus;
  return lookupFromIpinfoLegacy(ip, token);
}

async function lookupFromIpApi(ip: string) {
  try {
    const fields =
      "status,message,country,countryCode,regionName,city,district,zip,lat,lon,timezone,isp,org,as,query";
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=ko&fields=${fields}`,
      FETCH_OPTS,
    );
    if (!res.ok) return null;

    const json = (await res.json()) as IpApiResponse;
    if (json.status !== "success" || json.lat == null || json.lon == null) {
      return null;
    }

    return {
      data: sanitizeGeoFields({
        country: json.country || "",
        countryCode: json.countryCode || "",
        region: json.regionName || "",
        city: json.city || "",
        zip: json.zip || "",
        lat: json.lat,
        lon: json.lon,
        timezone: json.timezone || "",
        isp: json.isp || "",
        org: json.org || "",
        as: json.as || "",
        district: json.district || "",
      }) as Partial<GeoLocationData> & { district?: string },
      point: toGeoCandidate(json.lat, json.lon, "ip-api")!,
    };
  } catch {
    return null;
  }
}

async function lookupFromIpWho(ip: string) {
  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?language=ko`,
      FETCH_OPTS,
    );
    if (!res.ok) return null;

    const json = (await res.json()) as IpWhoResponse;
    if (!json.success || json.latitude == null || json.longitude == null) {
      return null;
    }

    return {
      data: {
        country: json.country || "",
        countryCode: json.country_code || "",
        region: json.region || "",
        city: json.city || "",
        zip: json.postal || "",
        lat: json.latitude,
        lon: json.longitude,
        timezone: json.timezone?.id || "",
        isp: json.connection?.isp || "",
        org: json.connection?.org || "",
        as: json.connection?.asn ? `AS${json.connection.asn}` : "",
      } as Partial<GeoLocationData>,
      point: toGeoCandidate(json.latitude, json.longitude, "ipwho")!,
    };
  } catch {
    return null;
  }
}

function mergeFields(
  primary: Partial<GeoLocationData>,
  ...others: (Partial<GeoLocationData> | null | undefined)[]
): Partial<GeoLocationData> {
  const all = [primary, ...others.filter(Boolean)] as Partial<GeoLocationData>[];
  const pick = (key: keyof GeoLocationData) => {
    for (const src of all) {
      const v = src[key];
      if (v !== undefined && v !== null && v !== "") {
        if (typeof v === "string") {
          const clean = sanitizeGeoText(v);
          if (clean) return clean;
        } else {
          return v;
        }
      }
    }
    return "";
  };

  return {
    country: pick("country") as string,
    countryCode: pick("countryCode") as string,
    region: pick("region") as string,
    city: pick("city") as string,
    zip: pick("zip") as string,
    timezone: pick("timezone") as string,
    isp: pick("isp") as string,
    org: pick("org") as string,
    as: pick("as") as string,
    lat: primary.lat,
    lon: primary.lon,
  };
}

function isKorea(partial: Partial<GeoLocationData>): boolean {
  return (
    partial.countryCode === "KR" ||
    partial.country === "KR" ||
    partial.country === "South Korea" ||
    partial.country === "Korea" ||
    partial.country === "대한민국"
  );
}

function normalizeGuName(name?: string): string {
  return (name || "")
    .replace(/\s+/g, "")
    .replace(/(특별시|광역시|특별자치시|시|군|구)$/g, "");
}

function resolveTrustedSigungu(
  ipApiCity?: string,
  ipinfoCity?: string,
  ipWhoCity?: string,
  coordSigungu?: string,
  dbIp?: DbIpMeta | null,
  ip2locCity?: string,
): { sigungu: string; trustGeoCity: boolean; dbIpDong?: string; dbIpPreferred?: boolean } {
  const dbHints = parseDbIpCityHints(dbIp?.city);
  const dbSigungu = dbHints.sigungu;

  const geoCities = [ipApiCity, ipinfoCity, ipWhoCity, ip2locCity]
    .filter((c) => c && !isDongLevelName(c))
    .map((c) => mapCityToKorean(c!) || c || "")
    .filter(Boolean);
  const allSigungu = dbSigungu ? [...geoCities, dbSigungu] : geoCities;
  const normalized = allSigungu.map(normalizeGuName).filter(Boolean);
  const unique = new Set(normalized);

  const coordN = normalizeGuName(mapCityToKorean(coordSigungu) || coordSigungu);
  const primary = mapCityToKorean(ipApiCity) || ipApiCity || "";

  if (unique.size > 1 && dbSigungu) {
    const dbN = normalizeGuName(dbSigungu);
    const coordConflicts = Boolean(coordN && dbN && coordN !== dbN);
    const primaryConflicts = Boolean(
      primary && dbN && normalizeGuName(primary) !== dbN,
    );
    if (coordConflicts || primaryConflicts) {
      return {
        sigungu: dbSigungu,
        trustGeoCity: true,
        dbIpDong: dbHints.dong,
        dbIpPreferred: true,
      };
    }
  }

  if (unique.size > 1) {
    return {
      sigungu: coordSigungu || primary,
      trustGeoCity: false,
      dbIpDong: dbHints.dong,
    };
  }

  if (coordN && primary && coordN !== normalizeGuName(primary)) {
    return {
      sigungu: coordSigungu || primary,
      trustGeoCity: false,
      dbIpDong: dbHints.dong,
    };
  }

  if (!dbSigungu && dbHints.dong && primary) {
    return {
      sigungu: primary,
      trustGeoCity: true,
      dbIpDong: dbHints.dong,
    };
  }

  return {
    sigungu: primary || dbSigungu || coordSigungu || "",
    trustGeoCity: true,
    dbIpDong: dbHints.dong,
  };
}

function resolveKrTrustedCity(
  fused: { trustLocalBin?: boolean },
  ip2loc: Awaited<ReturnType<typeof lookupFromIp2Location>> | null,
  ipApi: Awaited<ReturnType<typeof lookupFromIpApi>> | null,
  ipinfo: Awaited<ReturnType<typeof lookupFromIpinfo>> | null,
  ipWho: Awaited<ReturnType<typeof lookupFromIpWho>> | null,
  anchorSigungu: string | undefined,
  dbIp: DbIpMeta | null,
): {
  sigungu: string;
  trustGeoCity: boolean;
  dbIpDong?: string;
  dbIpPreferred?: boolean;
} {
  const dbHints = parseDbIpCityHints(dbIp?.city);

  if (fused.trustLocalBin && ip2loc?.data) {
    const ip2locRaw = ip2loc.data.city || "";
    const ip2locSigungu = isDongLevelName(ip2locRaw)
      ? ""
      : mapCityToKorean(ip2locRaw) || ip2locRaw || "";
    const ipApiSigungu =
      mapCityToKorean(ipApi?.data?.city) || ipApi?.data?.city || "";

    if (
      dbHints.sigungu &&
      normalizeGuName(dbHints.sigungu) !==
        normalizeGuName(ip2locSigungu || ipApiSigungu)
    ) {
      return {
        sigungu: dbHints.sigungu,
        trustGeoCity: true,
        dbIpDong: dbHints.dong,
        dbIpPreferred: true,
      };
    }

    if (
      ip2locSigungu &&
      ipApiSigungu &&
      normalizeGuName(ip2locSigungu) !== normalizeGuName(ipApiSigungu)
    ) {
      const dbAgreesWithIpApi =
        Boolean(dbHints.sigungu) &&
        normalizeGuName(dbHints.sigungu) === normalizeGuName(ipApiSigungu);
      return {
        sigungu: ipApiSigungu,
        trustGeoCity: true,
        dbIpDong: dbHints.dong,
        dbIpPreferred: dbAgreesWithIpApi || Boolean(dbHints.dong),
      };
    }

    if (!ip2locSigungu && (ipApiSigungu || dbHints.dong)) {
      return {
        sigungu: ipApiSigungu || anchorSigungu || "",
        trustGeoCity: Boolean(ipApiSigungu),
        dbIpDong:
          dbHints.dong ||
          (isDongLevelName(ip2locRaw)
            ? mapCityToKorean(ip2locRaw) || ip2locRaw
            : undefined),
      };
    }

    return {
      sigungu: ip2locSigungu || ipApiSigungu,
      trustGeoCity: true,
      dbIpDong: dbHints.dong,
    };
  }

  return resolveTrustedSigungu(
    ipApi?.data?.city,
    ipinfo?.data?.city,
    ipWho?.data?.city,
    anchorSigungu,
    dbIp,
    ip2loc?.data?.city,
  );
}

/** 초정밀 IP → 위치 조회 */
export async function lookupIp(ip: string): Promise<GeoLocationData> {
  if (isPrivateIp(ip)) {
    throw new Error("사설 IP는 위치 조회가 불가능합니다.");
  }

  const queryIp = normalizeIp(ip);
  const startedAt = Date.now();

  const cached = ipLookupCache.get(queryIp);
  if (cached) {
    logLookupPerf(`${queryIp} (cache)`, startedAt);
    return cached;
  }

  const [crowd, ip2loc, ipApi, dbIpHint, ipinfo, kisaWhois] = await Promise.all([
    withTimeout(lookupCrowdIp(queryIp), CROWD_LOOKUP_MS),
    lookupFromIp2Location(queryIp),
    withTimeout(lookupFromIpApi(queryIp), IP_API_MS),
    withTimeout(lookupFromDbIp(queryIp), DB_IP_LOOKUP_MS),
    hasIpinfoToken()
      ? withTimeout(lookupFromIpinfo(queryIp), IPINFO_LOOKUP_MS)
      : Promise.resolve(null),
    withTimeout(lookupKisaWhois(queryIp), KISA_WHOIS_MS),
  ]);
  const dbIp = dbIpHint;

  if (crowd) {
    if (!crowd.isp && ipApi?.data?.isp) {
      crowd.isp = ipApi.data.isp;
      crowd.org = ipApi.data.org || "";
      crowd.as = ipApi.data.as || "";
    }
    return cacheAndReturn(queryIp, crowd, startedAt);
  }

  const resolvedIsp = ipApi?.data?.isp;

  const countryCodeEarly =
    ip2loc?.data?.countryCode || ipApi?.data?.countryCode;
  const isKrEarly = countryCodeEarly === "KR";

  const points: GeoPointCandidate[] = [];
  if (ip2loc?.point) points.push(ip2loc.point);
  if (ipApi?.point) points.push(ipApi.point);

  const hasCoreGeo = Boolean(ip2loc?.point || ipApi?.point);

  let ipWho: Awaited<ReturnType<typeof lookupFromIpWho>> = null;
  let geojs: Awaited<ReturnType<typeof lookupFromGeojs>> = null;

  if (!hasCoreGeo) {
    [ipWho, geojs] = await lookupSupplementalProviders(queryIp);
    if (isKrEarly) {
      if (ipWho?.point) points.push(ipWho.point);
      if (geojs?.point) points.push(geojs.point);
      if (ipinfo?.point) points.push(ipinfo.point);
    } else {
      if (ipinfo?.point) points.push(ipinfo.point);
      if (geojs?.point) points.push(geojs.point);
      if (ipWho?.point) points.push(ipWho.point);
    }
  } else if (isKrEarly && ipinfo?.point) {
    const ref = ipApi?.point || ip2loc?.point;
    const includeIpinfo =
      !ref ||
      haversineMeters(
        ipinfo.point.lat,
        ipinfo.point.lon,
        ref.lat,
        ref.lon,
      ) <= MAX_ALLOWED_ACCURACY_M;
    if (includeIpinfo) points.push(ipinfo.point);
  }

  if (points.length === 0) {
    throw new Error("IP 위치 정보를 가져올 수 없습니다.");
  }

  const countryCode =
    ip2loc?.data?.countryCode ||
    ipApi?.data?.countryCode ||
    ipinfo?.data?.countryCode ||
    ipWho?.data?.countryCode;

  const hintAgreement = cityHintsAgree(
    dbIp,
    ipApi?.data?.city,
    ipinfo?.data?.city,
  );

  const fused = fuseCoordinates(points, { countryCode, cityHintAgreement: hintAgreement })!;
  let anchorLat = fused.lat;
  let anchorLon = fused.lon;

  const partialEarly = mergeFields(
    { lat: anchorLat, lon: anchorLon },
    fused.trustLocalBin && ip2loc?.data
      ? {
          country: ip2loc.data.country,
          countryCode: ip2loc.data.countryCode,
          region: ip2loc.data.region,
          city: ip2loc.data.city,
          zip: ip2loc.data.zip,
          timezone: ip2loc.data.timezone,
        }
      : null,
    ipApi?.data,
    ipinfo?.data,
    ipWho?.data,
  );
  const isKr = isKorea(partialEarly);

  const [crowdSibling, crowdIspCluster, anchorAddress] = await Promise.all([
    withTimeout(lookupCrowdSibling(queryIp, resolvedIsp), CROWD_LOOKUP_MS),
    withTimeout(lookupCrowdIspCluster(queryIp, resolvedIsp), CROWD_LOOKUP_MS),
    isKr
      ? resolveAddressFromCoords(anchorLat, anchorLon)
      : Promise.resolve(null),
  ]);

  const meta: IpinfoMeta | null = ipinfo?.meta ?? null;

  if (crowdSibling) {
    return cacheAndReturn(queryIp, crowdSibling, startedAt);
  }
  if (crowdIspCluster) {
    return cacheAndReturn(queryIp, crowdIspCluster, startedAt);
  }

  const partial = partialEarly;

  let address: string;
  let dong: string | undefined;
  let roadAddress: string | undefined;
  let legalAddress: string | undefined;
  let sido: string | undefined;
  let sigungu: string | undefined;
  let addressSource: string | undefined;
  let addressPrecision = 0;
  let exactPin = false;
  let finalLat = anchorLat;
  let finalLon = anchorLon;
  let trustGeoCity = true;
  let krAddressAligned = false;
  let cityHintOverridesCoords = false;

  const uncertaintyM = fused.trustLocalBin
    ? fused.accuracyM
    : effectiveAccuracyM(fused.accuracyM, fused.spreadM);

  const allowRoadAddressBase = Boolean(
    fused.highConfidenceAgreement ||
      (fused.trustLocalBin &&
        (fused.spreadM ?? 0) <= IP2LOCATION_ALIGNED_ACCURACY_M) ||
      (fused.independentProviderCount != null &&
        fused.independentProviderCount >= 2 &&
        (fused.spreadM ?? Infinity) <= IP2LOCATION_ALIGNED_ACCURACY_M &&
        !fused.highDisagreement),
  );

  if (isKr) {
    const trusted = resolveKrTrustedCity(
      fused,
      ip2loc,
      ipApi,
      ipinfo,
      ipWho,
      anchorAddress?.sigungu,
      dbIp,
    );
    const trustedSigungu = trusted.sigungu;
    trustGeoCity = trusted.trustGeoCity;
    const trustedSido =
      fused.trustLocalBin && ip2loc?.data && !trusted.dbIpPreferred
        ? mapRegionToKorean(ip2loc.data.region) || ip2loc.data.region
        : mapRegionToKorean(dbIp?.stateProv) ||
          ipApi?.data?.region ||
          ipWho?.data?.region ||
          partial.region;
    cityHintOverridesCoords = Boolean(
      trusted.dbIpPreferred ||
        (trustedSigungu &&
          anchorAddress?.sigungu &&
          normalizeGuName(trustedSigungu) !==
            normalizeGuName(anchorAddress.sigungu)),
    );

    const fusedAnchorLat = fused.lat;
    const fusedAnchorLon = fused.lon;
    if (
      cityHintOverridesCoords ||
      (fused.highDisagreement &&
        trustedSigungu &&
        trustGeoCity &&
        (fused.spreadM ?? 0) > MAX_ALLOWED_ACCURACY_M)
    ) {
      const trustedSidoForAnchor =
        mapRegionToKorean(trustedSido) || trustedSido || anchorAddress?.sido;
      if (trustedSidoForAnchor && trustedSigungu) {
        const center = await geocodeSigunguCenter(
          trustedSidoForAnchor,
          mapCityToKorean(trustedSigungu) || trustedSigungu,
        );
        if (center) {
          anchorLat = center.lat;
          anchorLon = center.lon;
        }
      }
    }

    let prefetchedCoords = anchorAddress;
    if (
      anchorLat !== fusedAnchorLat ||
      anchorLon !== fusedAnchorLon
    ) {
      prefetchedCoords = await resolveAddressFromCoords(anchorLat, anchorLon);
    }

    const allowRoadAddress =
      allowRoadAddressBase && !cityHintOverridesCoords;
    const ipApiDistrict = (ipApi?.data as { district?: string } | undefined)
      ?.district;
    const ip2locDistrict = (ip2loc?.data as { district?: string } | undefined)
      ?.district;

    const kr = await resolveKoreanAddressExpert({
      partial,
      anchorLat,
      anchorLon,
      radiusM: fused.trustLocalBin ? fused.accuracyM : fused.spreadM || 0,
      regionCode: meta?.regionCode,
      trustedSigungu,
      trustedSido: mapRegionToKorean(trustedSido) || trustedSido,
      district: sanitizeGeoText(
        trusted.dbIpDong || ip2locDistrict || ipApiDistrict,
      ),
      kisaAddress: kisaWhois?.address,
      kisaOrg: kisaWhois?.orgName,
      trustGeoCity,
      allowRoadAddress,
      prefetchedCoords,
      preferFastPath:
        isKr &&
        Boolean(prefetchedCoords?.sigungu) &&
        trustGeoCity &&
        !cityHintOverridesCoords,
    });
    address = kr.address;
    roadAddress = kr.roadAddress;
    legalAddress = kr.legalAddress;
    dong = kr.dong;
    sido = kr.sido;
    sigungu = kr.sigungu;
    addressSource = kr.addressSource;
    addressPrecision = kr.precisionScore;
    finalLat = kr.lat;
    finalLon = kr.lon;
    krAddressAligned = kr.addressAligned ?? false;

    if (sido) partial.region = sido;
    else if (trustedSido) partial.region = mapRegionToKorean(trustedSido) || trustedSido;
    if (sigungu) partial.city = sigungu;
    else if (trustedSigungu) partial.city = mapCityToKorean(trustedSigungu) || trustedSigungu;
  } else {
    const fromCoords = await resolveAddressFromCoords(anchorLat, anchorLon);
    if (fromCoords) {
      address = fromCoords.full;
      roadAddress = fromCoords.road || undefined;
      legalAddress =
        fromCoords.legal !== fromCoords.full ? fromCoords.legal : undefined;
      dong = fromCoords.dong || undefined;
      sido = fromCoords.sido || undefined;
      sigungu = fromCoords.sigungu || undefined;
      addressSource = "coord2address";
      addressPrecision = 75;
      finalLat = anchorLat;
      finalLon = anchorLon;
    } else {
      address =
        [partial.city, partial.region, partial.country]
          .filter(Boolean)
          .join(", ") || "주소를 확인할 수 없습니다";
      addressPrecision = 35;
    }
  }

  exactPin = qualifiesExactPin({
    independentProviderCount: fused.independentProviderCount,
    providerCount: fused.providers.length,
    spreadM: fused.spreadM,
    accuracyM: uncertaintyM,
    trustLocalBin: fused.trustLocalBin,
    addressAligned: isKr ? krAddressAligned : true,
    highDisagreement: fused.highDisagreement,
    isVpn: meta?.isVpn,
    highConfidenceAgreement: fused.highConfidenceAgreement,
  });

  if (isKr && cityHintOverridesCoords) {
    exactPin = false;
  }

  if (exactPin && isKr) {
    const sameCoords =
      Math.abs(finalLat - anchorLat) < 1e-6 &&
      Math.abs(finalLon - anchorLon) < 1e-6;
    if (sameCoords && anchorAddress?.road) {
      address = anchorAddress.road || anchorAddress.full;
      roadAddress = anchorAddress.road || undefined;
      legalAddress =
        anchorAddress.legal !== address ? anchorAddress.legal : undefined;
      dong = anchorAddress.dong || dong;
      sido = anchorAddress.sido || sido;
      sigungu = anchorAddress.sigungu || sigungu;
      addressSource = addressSource || "coord2address";
      finalLat = anchorLat;
      finalLon = anchorLon;
    } else {
      const pinCoords = sameCoords
        ? anchorAddress
        : await resolveAddressFromCoords(finalLat, finalLon);
      if (pinCoords) {
        address = pinCoords.road || pinCoords.full;
        roadAddress = pinCoords.road || undefined;
        legalAddress =
          pinCoords.legal !== address ? pinCoords.legal : undefined;
        dong = pinCoords.dong || dong;
        sido = pinCoords.sido || sido;
        sigungu = pinCoords.sigungu || sigungu;
        addressSource = "coord2address";
        finalLat = anchorLat;
        finalLon = anchorLon;
      }
    }
  } else if (!exactPin && isKr) {
    roadAddress = undefined;
    legalAddress = undefined;
    dong = dong && trustGeoCity ? dong : undefined;
    address = buildDistrictAddress({
      sido,
      sigungu,
      dong,
      includeDong: Boolean(dong),
    });
    if (!address && sido && sigungu) {
      address = `${sido} ${sigungu}`;
    } else if (!address && sigungu) {
      address = sigungu;
    }
  }

  if (uncertaintyM > MAX_ALLOWED_ACCURACY_M || !trustGeoCity) {
    exactPin = false;
    if (isKr) {
      roadAddress = undefined;
      legalAddress = undefined;
      dong = undefined;
      address = buildDistrictAddress({ sido, sigungu, includeDong: false });
    }
  }

  let precisionScore = Math.round(
    fused.precisionScore * 0.35 + addressPrecision * 0.65,
  );
  precisionScore = capPrecisionForAccuracy(precisionScore, uncertaintyM);
  if (exactPin) {
    precisionScore = Math.min(95, precisionScore + 10);
  }

  let accuracyNote: string;
  if (exactPin) {
    accuracyNote =
      buildPinpointAccuracyNote(meta, fused, addressSource || "") +
      (fused.highConfidenceAgreement
        ? ` · 독립 DB ${fused.independentProviderCount}개 ±${HIGH_CONFIDENCE_AGREEMENT_M}m 합의`
        : "") +
      (trustGeoCity ? "" : " · GeoIP 구·군 불일치 — 좌표 기준 표시");
  } else {
    accuracyNote = ESTIMATED_IP_ACCURACY_NOTE;
    if (fused.trustLocalBin) {
      accuracyNote += ` · IP2Location 도시급 (±${Math.round(
        (fused.accuracyM <= IP2LOCATION_ALIGNED_ACCURACY_M
          ? IP2LOCATION_ALIGNED_ACCURACY_M
          : IP2LOCATION_CITY_ACCURACY_M) / 1000,
      )}km)`;
      if ((fused.rawSpreadM ?? 0) > MAX_ALLOWED_ACCURACY_M) {
        accuracyNote += " · 타 GeoIP DB와 지역 불일치 — 로컬 DB 우선";
      }
    }
    if (!trustGeoCity) {
      accuracyNote += " · GeoIP 구·군 불일치 — 좌표 기준 표시";
    }
    if (fused.highDisagreement) {
      accuracyNote += " · 제공자 좌표 5km+ 불일치 · DB 간 지역 불일치 가능";
    }
    if (
      fused.independentProviderCount != null &&
      fused.independentProviderCount >= 2 &&
      !exactPin
    ) {
      accuracyNote += ` · 독립 DB ${fused.independentProviderCount}개 (좌표 합의)`;
    } else if (
      fused.providers.length >= 2 &&
      (fused.independentProviderCount ?? 1) <= 1
    ) {
      accuracyNote += " · 동일 DB 중복 — 추정 위치";
    }
    if (fused.maxProviderRadiusM && fused.maxProviderRadiusM > MAX_ALLOWED_ACCURACY_M) {
      accuracyNote += ` · 제공자 반경 ±${Math.round(fused.maxProviderRadiusM / 1000)}km`;
    }
    if (meta?.isVpn) {
      accuracyNote += " · VPN/프록시 — 실제 위치와 다를 수 있음";
    }
  }

  if (uncertaintyM > MAX_ALLOWED_ACCURACY_M) {
    accuracyNote = `${ACCURACY_EXCEEDED_NOTE} · ${accuracyNote}`;
  } else if (fused.trustLocalBin && uncertaintyM <= MAX_ALLOWED_ACCURACY_M) {
    precisionScore = Math.min(88, precisionScore + 12);
  }

  address = sanitizeDisplayAddress(address);
  if (roadAddress) roadAddress = sanitizeDisplayAddress(roadAddress);
  if (legalAddress) legalAddress = sanitizeDisplayAddress(legalAddress);
  dong = sanitizeGeoText(dong) || undefined;
  sido = sanitizeGeoText(sido) || undefined;
  sigungu = sanitizeGeoText(sigungu) || undefined;

  const ipResult: GeoLocationData = {
    ip: queryIp,
    country: partial.country || (isKr ? "대한민국" : ""),
    countryCode: partial.countryCode || (isKr ? "KR" : ""),
    region: isKr ? mapRegionToKorean(partial.region) || partial.region || "" : partial.region || "",
    city: isKr ? mapCityToKorean(partial.city) || partial.city || "" : partial.city || "",
    zip: partial.zip || "",
    lat: finalLat,
    lon: finalLon,
    timezone: partial.timezone || "",
    isp: partial.isp || "",
    org: partial.org || "",
    as: partial.as || "",
    address,
    dong,
    accuracyM: exactPin ? undefined : uncertaintyM,
    locationSource: exactPin ? "pinpoint" : "ip",
    accuracyNote,
    geoProvider: fused.providers[0],
    geoSources: [
      ...new Set([
        ...fused.providers,
        ...(ipApi && !fused.providers.includes("ip-api") ? ["ip-api"] : []),
        ...(ipinfo ? ["ipinfo"] : []),
        ...(kisaWhois ? ["kisa-whois"] : []),
        ...(dbIp ? ["db-ip"] : []),
      ]),
    ],
    isVpn: meta?.isVpn,
    isMobile: meta?.isMobile,
    precisionScore,
    confidenceLevel:
      uncertaintyM > MAX_ALLOWED_ACCURACY_M || fused.highDisagreement
        ? "low"
        : exactPin
          ? "high"
          : fused.confidenceLevel,
    roadAddress,
    legalAddress,
    sido,
    sigungu,
    addressSource,
    expertMode: true,
    exactPin,
  };

  return cacheAndReturn(queryIp, ipResult, startedAt);
}

export { getClientIp, isPrivateIp, normalizeIp } from "./client-ip";
export { isValidIp } from "./ip-validation";

export { resolveAddressFromCoords } from "./kakao-geocode";
