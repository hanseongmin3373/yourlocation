/**
 * MSSQL/CSV 없이 mylocation.co.kr 공개 검색 → crowd DB 자동 적재
 */
import { normalizeIp } from "./client-ip";
import { lookupCrowdIpExact } from "./crowd-ip-db";
import { prisma } from "./db";
import { fetchMylocationAddress } from "./mylocation-fetch";
import { searchAddressCandidates } from "./kakao-geocode";
import type { GeoLocationData } from "./types";

const MYLOCATION_IMPORT_SOURCE = "mylocation-import";
const PROBE_TTL_DAYS = 14;

function ipv4Prefix24(ip: string): string | null {
  const parts = normalizeIp(ip).split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function parseMylocationAddressParts(address: string): {
  sido?: string;
  sigungu?: string;
  dong?: string;
} {
  const text = address.trim();
  if (!text) return {};

  const m = text.match(
    /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|도|특별자치도)?\s*(\S+?(?:시|군|구))\s*(\S+?(?:동|읍|면|리|가))?/,
  );
  if (!m) return {};

  const sidoMap: Record<string, string> = {
    서울: "서울특별시",
    부산: "부산광역시",
    대구: "대구광역시",
    인천: "인천광역시",
    광주: "광주광역시",
    대전: "대전광역시",
    울산: "울산광역시",
    세종: "세종특별자치시",
    경기: "경기도",
    강원: "강원특별자치도",
    충북: "충청북도",
    충남: "충청남도",
    전북: "전북특별자치도",
    전남: "전라남도",
    경북: "경상북도",
    경남: "경상남도",
    제주: "제주특별자치도",
  };

  return {
    sido: sidoMap[m[1]] || m[1],
    sigungu: m[2] || undefined,
    dong: m[3] || undefined,
  };
}

export function isMylocationBackfillEnabled(): boolean {
  const v = process.env.MYLOCATION_BACKFILL?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

async function recentProbe(ip: string): Promise<boolean> {
  const row = await prisma.mylocationProbe.findUnique({ where: { ip } });
  if (!row) return false;
  const ageMs = Date.now() - row.probedAt.getTime();
  return ageMs < PROBE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

async function recordProbe(
  ip: string,
  hit: boolean,
  address: string | null,
): Promise<void> {
  await prisma.mylocationProbe.upsert({
    where: { ip },
    create: { ip, hit, address },
    update: { hit, address, probedAt: new Date() },
  });
}

async function geocodeAdminAddress(
  address: string,
  parts: ReturnType<typeof parseMylocationAddressParts>,
): Promise<{ lat: number; lon: number } | null> {
  const queries = [
    address,
    [parts.sido, parts.sigungu, parts.dong].filter(Boolean).join(" "),
    [parts.sido, parts.sigungu].filter(Boolean).join(" "),
    parts.sigungu,
  ].filter((q) => q && q.length >= 2);

  for (const q of queries) {
    const hits = await searchAddressCandidates(q!, 1);
    if (hits[0]) {
      return { lat: hits[0].lat, lon: hits[0].lng };
    }
  }
  return null;
}

/** mylocation 주소 → IpLocationEntry 저장 (userVerified 보호) */
export async function saveMylocationImportRow(opts: {
  ip: string;
  address: string;
  lat: number;
  lon: number;
  sido?: string;
  sigungu?: string;
  dong?: string;
}): Promise<boolean> {
  const ip = normalizeIp(opts.ip);
  const prefix = ipv4Prefix24(ip);
  if (!prefix) return false;

  const existing = await prisma.ipLocationEntry.findUnique({
    where: { ip },
    select: { userVerified: true },
  });
  if (existing?.userVerified) return false;

  const applied =
    [opts.sido, opts.sigungu, opts.dong].filter(Boolean).join(" ") ||
    opts.address;

  await prisma.ipLocationEntry.upsert({
    where: { ip },
    create: {
      ip,
      ipPrefix24: prefix,
      lat: opts.lat,
      lon: opts.lon,
      accuracyM: 45,
      address: opts.address,
      appliedAddress: applied,
      dong: opts.dong || null,
      sido: opts.sido || null,
      sigungu: opts.sigungu || null,
      source: MYLOCATION_IMPORT_SOURCE,
      userVerified: false,
      registerCount: 1,
    },
    update: {
      lat: opts.lat,
      lon: opts.lon,
      accuracyM: 45,
      address: opts.address,
      appliedAddress: applied,
      dong: opts.dong || null,
      sido: opts.sido || null,
      sigungu: opts.sigungu || null,
      source: MYLOCATION_IMPORT_SOURCE,
    },
  });
  return true;
}

/**
 * crowd DB miss 시 mylocation 1회 조회 → 적재 → crowd 결과 반환
 */
export async function tryMylocationBackfill(
  ip: string,
): Promise<GeoLocationData | null> {
  if (!isMylocationBackfillEnabled()) return null;

  const queryIp = normalizeIp(ip);
  if (queryIp.split(".").length !== 4) return null;

  if (await recentProbe(queryIp)) return null;

  const fetched = await fetchMylocationAddress(queryIp);
  if (!fetched.ok || !fetched.address) {
    await recordProbe(queryIp, false, null);
    return null;
  }

  const parts = parseMylocationAddressParts(fetched.address);
  const coords = await geocodeAdminAddress(fetched.address, parts);
  if (!coords) {
    await recordProbe(queryIp, false, fetched.address);
    return null;
  }

  const saved = await saveMylocationImportRow({
    ip: queryIp,
    address: fetched.address,
    lat: coords.lat,
    lon: coords.lon,
    ...parts,
  });
  await recordProbe(queryIp, saved, fetched.address);
  if (!saved) return null;

  return lookupCrowdIpExact(queryIp);
}
