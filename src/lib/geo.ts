import {
  ACCURACY_EXCEEDED_NOTE,
  buildDistrictAddress,
  capPrecisionForAccuracy,
  effectiveAccuracyM,
  ESTIMATED_IP_ACCURACY_NOTE,
  EXACT_PROVIDER_AGREEMENT_M,
  GU_LEVEL_MAX_ACCURACY_M,
  enforceZeroErrorPolicy,
  IP2LOCATION_ALIGNED_ACCURACY_M,
  IP2LOCATION_CITY_ACCURACY_M,
  HIGH_CONFIDENCE_AGREEMENT_M,
  MAX_ALLOWED_ACCURACY_M,
} from "./geo-accuracy";
import {
  applyDualAccuracyPolicy,
  type AccuracyTier,
} from "./geo-accuracy-policy";
import { findIspKrCorrection } from "./isp-kr-corrections";
import { isPrivateIp, normalizeIp } from "./client-ip";
import {
  sanitizeDisplayAddress,
  sanitizeGeoFields,
  sanitizeGeoText,
} from "./geo-field-sanitize";
import {
  fuseCoordinates,
  haversineMeters,
  IP2LOC_REJECT_DISTANCE_M,
  toGeoCandidate,
  type GeoPointCandidate,
} from "./geo-fusion";
import { resolveKoreanAddressExpert } from "./geo-kr-expert";
import { buildPinpointNote } from "./geo-pinpoint";
import { lookupCrowdIp, lookupCrowdIspCluster, lookupCrowdSibling, absorbLookupResult } from "./crowd-ip-db";
import { tryMylocationBackfill } from "./mylocation-backfill";
import {
  lookupFromDbIp,
  lookupFromGeojs,
  type DbIpMeta,
} from "./geo-supplementary";
import { lookupFromIp2Location } from "./geo-ip2location";
import {
  hasIpinfoToken,
  lookupFromIpinfo,
  type IpinfoPlusIntel,
} from "./geo-ipinfo";
import { buildPlusAccuracyNotes, plusAgreementRadiusM } from "./ipinfo-plus";
import { lookupKisaWhois } from "./kisa-whois";
import {
  isDongLevelName,
  mapCityToKorean,
  mapRegionToKorean,
  parseDbIpCityHints,
  sidoFromRegionCode,
} from "./ipinfo-kr";
import { createMemoryCache } from "./memory-cache";
import { resolveAddressFromCoords, geocodeSigunguCenter } from "./kakao-geocode";
import type { GeoLocationData } from "./types";

const IP_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const ipLookupCache = createMemoryCache<GeoLocationData>(IP_LOOKUP_CACHE_TTL_MS, 300);
const OPTIONAL_PROVIDER_MS = 1000;
const IPINFO_LOOKUP_MS = 2000;
const KISA_WHOIS_MS = 1500;
const DB_IP_LOOKUP_MS = 1500;
const CROWD_LOOKUP_MS = 1400;
const MYLOCATION_BACKFILL_MS = 5200;
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

/** crowd DB 미스 시 ISP /24 보정 (시·군·구 누락·저신뢰만) */
function enhanceCrowdWithIspCorrection(data: GeoLocationData): GeoLocationData {
  if (data.geoProvider !== "crowd-db" || data.exactPin || data.userVerified) {
    return data;
  }

  const ispFix = findIspKrCorrection({
    ip: data.ip,
    isp: data.isp,
    org: data.org,
    as: data.as,
    currentSigungu: data.sigungu || data.city,
    currentSido: data.sido || data.region,
  });
  if (!ispFix?.boostTrust) return data;

  const currentGu = normalizeGuForFast(data.sigungu || data.city || "");
  const fixGu = normalizeGuForFast(ispFix.overrideSigungu);
  if (currentGu && fixGu && currentGu !== fixGu) return data;

  const sigungu = ispFix.overrideSigungu || data.sigungu;
  const sido = ispFix.sido || data.sido;
  const dong = ispFix.overrideDong || data.dong;
  const policy = applyDualAccuracyPolicy({
    baseAccuracyM: Math.min(
      data.accuracyM ?? 520,
      ispFix.accuracyM ?? 420,
    ),
    trustGeoCity: true,
    addressAligned: Boolean(sigungu),
    hasDong: Boolean(dong),
    resolvedDong: dong,
    spreadM: data.spreadM,
    crowdDbBoost: true,
    ispCorrectionBoost: true,
  });

  return {
    ...data,
    sigungu,
    sido,
    city: sigungu || data.city,
    region: sido || data.region,
    dong,
    accuracyM: policy.displayAccuracyM,
    accuracyTier: policy.tier,
    accuracyNote: ispFix.note || data.accuracyNote,
    precisionScore: Math.max(data.precisionScore ?? 70, 84),
    confidenceLevel: policy.tier === "high" ? "high" : "medium",
  };
}

