import { normalizeIp } from "./client-ip";
import {
  buildDistrictAddress,
  CROWD_CLUSTER_MAX_ACCURACY_M,
  CROWD_CLUSTER_MAX_SPREAD_M,
  MYLOCATION_IMPORT_MAX_ACCURACY_M,
  MYLOCATION_IMPORT_MAX_SPREAD_M,
  VERIFIED_ZERO_ERROR_NOTE,
} from "./geo-accuracy";
import { haversineMeters } from "./geo-fusion";
import { resolveAddressFromCoords } from "./kakao-geocode";
import { prisma } from "./db";
import type { GeoLocationData } from "./types";
import type { Prisma } from "@prisma/client";

const GPS_CLUSTER_RECENCY_DAYS = 365;
const MYLOCATION_IMPORT_SOURCE = "mylocation-import";

export type CrowdRegisterInput = {
  ip: string;
  lat: number;
  lon: number;
  accuracyM: number;
  address: string;
  appliedAddress: string;
  dong?: string;
  sido?: string;
  sigungu?: string;
  roadAddress?: string;
  isp?: string;
  source?: string;
  userVerified?: boolean;
};

export type CrowdRegisterResult = {
  totalCount: number;
  isUpdate: boolean;
  appliedAddress: string;
};

export type CrowdStats = {
  count: number;
  todayRegistered: number;
};

