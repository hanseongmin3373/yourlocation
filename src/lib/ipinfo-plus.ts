/**
 * ipinfo Plus Lookup API — 32개 속성 파싱 및 정확도·신뢰도 산출
 * @see https://ipinfo.io/products/plus
 */
import type { GeoLocationData } from "./types";

export interface IpinfoPlusRaw {
  ip?: string;
  hostname?: string;
  geo?: {
    city?: string;
    region?: string;
    region_code?: string;
    country?: string;
    country_code?: string;
    continent?: string;
    continent_code?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    postal_code?: string;
    dma_code?: string;
    geoname_id?: string | number;
    radius?: number;
    last_changed?: string;
  };
  as?: {
    asn?: string;
    name?: string;
    domain?: string;
    type?: string;
    last_changed?: string;
  };
  mobile?: { name?: string; mcc?: string; mnc?: string };
  anonymous?: {
    name?: string;
    is_proxy?: boolean;
    is_relay?: boolean;
    is_tor?: boolean;
    is_vpn?: boolean;
  };
  is_anonymous?: boolean;
  is_anycast?: boolean;
  is_hosting?: boolean;
  is_mobile?: boolean;
  is_satellite?: boolean;
}

/** Plus API에서 파싱한 전체 인텔리전스 */
export type IpinfoPlusIntel = {
  provider: "ipinfo";
  isPlus: boolean;
  ip?: string;
  hostname?: string;
  continent?: string;
  continentCode?: string;
  geonameId?: string;
  dmaCode?: string;
  regionCode?: string;
  radiusKm?: number;
  geoLastChanged?: string;
  asLastChanged?: string;
  asType?: "hosting" | "isp" | "education" | "government" | "business" | string;
  asn?: string;
  ispName?: string;
  ispDomain?: string;
  mobileCarrier?: string;
  mobileMcc?: string;
  mobileMnc?: string;
  privacyServiceName?: string;
  isAnonymous: boolean;
  isProxy: boolean;
  isRelay: boolean;
  isTor: boolean;
  isVpn: boolean;
  isAnycast: boolean;
  isHosting: boolean;
  isMobile: boolean;
  isSatellite: boolean;
  /** 0–100 Plus 신호 기반 GeoIP 신뢰 점수 */
  geoTrustScore: number;
  /** precisionScore 가산/감산 (-40 ~ +25) */
  precisionDelta: number;
  /** GeoIP city/region 텍스트 신뢰 */
  trustGeoCity: boolean;
  /** 도로명 표시 허용 (Plus 고신뢰 + 비익명·비호스팅) */
  allowRoadHint: boolean;
  /** geo/as 최근 변경 (30일 이내) */
  geoRecentlyChanged: boolean;
  asRecentlyChanged: boolean;
  networkFlags: string[];
  accuracyNotes: string[];
};

const RECENT_CHANGE_DAYS = 30;

