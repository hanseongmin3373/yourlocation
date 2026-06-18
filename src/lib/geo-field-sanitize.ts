/**
 * GeoIP 제공자가 city/dong/isp 등에 넣는 오류·구독 안내 문자열 제거
 * (IP2Location DB5 등 저가 BIN에서 흔함)
 */

const PROVIDER_ERROR_RE =
  /this method is not applicable|upgrade your subscription|not applicable for current|please upgrade|subscription package|install new data file|binary data file|invalid api key|api key required|rate limit exceeded|quota exceeded|access denied|unauthorized|error_code|error_msg|발급받은 key/i;

/** 장소명으로 보기 어려운 과장된 길이 */
const MAX_PLACE_NAME_LEN = 80;

export function isProviderErrorValue(value?: string | null): boolean {
  if (value == null) return true;
  const t = String(value).trim();
  if (!t) return true;
  if (t.length > MAX_PLACE_NAME_LEN) return true;
  if (PROVIDER_ERROR_RE.test(t)) return true;
  return false;
}

/** 단일 Geo 텍스트 필드 — 오류면 빈 문자열 */
export function sanitizeGeoText(value?: string | null): string {
  if (isProviderErrorValue(value)) return "";
  return String(value).trim();
}

/** 최종 표시 주소에서 임베드된 오류 문구 제거 */
export function sanitizeDisplayAddress(value?: string | null): string {
  if (value == null) return "";
  let t = String(value).trim();
  if (!t) return "";

  t = t
    .replace(
      /this method is not applicable[^.]*\.?\s*please upgrade[^.]*\.?/gi,
      "",
    )
    .replace(/please upgrade your subscription[^.]*\.?/gi, "")
    .replace(/not applicable for current ip2location[^.]*\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (isProviderErrorValue(t)) return "";
  return t;
}

/** Partial GeoLocationData 문자열 필드 일괄 정화 */
export function sanitizeGeoFields<
  T extends {
    country?: string;
    countryCode?: string;
    region?: string;
    city?: string;
    zip?: string;
    isp?: string;
    org?: string;
    as?: string;
    address?: string;
    dong?: string;
    sido?: string;
    sigungu?: string;
    roadAddress?: string;
    district?: string;
  },
>(partial: T): T {
  const out = { ...partial };
  const keys = [
    "country",
    "countryCode",
    "region",
    "city",
    "zip",
    "isp",
    "org",
    "as",
    "address",
    "dong",
    "sido",
    "sigungu",
    "roadAddress",
    "district",
  ] as const;

  for (const key of keys) {
    const v = out[key];
    if (typeof v === "string") {
      (out as Record<string, string>)[key] =
        key === "address" || key === "roadAddress"
          ? sanitizeDisplayAddress(v)
          : sanitizeGeoText(v);
    }
  }
  return out;
}

/** db-ip / geojs 메타 */
export function sanitizeDbIpMeta(meta: {
  countryCode?: string;
  stateProv?: string;
  city?: string;
}): typeof meta {
  return {
    countryCode: sanitizeGeoText(meta.countryCode) || undefined,
    stateProv: sanitizeGeoText(meta.stateProv) || undefined,
    city: sanitizeGeoText(meta.city) || undefined,
  };
}