function ipv4Prefix24(ip: string): string | null {
  const parts = normalizeIp(ip).split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function ipv4Prefix16(ip: string): string | null {
  const parts = normalizeIp(ip).split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}`;
}

function weightedMedian(values: number[], weights: number[]): number {
  const pairs = values
    .map((v, i) => ({ v, w: weights[i] }))
    .sort((a, b) => a.v - b.v);
  const total = pairs.reduce((s, p) => s + p.w, 0);
  let acc = 0;
  for (const p of pairs) {
    acc += p.w;
    if (acc >= total / 2) return p.v;
  }
  return pairs[pairs.length - 1]?.v ?? values[0];
}

function weightedMedianCoords(
  entries: { lat: number; lon: number; accuracyM: number }[],
): { lat: number; lon: number } {
  const weights = entries.map((e) => 1 / Math.max(e.accuracyM, 8));
  return {
    lat: weightedMedian(
      entries.map((e) => e.lat),
      weights,
    ),
    lon: weightedMedian(
      entries.map((e) => e.lon),
      weights,
    ),
  };
}

function clusterSpreadM(entries: { lat: number; lon: number }[]): number {
  let max = 0;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      max = Math.max(
        max,
        haversineMeters(
          entries[i].lat,
          entries[i].lon,
          entries[j].lat,
          entries[j].lon,
        ),
      );
    }
  }
  return max;
}

/** GPS 자발 등록(최근·고정밀) + mylocation-import(연령 무관) 클러스터 조건 */
function buildClusterQualityFilter(since: Date): Prisma.IpLocationEntryWhereInput {
  return {
    OR: [
      {
        source: { not: MYLOCATION_IMPORT_SOURCE },
        updatedAt: { gte: since },
        accuracyM: { lte: CROWD_CLUSTER_MAX_ACCURACY_M },
      },
      {
        source: MYLOCATION_IMPORT_SOURCE,
        accuracyM: { lte: MYLOCATION_IMPORT_MAX_ACCURACY_M },
      },
    ],
  };
}

function maxSpreadForCluster(
  entries: { source?: string }[],
  gpsSpreadLimit: number,
): number {
  const hasImport = entries.some((e) => e.source === MYLOCATION_IMPORT_SOURCE);
  return hasImport ? MYLOCATION_IMPORT_MAX_SPREAD_M : gpsSpreadLimit;
}

type DistrictFallback = {
  address: string;
  sido: string | null;
  sigungu: string | null;
  dong: string | null;
  source?: string;
};

function toCrowdGeoData(
  ip: string,
  entry: {
    lat: number;
    lon: number;
    address: string;
    appliedAddress: string;
    dong: string | null;
    sido: string | null;
    sigungu: string | null;
    roadAddress: string | null;
    isp: string | null;
    userVerified?: boolean;
  },
  note: string,
  precisionScore: number,
  opts: { exactPin: boolean; accuracyM?: number },
): GeoLocationData {
  const displayAddress =
    opts.exactPin && entry.userVerified
      ? entry.roadAddress || entry.address || entry.appliedAddress
      : buildDistrictAddress({
          sido: entry.sido || undefined,
          sigungu: entry.sigungu || undefined,
          dong: entry.dong || undefined,
          includeDong: Boolean(entry.dong),
        }) || entry.appliedAddress || entry.address;

  return {
    ip: normalizeIp(ip),
    country: "대한민국",
    countryCode: "KR",
    region: entry.sido || "",
    city: entry.sigungu || "",
    zip: "",
    lat: entry.lat,
    lon: entry.lon,
    timezone: "Asia/Seoul",
    isp: entry.isp || "",
    org: "",
    as: "",
    address: displayAddress,
    dong: entry.dong || undefined,
    sido: entry.sido || undefined,
    sigungu: entry.sigungu || undefined,
    roadAddress:
      opts.exactPin && entry.userVerified ? entry.roadAddress || undefined : undefined,
    accuracyM: opts.exactPin ? undefined : opts.accuracyM,
    locationSource: opts.exactPin ? "pinpoint" : "crowd",
    accuracyNote: note,
    geoProvider: "crowd-db",
    geoSources: ["crowd-db"],
    precisionScore,
    confidenceLevel: opts.exactPin ? "high" : "medium",
    addressSource: entry.userVerified ? "user-verified" : "crowd-register",
    expertMode: true,
    exactPin: opts.exactPin,
    userVerified: entry.userVerified || undefined,
  };
}

/** 클러스터 좌표 기준 역지오코딩 — 저장된 시·군·구·동 우선 (mylocation-import) */
async function resolveClusterDisplay(
  lat: number,
  lon: number,
  fallback: DistrictFallback,
): Promise<{
  address: string;
  sido?: string;
  sigungu?: string;
  dong?: string;
}> {
  const fromStored = buildDistrictAddress({
    sido: fallback.sido || undefined,
    sigungu: fallback.sigungu || undefined,
    dong: fallback.dong || undefined,
    includeDong: true,
  });
  if (fromStored && (fallback.sido || fallback.sigungu)) {
    return {
      address: fromStored,
      sido: fallback.sido || undefined,
      sigungu: fallback.sigungu || undefined,
      dong: fallback.dong || undefined,
    };
  }

  const fromCoords = await resolveAddressFromCoords(lat, lon);
  if (fromCoords) {
    return {
      address: buildDistrictAddress({
        sido: fromCoords.sido,
        sigungu: fromCoords.sigungu,
        dong: fromCoords.dong,
        includeDong: true,
      }),
      sido: fromCoords.sido || fallback.sido || undefined,
      sigungu: fromCoords.sigungu || fallback.sigungu || undefined,
      dong: fromCoords.dong || fallback.dong || undefined,
    };
  }
  return {
    address: buildDistrictAddress({
      sido: fallback.sido || undefined,
      sigungu: fallback.sigungu || undefined,
      dong: fallback.dong || undefined,
      includeDong: Boolean(fallback.dong),
    }) || fallback.address,
    sido: fallback.sido || undefined,
    sigungu: fallback.sigungu || undefined,
    dong: fallback.dong || undefined,
  };
}

/** GPS+IP 위치 DB 등록 (조회 한도 미차감) */
export async function registerCrowdLocation(
  input: CrowdRegisterInput,
): Promise<CrowdRegisterResult> {
  const ip = normalizeIp(input.ip);
  const prefix = ipv4Prefix24(ip);
  if (!prefix) {
    throw new Error("IPv4만 위치 등록이 가능합니다.");
  }

  const existing = await prisma.ipLocationEntry.findUnique({ where: { ip } });

  if (
    existing &&
    !input.userVerified &&
    !existing.userVerified &&
    input.accuracyM > existing.accuracyM + 40 &&
    Date.now() - existing.updatedAt.getTime() < 60 * 60 * 1000
  ) {
    const totalCount = await getCrowdLocationCount();
    return {
      totalCount,
      isUpdate: true,
      appliedAddress: existing.appliedAddress,
    };
  }

  const isUpdate = Boolean(existing);

  if (existing?.userVerified && !input.userVerified) {
    const totalCount = await getCrowdLocationCount();
    return {
      totalCount,
      isUpdate: true,
      appliedAddress: existing.appliedAddress,
    };
  }

  const verified = Boolean(input.userVerified);

  await prisma.ipLocationEntry.upsert({
    where: { ip },
    create: {
      ip,
      ipPrefix24: prefix,
      lat: input.lat,
      lon: input.lon,
      accuracyM: input.accuracyM,
      address: input.address,
      appliedAddress: input.appliedAddress,
      dong: input.dong || null,
      sido: input.sido || null,
      sigungu: input.sigungu || null,
      roadAddress: input.roadAddress || null,
      isp: input.isp || null,
      source: input.source || "gps-register",
      userVerified: verified,
      verifiedAt: verified ? new Date() : null,
      registerCount: 1,
    },
    update: {
      lat: input.lat,
      lon: input.lon,
      accuracyM: input.accuracyM,
      address: input.address,
      appliedAddress: input.appliedAddress,
      dong: input.dong || null,
      sido: input.sido || null,
      sigungu: input.sigungu || null,
      roadAddress: input.roadAddress || null,
      isp: input.isp || existing?.isp || null,
      source: input.source || "gps-register",
      ...(verified
        ? { userVerified: true, verifiedAt: new Date() }
        : existing?.userVerified
          ? {}
          : { userVerified: false }),
      registerCount: { increment: 1 },
    },
  });

  const totalCount = await getCrowdLocationCount();
  return { totalCount, isUpdate, appliedAddress: input.appliedAddress };
}

/** 동일 ISP /16 대역 클러스터 (115.140.* ↔ 115.141.* 등) */
export async function lookupCrowdIspCluster(
  ip: string,
  isp?: string,
): Promise<GeoLocationData | null> {
  const prefix16 = ipv4Prefix16(ip);
  if (!prefix16) return null;

  const since = new Date();
  since.setDate(since.getDate() - GPS_CLUSTER_RECENCY_DAYS);
  const quality = buildClusterQualityFilter(since);

  let resolvedIsp = isp?.trim() || "";
  if (!resolvedIsp) {
    const ispSample = await prisma.ipLocationEntry.findFirst({
      where: {
        ip: { startsWith: `${prefix16}.` },
        isp: { not: null },
        ...quality,
      },
      orderBy: [{ registerCount: "desc" }, { accuracyM: "asc" }],
      select: { isp: true },
    });
    resolvedIsp = ispSample?.isp?.trim() || "";
  }
  if (!resolvedIsp) return null;

  const cluster = await prisma.ipLocationEntry.findMany({
    where: {
      ip: { startsWith: `${prefix16}.` },
      isp: resolvedIsp,
      ...quality,
    },
    orderBy: [{ accuracyM: "asc" }, { registerCount: "desc" }],
    take: 12,
  });

  if (cluster.length < 2) return null;

  const spread = clusterSpreadM(cluster);
  const spreadLimit = maxSpreadForCluster(
    cluster,
    CROWD_CLUSTER_MAX_SPREAD_M * 4,
  );
  if (spread > spreadLimit) return null;

  const { lat, lon } = weightedMedianCoords(cluster);
  const best = cluster[0];
  const accuracyM = Math.max(Math.round(spread / 2), Math.round(best.accuracyM));
  const display = await resolveClusterDisplay(lat, lon, best);

  return toCrowdGeoData(
    normalizeIp(ip),
    {
      lat,
      lon,
      address: display.address,
      appliedAddress: display.address,
      dong: display.dong || null,
      sido: display.sido || null,
      sigungu: display.sigungu || null,
      roadAddress: null,
      isp: best.isp,
    },
    `등록 DB — 동일 ISP /16 ${cluster.length}건 (가중 중앙값)`,
    cluster.length >= 3 ? 78 : 72,
    { exactPin: false, accuracyM },
  );
}

/** 동일 ISP 인접 /24 대역 등록 DB */
export async function lookupCrowdSibling(
  ip: string,
  isp?: string,
): Promise<GeoLocationData | null> {
  const parts = normalizeIp(ip).split(".");
  if (parts.length !== 4) return null;

  const oct3 = Number(parts[2]);
  if (!Number.isFinite(oct3)) return null;

  const prefixes = new Set<string>();
  for (const delta of [-1, 0, 1]) {
    const o3 = oct3 + delta;
    if (o3 < 0 || o3 > 255) continue;
    prefixes.add(`${parts[0]}.${parts[1]}.${o3}`);
  }

  const since = new Date();
  since.setDate(since.getDate() - GPS_CLUSTER_RECENCY_DAYS);
  const quality = buildClusterQualityFilter(since);

  const siblings = await prisma.ipLocationEntry.findMany({
    where: {
      ipPrefix24: { in: [...prefixes] },
      ...quality,
      ...(isp ? { isp } : {}),
    },
    orderBy: [{ accuracyM: "asc" }, { registerCount: "desc" }],
    take: 8,
  });

  if (siblings.length === 0) return null;

  const spread = clusterSpreadM(siblings);
  const spreadLimit = maxSpreadForCluster(
    siblings,
    CROWD_CLUSTER_MAX_SPREAD_M * 2,
  );
  if (spread > spreadLimit) return null;

  const { lat, lon } = weightedMedianCoords(siblings);
  const best = siblings[0];
  const accuracyM = Math.max(
    Math.round(spread / 2),
    Math.round(best.accuracyM),
  );
  const display = await resolveClusterDisplay(lat, lon, best);

  return toCrowdGeoData(
    normalizeIp(ip),
    {
      lat,
      lon,
      address: display.address,
      appliedAddress: display.address,
      dong: display.dong || null,
      sido: display.sido || null,
      sigungu: display.sigungu || null,
      roadAddress: null,
      isp: best.isp,
    },
    `등록 DB — 인접 대역 ${siblings.length}건 (ISP ${best.isp || "동일"})`,
    siblings.length >= 2 ? 82 : 76,
    { exactPin: false, accuracyM },
  );
}

/** 동일 IP 정확 매칭만 (클러스터·Kakao 역지오코딩 생략 — 조회 속도 우선) */
export async function lookupCrowdIpExact(
  ip: string,
): Promise<GeoLocationData | null> {
  const queryIp = normalizeIp(ip);
  const exact = await prisma.ipLocationEntry.findUnique({
    where: { ip: queryIp },
  });
  if (!exact) return null;

  void prisma.ipLocationEntry
    .update({
      where: { id: exact.id },
      data: { lookupCount: { increment: 1 } },
    })
    .catch(() => {});

  const exactPin = Boolean(exact.userVerified);

  const districtAddress =
    buildDistrictAddress({
      sido: exact.sido || undefined,
      sigungu: exact.sigungu || undefined,
      dong: exact.dong || undefined,
      includeDong: Boolean(exact.dong),
    }) || exact.appliedAddress;

  const entryForDisplay = exact.userVerified
    ? exact
    : { ...exact, address: districtAddress };

  return toCrowdGeoData(
    queryIp,
    entryForDisplay,
    exact.userVerified
      ? VERIFIED_ZERO_ERROR_NOTE
      : `등록 DB — 주소 미확인 (시·군·구 추정)`,
    exact.userVerified ? 95 : 72,
    {
      exactPin,
      accuracyM: exact.userVerified ? undefined : Math.max(Math.round(exact.accuracyM), 500),
    },
  );
}

/** 등록 DB 우선 조회 — exact → /24 → 인접대역 → ISP /16 */
export async function lookupCrowdIp(ip: string): Promise<GeoLocationData | null> {
  const exact = await lookupCrowdIpExact(ip);
  if (exact) return exact;

  const queryIp = normalizeIp(ip);
  const prefix = ipv4Prefix24(queryIp);
  if (!prefix) return null;

  const since = new Date();
  since.setDate(since.getDate() - GPS_CLUSTER_RECENCY_DAYS);
  const quality = buildClusterQualityFilter(since);

  const cluster = await prisma.ipLocationEntry.findMany({
    where: {
      ipPrefix24: prefix,
      ...quality,
    },
    orderBy: [{ accuracyM: "asc" }, { registerCount: "desc" }],
    take: 12,
  });

  if (cluster.length === 0) {
    const sibling = await lookupCrowdSibling(queryIp, undefined);
    if (sibling) return sibling;
    return lookupCrowdIspCluster(queryIp, undefined);
  }

  if (cluster.length === 1) {
    const one = cluster[0];
    if (one.isp) {
      const ispCluster = await lookupCrowdIspCluster(queryIp, one.isp);
      if (ispCluster) return ispCluster;
    }
    const display = await resolveClusterDisplay(one.lat, one.lon, one);
    const accuracyM = Math.max(
      Math.round(one.accuracyM),
      one.source === MYLOCATION_IMPORT_SOURCE ? 400 : 0,
    );
    return toCrowdGeoData(
      queryIp,
      {
        lat: one.lat,
        lon: one.lon,
        address: display.address,
        appliedAddress: display.address,
        dong: display.dong || null,
        sido: display.sido || null,
        sigungu: display.sigungu || null,
        roadAddress: null,
        isp: one.isp,
      },
      one.source === MYLOCATION_IMPORT_SOURCE
        ? `등록 DB — 동일 /24 대역 추정`
        : `등록 DB — 동일 대역 추정 (${one.accuracyM}m)`,
      one.accuracyM <= 20 ? 84 : 76,
      { exactPin: false, accuracyM },
    );
  }

  const spread = clusterSpreadM(cluster);
  const spreadLimit = maxSpreadForCluster(cluster, CROWD_CLUSTER_MAX_SPREAD_M);
  if (spread > spreadLimit) {
    const sibling = await lookupCrowdSibling(queryIp, cluster[0]?.isp || undefined);
    if (sibling) return sibling;
    const isp = cluster[0]?.isp || undefined;
    return lookupCrowdIspCluster(queryIp, isp);
  }

  const { lat, lon } = weightedMedianCoords(cluster);
  const best = cluster[0];
  const accuracyM = Math.max(Math.round(spread / 2), Math.round(best.accuracyM));
  const display = await resolveClusterDisplay(lat, lon, best);

  return toCrowdGeoData(
    queryIp,
    {
      lat,
      lon,
      address: display.address,
      appliedAddress: display.address,
      dong: display.dong || null,
      sido: display.sido || null,
      sigungu: display.sigungu || null,
      roadAddress: null,
      isp: best.isp,
    },
    `등록 DB — 동일 /24 ${cluster.length}건 융합`,
    spread < 200 ? 80 : 72,
    { exactPin: false, accuracyM },
  );
}

export async function eraseCrowdLocation(ip: string): Promise<boolean> {
  const queryIp = normalizeIp(ip);
  const result = await prisma.ipLocationEntry.deleteMany({
    where: { ip: queryIp },
  });
  return result.count > 0;
}

export async function getCrowdLocationCount(): Promise<number> {
  return prisma.ipLocationEntry.count();
}

export async function getCrowdStats(): Promise<CrowdStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [count, todayRegistered] = await Promise.all([
    prisma.ipLocationEntry.count(),
    prisma.ipLocationEntry.count({
      where: { updatedAt: { gte: startOfDay } },
    }),
  ]);

  return { count, todayRegistered };
}