function daysSince(isoDate?: string): number | null {
  if (!isoDate?.trim()) return null;
  const t = Date.parse(isoDate.trim());
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

function normalizeAsn(raw?: string): string {
  const s = raw?.trim() || "";
  if (!s) return "";
  return s.toUpperCase().startsWith("AS") ? s.toUpperCase() : `AS${s}`;
}

function buildNetworkFlags(raw: IpinfoPlusRaw): string[] {
  const flags: string[] = [];
  if (raw.is_anonymous || raw.anonymous?.is_vpn) flags.push("vpn");
  if (raw.anonymous?.is_proxy) flags.push("proxy");
  if (raw.anonymous?.is_tor) flags.push("tor");
  if (raw.anonymous?.is_relay) flags.push("relay");
  if (raw.is_hosting) flags.push("hosting");
  if (raw.is_anycast) flags.push("anycast");
  if (raw.is_mobile) flags.push("mobile");
  if (raw.is_satellite) flags.push("satellite");
  return flags;
}

/** Plus JSON → 구조화 인텔리전스 + 신뢰도 산출 */
export function parseIpinfoPlus(raw: IpinfoPlusRaw): IpinfoPlusIntel | null {
  const geo = raw.geo;
  if (
    geo?.latitude == null ||
    geo?.longitude == null ||
    !Number.isFinite(geo.latitude) ||
    !Number.isFinite(geo.longitude)
  ) {
    return null;
  }

  const radiusKm = geo.radius != null && geo.radius > 0 ? geo.radius : undefined;
  const isPlus = radiusKm != null;
  const isAnonymous = Boolean(
    raw.is_anonymous ||
      raw.anonymous?.is_vpn ||
      raw.anonymous?.is_proxy ||
      raw.anonymous?.is_tor ||
      raw.anonymous?.is_relay,
  );

  const geoDays = daysSince(geo.last_changed);
  const asDays = daysSince(raw.as?.last_changed);
  const geoRecentlyChanged =
    geoDays != null && geoDays >= 0 && geoDays <= RECENT_CHANGE_DAYS;
  const asRecentlyChanged =
    asDays != null && asDays >= 0 && asDays <= RECENT_CHANGE_DAYS;

  const networkFlags = buildNetworkFlags(raw);
  const accuracyNotes: string[] = [];

  let geoTrustScore = 72;
  let precisionDelta = 0;

  if (isPlus && radiusKm != null) {
    if (radiusKm <= 5) {
      geoTrustScore = 92;
      precisionDelta += 18;
      accuracyNotes.push(`Plus 정밀 반경 ±${radiusKm}km`);
    } else if (radiusKm <= 15) {
      geoTrustScore = 85;
      precisionDelta += 12;
      accuracyNotes.push(`Plus 구·동급 ±${radiusKm}km`);
    } else if (radiusKm <= 50) {
      geoTrustScore = 72;
      precisionDelta += 4;
      accuracyNotes.push(`Plus 시·군·구급 ±${radiusKm}km`);
    } else if (radiusKm <= 150) {
      geoTrustScore = 48;
      precisionDelta -= 12;
      accuracyNotes.push(`Plus 광역 추정 ±${radiusKm}km`);
    } else {
      geoTrustScore = 28;
      precisionDelta -= 22;
      accuracyNotes.push(`Plus 저신뢰(모바일·ISP 게이트웨이) ±${radiusKm}km`);
    }
  }

  if (raw.is_hosting || raw.as?.type === "hosting") {
    geoTrustScore -= 25;
    precisionDelta -= 15;
    accuracyNotes.push("호스팅·데이터센터 IP");
  }
  if (raw.is_anycast) {
    geoTrustScore -= 20;
    precisionDelta -= 12;
    accuracyNotes.push("Anycast — 좌표 다중 서버");
  }
  if (raw.is_satellite) {
    geoTrustScore -= 18;
    precisionDelta -= 10;
    accuracyNotes.push("위성 회선");
  }
  if (isAnonymous) {
    geoTrustScore -= 35;
    precisionDelta -= 25;
    const svc = raw.anonymous?.name?.trim();
    accuracyNotes.push(
      svc ? `익명 서비스(${svc})` : "VPN·프록시·Tor·릴레이",
    );
  }
  if (raw.is_mobile) {
    geoTrustScore = Math.min(geoTrustScore, 55);
    if (radiusKm == null || radiusKm > 50) precisionDelta -= 8;
    const carrier = raw.mobile?.name?.trim();
    accuracyNotes.push(
      carrier ? `모바일(${carrier})` : "모바일 회선",
    );
  }
  if (geoRecentlyChanged) {
    geoTrustScore -= 8;
    precisionDelta -= 6;
    accuracyNotes.push(`위치 최근 변경(${geo.last_changed})`);
  }
  if (asRecentlyChanged) {
    geoTrustScore -= 5;
    precisionDelta -= 4;
    accuracyNotes.push(`ASN 최근 변경(${raw.as?.last_changed})`);
  }

  geoTrustScore = Math.max(8, Math.min(95, geoTrustScore));
  precisionDelta = Math.max(-40, Math.min(25, precisionDelta));

  const trustGeoCity =
    geoTrustScore >= 55 &&
    !isAnonymous &&
    !raw.is_hosting &&
    !raw.is_anycast &&
    !raw.is_satellite &&
    (radiusKm == null || radiusKm <= 50);

  const allowRoadHint =
    geoTrustScore >= 80 &&
    radiusKm != null &&
    radiusKm <= 10 &&
    !isAnonymous &&
    !raw.is_hosting &&
    !raw.is_anycast;

  return {
    provider: "ipinfo",
    isPlus,
    ip: raw.ip,
    hostname: raw.hostname?.trim() || undefined,
    continent: geo.continent,
    continentCode: geo.continent_code,
    geonameId: geo.geoname_id != null ? String(geo.geoname_id) : undefined,
    dmaCode: geo.dma_code,
    regionCode: geo.region_code,
    radiusKm,
    geoLastChanged: geo.last_changed,
    asLastChanged: raw.as?.last_changed,
    asType: raw.as?.type,
    asn: normalizeAsn(raw.as?.asn),
    ispName: raw.as?.name?.trim(),
    ispDomain: raw.as?.domain?.trim(),
    mobileCarrier: raw.mobile?.name?.trim() || undefined,
    mobileMcc: raw.mobile?.mcc?.trim(),
    mobileMnc: raw.mobile?.mnc?.trim(),
    privacyServiceName: raw.anonymous?.name?.trim() || undefined,
    isAnonymous,
    isProxy: Boolean(raw.anonymous?.is_proxy),
    isRelay: Boolean(raw.anonymous?.is_relay),
    isTor: Boolean(raw.anonymous?.is_tor),
    isVpn: Boolean(raw.is_anonymous || raw.anonymous?.is_vpn),
    isAnycast: Boolean(raw.is_anycast),
    isHosting: Boolean(raw.is_hosting),
    isMobile: Boolean(raw.is_mobile),
    isSatellite: Boolean(raw.is_satellite),
    geoTrustScore,
    precisionDelta,
    trustGeoCity,
    allowRoadHint,
    geoRecentlyChanged,
    asRecentlyChanged,
    networkFlags,
    accuracyNotes,
  };
}

/** ipinfo Plus → GeoLocationData 부분 필드 + 좌표 메타 */
export function plusIntelToGeoFields(
  raw: IpinfoPlusRaw,
  intel: IpinfoPlusIntel,
): Partial<GeoLocationData> {
  const geo = raw.geo!;
  return {
    country: geo.country || "",
    countryCode: geo.country_code || "",
    region: geo.region || "",
    city: geo.city || "",
    zip: geo.postal_code || "",
    lat: geo.latitude!,
    lon: geo.longitude!,
    timezone: geo.timezone || "",
    isp: intel.ispName || "",
    org: intel.ispDomain || intel.ispName || "",
    as: intel.asn || "",
    hostname: intel.hostname,
    continent: intel.continent,
    geonameId: intel.geonameId,
    ipinfoRadiusKm: intel.radiusKm,
    geoLastChanged: intel.geoLastChanged,
    asLastChanged: intel.asLastChanged,
    asType: intel.asType,
    mobileCarrier: intel.mobileCarrier,
    mobileMcc: intel.mobileMcc,
    mobileMnc: intel.mobileMnc,
    privacyServiceName: intel.privacyServiceName,
    isVpn: intel.isAnonymous,
    isMobile: intel.isMobile,
    isHosting: intel.isHosting,
    isAnycast: intel.isAnycast,
    isSatellite: intel.isSatellite,
    isProxy: intel.isProxy,
    isTor: intel.isTor,
    isRelay: intel.isRelay,
    networkFlags: intel.networkFlags,
    ipinfoPlus: true,
    geoTrustScore: intel.geoTrustScore,
  };
}

/** Plus 인텔리전스 기반 accuracyNote 조각 */
export function buildPlusAccuracyNotes(intel: IpinfoPlusIntel): string {
  const parts = ["ipinfo.io Plus"];
  if (intel.accuracyNotes.length > 0) {
    parts.push(...intel.accuracyNotes);
  }
  if (intel.geoTrustScore > 0) {
    parts.push(`GeoIP 신뢰 ${intel.geoTrustScore}%`);
  }
  return parts.join(" · ");
}

/** ipinfo 앵커와 보조 제공자 합의 허용 거리(m) — radius 기반 */
export function plusAgreementRadiusM(intel?: IpinfoPlusIntel | null): number {
  if (!intel?.radiusKm) return 6000;
  const rM = intel.radiusKm * 1000;
  if (rM <= 5000) return Math.max(700, Math.round(rM * 0.38));
  if (rM <= 15000) return Math.min(Math.max(rM * 0.26, 1400), 5500);
  return Math.min(Math.max(rM * 0.32, 2800), 18000);
}