function cacheAndReturn(ip: string, data: GeoLocationData, startedAt: number) {
  const clean = enforceZeroErrorPolicy(
    sanitizeGeoFields(data) as GeoLocationData,
  );
  ipLookupCache.set(ip, clean);
  logLookupPerf(ip, startedAt);
  void absorbLookupResult(clean).catch(() => {});
  return clean;
}

/** 등록·삭제 후 IP 조회 캐시 무효화 */
export function invalidateIpLookupCache(ip?: string): void {
  if (ip) {
    ipLookupCache.delete(normalizeIp(ip));
  }
}

const FETCH_OPTS: RequestInit = {
  cache: "no-store",
  headers: {
    "User-Agent": "yourlocation.co.kr/2.0 (+https://www.yourlocation.co.kr)",
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

function buildPinpointAccuracyNote(
  meta: IpinfoPlusIntel | null,
  fused: { providers: string[] },
  addressSource: string,
): string {
  const parts = [buildPinpointNote(fused.providers, addressSource)];

  if (meta?.isAnonymous) {
    parts.push(
      meta.privacyServiceName
        ? `${meta.privacyServiceName} — 실제 위치와 다를 수 있음`
        : "VPN/프록시 — 실제 위치와 다를 수 있음",
    );
  }

  return parts.join(" · ");
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

  // 등록 DB는 캐시보다 항상 우선 (Vercel 다중 인스턴스·등록 전 GeoIP 캐시 잔존 방지)
  const crowd = await withTimeout(lookupCrowdIp(queryIp), CROWD_LOOKUP_MS);
  if (crowd) {
    if (!crowd.isp) {
      const ipApiHint = await withTimeout(lookupFromIpApi(queryIp), IP_API_MS);
      if (ipApiHint?.data?.isp) {
        crowd.isp = ipApiHint.data.isp;
        crowd.org = ipApiHint.data.org || "";
        crowd.as = ipApiHint.data.as || "";
      }
    }
    return cacheAndReturn(
      queryIp,
      enhanceCrowdWithIspCorrection(crowd),
      startedAt,
    );
  }

  const backfill = await withTimeout(
    tryMylocationBackfill(queryIp),
    MYLOCATION_BACKFILL_MS,
  );
  if (backfill) {
    return cacheAndReturn(queryIp, backfill, startedAt);
  }

  const cached = ipLookupCache.get(queryIp);
  if (cached) {
    logLookupPerf(`${queryIp} (cache)`, startedAt);
    return enforceZeroErrorPolicy(cached);
  }

  const ipinfoPrimary = hasIpinfoToken();

  const [ipinfo, dbIpHint, kisaWhois] = await Promise.all([
    ipinfoPrimary
      ? withTimeout(lookupFromIpinfo(queryIp), IPINFO_LOOKUP_MS)
      : Promise.resolve(null),
    withTimeout(lookupFromDbIp(queryIp), DB_IP_LOOKUP_MS),
    withTimeout(lookupKisaWhois(queryIp), KISA_WHOIS_MS),
  ]);
  const dbIp = dbIpHint;

  let ip2loc: Awaited<ReturnType<typeof lookupFromIp2Location>> = null;
  let ipApi: Awaited<ReturnType<typeof lookupFromIpApi>> = null;

  if (ipinfo?.point) {
    ipApi = await withTimeout(lookupFromIpApi(queryIp), IP_API_MS);
  } else {
    [ip2loc, ipApi] = await Promise.all([
      lookupFromIp2Location(queryIp),
      withTimeout(lookupFromIpApi(queryIp), IP_API_MS),
    ]);
  }

  const resolvedIsp = ipinfo?.data?.isp || ipApi?.data?.isp;

  const countryCodeEarly =
    ipinfo?.data?.countryCode ||
    ip2loc?.data?.countryCode ||
    ipApi?.data?.countryCode;
  const isKrEarly = countryCodeEarly === "KR";

  const points: GeoPointCandidate[] = [];

  if (ipinfo?.point) {
    points.push(ipinfo.point);
    const agreeM = plusAgreementRadiusM(ipinfo.meta);
    const geojsHint = await withTimeout(
      lookupFromGeojs(queryIp),
      OPTIONAL_PROVIDER_MS,
    );
    if (
      geojsHint?.point &&
      haversineMeters(
        ipinfo.point.lat,
        ipinfo.point.lon,
        geojsHint.point.lat,
        geojsHint.point.lon,
      ) <= agreeM
    ) {
      points.push(geojsHint.point);
    }
    if (
      ipApi?.point &&
      haversineMeters(
        ipinfo.point.lat,
        ipinfo.point.lon,
        ipApi.point.lat,
        ipApi.point.lon,
      ) <= agreeM
    ) {
      points.push(ipApi.point);
    }
  } else {
    if (ip2loc?.point) points.push(ip2loc.point);
    if (ipApi?.point) points.push(ipApi.point);

    if (
      isKrEarly &&
      ip2loc?.point &&
      ipApi?.point &&
      haversineMeters(
        ip2loc.point.lat,
        ip2loc.point.lon,
        ipApi.point.lat,
        ipApi.point.lon,
      ) > IP2LOC_REJECT_DISTANCE_M
    ) {
      const drop = points.findIndex((p) => p.provider === "ip2location");
      if (drop >= 0) points.splice(drop, 1);
      const geojsHint = await withTimeout(
        lookupFromGeojs(queryIp),
        OPTIONAL_PROVIDER_MS,
      );
      if (geojsHint?.point) points.push(geojsHint.point);
    }
  }

  let ipWho: Awaited<ReturnType<typeof lookupFromIpWho>> = null;
  let geojs: Awaited<ReturnType<typeof lookupFromGeojs>> = null;

  if (points.length === 0) {
    [ipWho, geojs] = await lookupSupplementalProviders(queryIp);
    if (geojs?.point) points.push(geojs.point);
    if (ipWho?.point && !isKrEarly) points.push(ipWho.point);
  }

  if (points.length === 0) {
    throw new Error("IP 위치 정보를 가져올 수 없습니다.");
  }

  const countryCode =
    ipinfo?.data?.countryCode ||
    ip2loc?.data?.countryCode ||
    ipApi?.data?.countryCode ||
    ipWho?.data?.countryCode;

  const hintAgreement = cityHintsAgree(
    dbIp,
    ipApi?.data?.city,
    ipinfo?.data?.city,
  );

  const fused = fuseCoordinates(points, {
    countryCode,
    cityHintAgreement: hintAgreement,
    ipinfoPrimary: Boolean(ipinfo?.point),
    ipinfoPlus: ipinfo?.meta ?? null,
  })!;
  let anchorLat = fused.lat;
  let anchorLon = fused.lon;

  const partialEarly = mergeFields(
    { lat: anchorLat, lon: anchorLon },
    ipinfo?.data,
    ipApi?.data,
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

  const meta: IpinfoPlusIntel | null = ipinfo?.meta ?? null;

  if (crowdSibling) {
    return cacheAndReturn(
      queryIp,
      enhanceCrowdWithIspCorrection(crowdSibling),
      startedAt,
    );
  }
  if (crowdIspCluster) {
    return cacheAndReturn(
      queryIp,
      enhanceCrowdWithIspCorrection(crowdIspCluster),
      startedAt,
    );
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
  let krAddressLevel: "road" | "dong" | "district" | undefined;
  let cityHintOverridesCoords = false;
  let accuracyTier: AccuracyTier | undefined;
  let ispCorrectionId: string | undefined;
  let ispCorrectionNote: string | undefined;
  let ispCorrectionBoost = false;
  let accuracyTierNote: string | undefined;

  let displayAccuracyM = fused.trustLocalBin
    ? fused.accuracyM
    : effectiveAccuracyM(fused.accuracyM, fused.spreadM);

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
    let trustedSigungu = trusted.sigungu;
    let ispDistrictHint = trusted.dbIpDong;

    trustGeoCity =
      trusted.trustGeoCity && (meta?.trustGeoCity ?? true);
    let trustedSido =
      ipinfo?.point
        ? sidoFromRegionCode(meta?.regionCode) ||
          mapRegionToKorean(ipinfo.data?.region) ||
          ipinfo.data?.region ||
          mapRegionToKorean(ipApi?.data?.region) ||
          ipApi?.data?.region
        : !fused.trustLocalBin && ipApi?.data?.region
          ? mapRegionToKorean(ipApi.data.region) || ipApi.data.region
          : fused.trustLocalBin && ip2loc?.data && !trusted.dbIpPreferred
            ? mapRegionToKorean(ip2loc.data.region) || ip2loc.data.region
            : mapRegionToKorean(dbIp?.stateProv) ||
              mapRegionToKorean(ipApi?.data?.region) ||
              ipApi?.data?.region ||
              ipWho?.data?.region ||
              partial.region;

    const ispFix = findIspKrCorrection({
      ip: queryIp,
      isp: partial.isp,
      org: partial.org,
      as: partial.as,
      currentSigungu: trustedSigungu || anchorAddress?.sigungu,
      currentSido: trustedSido || anchorAddress?.sido,
    });
    if (ispFix) {
      ispCorrectionId = ispFix.id;
      ispCorrectionNote = ispFix.note;
      ispCorrectionBoost = ispFix.boostTrust;
      trustedSigungu = ispFix.overrideSigungu;
      trustedSido = ispFix.sido;
      if (ispFix.overrideDong) ispDistrictHint = ispFix.overrideDong;
      if (ispFix.boostTrust) trustGeoCity = true;
      if (ispFix.accuracyM != null) {
        displayAccuracyM = Math.min(displayAccuracyM, ispFix.accuracyM);
      }
      const center = await geocodeSigunguCenter(
        ispFix.sido,
        ispFix.overrideSigungu,
      );
      if (center) {
        anchorLat = center.lat;
        anchorLon = center.lon;
        cityHintOverridesCoords = true;
      }
    }

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

    const allowRoadAddress = meta?.allowRoadHint ?? false;
    const ipApiDistrict = (ipApi?.data as { district?: string } | undefined)
      ?.district;
    const ip2locDistrict = (ip2loc?.data as { district?: string } | undefined)
      ?.district;

    const kr = await resolveKoreanAddressExpert({
      partial,
      anchorLat,
      anchorLon,
      radiusM: meta?.radiusKm
        ? Math.min(
            fused.trustLocalBin ? fused.accuracyM : fused.spreadM || fused.accuracyM,
            meta.radiusKm * 1000,
          )
        : fused.trustLocalBin
          ? fused.accuracyM
          : fused.spreadM || 0,
      regionCode: meta?.regionCode,
      trustedSigungu,
      trustedSido: mapRegionToKorean(trustedSido) || trustedSido,
      district: sanitizeGeoText(
        ispDistrictHint || ip2locDistrict || ipApiDistrict,
      ),
      kisaAddress: kisaWhois?.address,
      kisaOrg: kisaWhois?.orgName,
      trustGeoCity,
      allowRoadAddress,
      prefetchedCoords,
      preferFastPath: false,
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
    krAddressLevel = kr.addressLevel;

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

  exactPin = false;

  if (isKr && cityHintOverridesCoords) {
    exactPin = false;
  }

  if (isKr) {
    const expertRefinedM =
      krAddressLevel === "dong"
        ? 350
        : krAddressLevel === "road"
          ? 320
          : krAddressLevel === "district" && trustGeoCity
            ? 800
            : undefined;

    const policy = applyDualAccuracyPolicy({
      baseAccuracyM: displayAccuracyM,
      trustGeoCity,
      addressAligned: krAddressAligned,
      hasDong: Boolean(dong),
      resolvedDong: dong,
      krAddressLevel,
      ipinfoRadiusKm: meta?.radiusKm,
      spreadM: fused.spreadM,
      independentProviderCount: fused.independentProviderCount,
      highConfidenceAgreement: fused.highConfidenceAgreement,
      geoTrustScore: meta?.geoTrustScore,
      isVpn: meta?.isAnonymous,
      isHosting: meta?.isHosting,
      isAnycast: meta?.isAnycast,
      ispCorrectionBoost,
      expertRefinedM,
    });

    displayAccuracyM = policy.displayAccuracyM;
    accuracyTier = policy.tier;
    accuracyTierNote = policy.tierNote;
    const showDong = policy.showDong;

    roadAddress = undefined;
    legalAddress = undefined;
    dong = showDong ? dong : undefined;
    address = buildDistrictAddress({
      sido,
      sigungu,
      dong,
      includeDong: showDong,
    });
    if (!address && sido && sigungu) {
      address = `${sido} ${sigungu}`;
    } else if (!address && sigungu) {
      address = sigungu;
    }
  }

  if (displayAccuracyM > MAX_ALLOWED_ACCURACY_M) {
    exactPin = false;
    if (isKr) {
      roadAddress = undefined;
      legalAddress = undefined;
      dong = undefined;
      address = buildDistrictAddress({ sido, sigungu, includeDong: false });
    }
  } else if (
    isKr &&
    !trustGeoCity &&
    !krAddressAligned &&
    displayAccuracyM > GU_LEVEL_MAX_ACCURACY_M
  ) {
    dong = undefined;
    address = buildDistrictAddress({ sido, sigungu, includeDong: false });
  }

  let precisionScore = Math.round(
    fused.precisionScore * 0.35 + addressPrecision * 0.65,
  );
  if (meta?.precisionDelta) {
    precisionScore += Math.round(meta.precisionDelta * 0.5);
  }
  precisionScore = capPrecisionForAccuracy(precisionScore, displayAccuracyM);
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
    if (ipinfo?.point && meta) {
      accuracyNote += ` · ${buildPlusAccuracyNotes(meta)}`;
    } else if (!ipinfoPrimary) {
      accuracyNote += " · IPINFO_TOKEN 미설정 — 저정밀 fallback";
    }
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
    if (meta?.isAnonymous) {
      accuracyNote += meta.privacyServiceName
        ? ` · ${meta.privacyServiceName} 감지`
        : " · VPN/프록시 — 실제 위치와 다를 수 있음";
    }
    if (ispCorrectionNote) {
      accuracyNote += ` · ISP 보정(${ispCorrectionId})`;
    }
    if (accuracyTierNote) {
      accuracyNote += ` · ${accuracyTierNote}`;
    }
  }

  if (displayAccuracyM > MAX_ALLOWED_ACCURACY_M) {
    accuracyNote = `${ACCURACY_EXCEEDED_NOTE} · ${accuracyNote}`;
  } else if (fused.trustLocalBin && displayAccuracyM <= MAX_ALLOWED_ACCURACY_M) {
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
    accuracyM: exactPin ? undefined : displayAccuracyM,
    accuracyTier,
    ispCorrectionId,
    locationSource: exactPin ? "pinpoint" : "ip",
    accuracyNote,
    geoProvider: ipinfo?.point ? "ipinfo" : fused.providers[0],
    geoSources: [
      ...new Set([
        ...(ipinfo?.point ? ["ipinfo"] : []),
        ...fused.providers,
        ...(ipApi && !fused.providers.includes("ip-api") ? ["ip-api"] : []),
        ...(kisaWhois ? ["kisa-whois"] : []),
        ...(dbIp ? ["db-ip"] : []),
        ...(ip2loc ? ["ip2location"] : []),
        ...(ispCorrectionId ? ["isp-correction"] : []),
      ]),
    ],
    isVpn: meta?.isAnonymous,
    isMobile: meta?.isMobile,
    isHosting: meta?.isHosting,
    isAnycast: meta?.isAnycast,
    isSatellite: meta?.isSatellite,
    isProxy: meta?.isProxy,
    isTor: meta?.isTor,
    isRelay: meta?.isRelay,
    privacyServiceName: meta?.privacyServiceName,
    mobileCarrier: meta?.mobileCarrier,
    mobileMcc: meta?.mobileMcc,
    mobileMnc: meta?.mobileMnc,
    asType: meta?.asType,
    hostname: ipinfo?.data?.hostname ?? meta?.hostname,
    continent: ipinfo?.data?.continent,
    geonameId: ipinfo?.data?.geonameId,
    geoLastChanged: meta?.geoLastChanged,
    asLastChanged: meta?.asLastChanged,
    ipinfoRadiusKm: meta?.radiusKm,
    ipinfoPlus: meta?.isPlus,
    geoTrustScore: meta?.geoTrustScore,
    networkFlags: meta?.networkFlags,
    precisionScore,
    confidenceLevel:
      meta?.isAnonymous || meta?.isHosting || meta?.isAnycast
        ? "low"
        : accuracyTier === "high"
          ? "high"
          : displayAccuracyM > MAX_ALLOWED_ACCURACY_M || fused.highDisagreement
            ? "low"
            : exactPin
              ? "high"
              : accuracyTier === "normal"
                ? "medium"
                : meta?.isPlus &&
                    meta.geoTrustScore >= 75 &&
                    meta.radiusKm != null &&
                    meta.radiusKm <= 50
                  ? fused.confidenceLevel
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
