/**
 * 한국 ISP·대역별 GeoIP 오인 보정 테이블
 * geo-data/isp-kr-corrections.json — 운영 중 항목 추가 가능
 */
import { normalizeIp } from "./client-ip";
import rawCorrections from "../../geo-data/isp-kr-corrections.json";

export type IspCorrectionEntry = {
  id: string;
  note: string;
  match: {
    ip?: string;
    prefix24?: string;
    prefix16?: string;
    asn?: string;
  };
  ispKeywords?: string[];
  correct: {
    sido: string;
    sigungu: string;
    dong?: string;
  };
  accuracyM?: number;
  boostTrust?: boolean;
  onlyWhenMismatch?: boolean;
};

export type IspCorrectionApplyResult = {
  id: string;
  note: string;
  sido: string;
  sigungu: string;
  dong?: string;
  accuracyM?: number;
  boostTrust: boolean;
  /** trustedSigungu 대체 */
  overrideSigungu: string;
  overrideDong?: string;
};

const CORRECTIONS = rawCorrections as IspCorrectionEntry[];

function ipv4Prefix24(ip: string): string | null {
  const p = normalizeIp(ip).split(".");
  if (p.length !== 4) return null;
  return `${p[0]}.${p[1]}.${p[2]}`;
}

function ipv4Prefix16(ip: string): string | null {
  const p = normalizeIp(ip).split(".");
  if (p.length !== 4) return null;
  return `${p[0]}.${p[1]}`;
}

function normalizeGu(name: string): string {
  return name.replace(/\s+/g, "").replace(/(특별시|광역시|특별자치시|시|군|구)$/g, "");
}

function normalizeAsn(as: string): string {
  const t = as.trim().toUpperCase();
  if (!t) return "";
  return t.startsWith("AS") ? t : `AS${t.replace(/\D/g, "")}`;
}

function ispMatches(keywords: string[] | undefined, isp: string, org: string): boolean {
  if (!keywords?.length) return true;
  const hay = `${isp} ${org}`.toLowerCase();
  return keywords.some((k) => hay.includes(k.toLowerCase()));
}

function prefixMatches(entry: IspCorrectionEntry, ip: string): boolean {
  const m = entry.match;
  const n = normalizeIp(ip);
  if (m.ip && normalizeIp(m.ip) === n) return true;
  if (m.prefix24 && ipv4Prefix24(ip) === m.prefix24) return true;
  if (m.prefix16 && ipv4Prefix16(ip) === m.prefix16) return true;
  return false;
}

function asnMatches(entry: IspCorrectionEntry, as: string): boolean {
  const want = entry.match.asn;
  if (!want) return false;
  return normalizeAsn(as) === normalizeAsn(want);
}

/** ip > /24 > /16 > asn — 구체적 규칙 우선 */
function matchSpecificity(entry: IspCorrectionEntry, ip: string, as: string): number {
  const n = normalizeIp(ip);
  const m = entry.match;
  if (m.ip && normalizeIp(m.ip) === n) return 100;
  if (m.prefix24 && ipv4Prefix24(ip) === m.prefix24) return 80;
  if (m.prefix16 && ipv4Prefix16(ip) === m.prefix16) return 60;
  if (m.asn && asnMatches(entry, as)) return 40;
  return 0;
}

/** ipinfo가 자주 내는 수도권 허브 오인 */
const FALLBACK_SIGUNGU = new Set([
  "동작",
  "서초",
  "중구",
  "종로",
  "용산",
  "강남",
]);

function isKnownFallbackSigungu(sigungu: string | undefined): boolean {
  if (!sigungu) return false;
  const g = normalizeGu(sigungu);
  return FALLBACK_SIGUNGU.has(g);
}

function sigunguMatches(current: string | undefined, want: string): boolean {
  if (!current) return false;
  const cur = normalizeGu(current);
  const target = normalizeGu(want);
  if (cur === target) return true;
  if (current.includes(want) || want.includes(current)) return true;
  return false;
}

export function listIspKrCorrections(): IspCorrectionEntry[] {
  return CORRECTIONS;
}

export function findIspKrCorrection(opts: {
  ip: string;
  isp?: string;
  org?: string;
  as?: string;
  currentSigungu?: string;
  currentSido?: string;
}): IspCorrectionApplyResult | null {
  const ip = normalizeIp(opts.ip);
  if (ip.split(".").length !== 4) return null;

  const ranked = [...CORRECTIONS]
    .map((entry) => ({
      entry,
      specificity: matchSpecificity(entry, ip, opts.as || ""),
    }))
    .filter((r) => r.specificity > 0)
    .sort((a, b) => b.specificity - a.specificity);

  for (const { entry } of ranked) {
    if (!ispMatches(entry.ispKeywords, opts.isp || "", opts.org || "")) {
      continue;
    }

    const wantSido = entry.correct.sido.replace(/\s+/g, "");
    const curSido = (opts.currentSido || "").replace(/\s+/g, "");

    if (entry.onlyWhenMismatch && opts.currentSigungu) {
      if (sigunguMatches(opts.currentSigungu, entry.correct.sigungu)) {
        continue;
      }
      // 시·도가 명확히 다르면 무조건 보정 (지방 IP → 서울 오인)
      const sidoMismatch =
        curSido.length > 0 &&
        wantSido.length > 0 &&
        !curSido.includes(wantSido.slice(0, 2)) &&
        !wantSido.includes(curSido.slice(0, 2));
      const fallback =
        isKnownFallbackSigungu(opts.currentSigungu) && entry.match.prefix24;
      if (!sidoMismatch && !fallback && entry.match.prefix16) {
        // /16 규칙은 시·도 불일치 또는 허브 오인일 때만
        continue;
      }
    }

    return {
      id: entry.id,
      note: entry.note,
      sido: entry.correct.sido,
      sigungu: entry.correct.sigungu,
      dong: entry.correct.dong,
      accuracyM: entry.accuracyM,
      boostTrust: entry.boostTrust ?? true,
      overrideSigungu: entry.correct.sigungu,
      overrideDong: entry.correct.dong,
    };
  }

  return null;
}

export function countIspKrCorrections(): number {
  return CORRECTIONS.length;
}
