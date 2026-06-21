import { normalizeIp } from "./client-ip";
import {
  buildDistrictAddress,
  CROWD_CLUSTER_MAX_ACCURACY_M,
  CROWD_CLUSTER_MAX_SPREAD_M,
  MAX_ALLOWED_ACCURACY_M,
  MYLOCATION_IMPORT_MAX_ACCURACY_M,
  MYLOCATION_IMPORT_MAX_SPREAD_M,
  LOOKUP_ABSORB_MAX_ACCURACY_M,
  LOOKUP_ABSORB_MAX_SPREAD_M,
  VERIFIED_ZERO_ERROR_NOTE,
} from "./geo-accuracy";
import { applyDualAccuracyPolicy } from "./geo-accuracy-policy";
import { haversineMeters } from "./geo-fusion";
import { resolveAddressFromCoords } from "./kakao-geocode";
import { prisma } from "./db";
import type { GeoLocationData } from "./types";
import type { Prisma } from "@prisma/client";

const GPS_CLUSTER_RECENCY_DAYS = 365;
const MYLOCATION_IMPORT_SOURCE = "mylocation-import";
export const LOOKUP_ABSORB_SOURCE = "lookup-absorb";
const ADMIN_VERIFIED_SOURCE = "admin-verified";

const IMPORT_LIKE_SOURCES = new Set([
  MYLOCATION_IMPORT_SOURCE,
  LOOKUP_ABSORB_SOURCE,
  ADMIN_VERIFIED_SOURCE,
]);

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
  verifiedCount: number;
  bySource: { source: string; count: number }[];
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

/** GPS 자발 등록(최근·고정밀) + bulk import·검증 데이터 클러스터 조건 */
function buildClusterQualityFilter(since: Date): Prisma.IpLocationEntryWhereInput {
  return {
    OR: [
      {
        source: {
          notIn: [
            MYLOCATION_IMPORT_SOURCE,
            LOOKUP_ABSORB_SOURCE,
            ADMIN_VERIFIED_SOURCE,
          ],
        },
        updatedAt: { gte: since },
        accuracyM: { lte: CROWD_CLUSTER_MAX_ACCURACY_M },
      },
      {
        source: MYLOCATION_IMPORT_SOURCE,
        accuracyM: { lte: MYLOCATION_IMPORT_MAX_ACCURACY_M },
      },
      {
        source: ADMIN_VERIFIED_SOURCE,
        accuracyM: { lte: MYLOCATION_IMPORT_MAX_ACCURACY_M },
      },
      {
        source: LOOKUP_ABSORB_SOURCE,
        accuracyM: { lte: LOOKUP_ABSORB_MAX_ACCURACY_M },
      },
    ],
  };
}

function isTrustedImportSource(source?: string | null): boolean {
  return source != null && IMPORT_LIKE_SOURCES.has(source);
}

function normalizeSigunguKey(name?: string | null): string {
  return String(name ?? "")
    .replace(/\s+/g, "")
    .replace(/(특별시|광역시|특별자치시|시|군|구)$/g, "");
}

/** bulk import /24 — 동일 시·군·구 합의 시 spread 완화 */
function clusterAdminConsensus(
  entries: {
    sigungu?: string | null;
    sido?: string | null;
    source?: string;
  }[],
): { sigungu: string; sido: string | null } | null {
  if (entries.length < 2) return null;
  if (!entries.every((e) => isTrustedImportSource(e.source))) return null;

  const keys = entries
    .map((e) => normalizeSigunguKey(e.sigungu))
    .filter(Boolean);
  if (keys.length < Math.ceil(entries.length * 0.85)) return null;
  if (new Set(keys).size !== 1) return null;

  const sigungu = entries.find((e) => e.sigungu)?.sigungu;
  if (!sigungu) return null;
  return { sigungu, sido: entries.find((e) => e.sido)?.sido ?? null };
}

function refineCrowdPolicy(opts: {
  baseAccuracyM: number;
  hasDong: boolean;
  resolvedDong?: string | null;
  sigungu?: string | null;
  sido?: string | null;
  spreadM?: number;
  trustedImport: boolean;
  userVerified?: boolean;
}) {
  if (opts.userVerified) {
    return {
      displayAccuracyM: undefined as number | undefined,
      tier: "high" as const,
      tierNote: VERIFIED_ZERO_ERROR_NOTE,
      showDong: Boolean(opts.resolvedDong),
      precisionScore: 95,
    };
  }

  const policy = applyDualAccuracyPolicy({
    baseAccuracyM: opts.baseAccuracyM,
    trustGeoCity: true,
    addressAligned: Boolean(opts.sigungu && (opts.sido || opts.sigungu)),
    hasDong: opts.hasDong,
    resolvedDong: opts.resolvedDong,
    spreadM: opts.spreadM,
    crowdDbBoost: opts.trustedImport,
    ispCorrectionBoost: opts.trustedImport && Boolean(opts.sigungu),
  });

  const precisionScore =
    policy.tier === "high"
      ? opts.trustedImport
        ? 90
        : 84
      : policy.tier === "normal"
        ? opts.trustedImport
          ? 82
          : 76
        : 68;

  return {
    displayAccuracyM: policy.displayAccuracyM,
    tier: policy.tier,
    tierNote: policy.tierNote,
    showDong: policy.showDong,
    precisionScore,
  };
}

function maxSpreadForCluster(
  entries: { source?: string }[],
  gpsSpreadLimit: number,
): number {
  const hasImport = entries.some((e) =>
    e.source ? IMPORT_LIKE_SOURCES.has(e.source) : false,
  );
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
  opts: {
    exactPin: boolean;
    accuracyM?: number;
    accuracyTier?: "high" | "normal" | "low";
    spreadM?: number;
  },
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
    accuracyTier: opts.accuracyTier,
    locationSource: opts.exactPin ? "pinpoint" : "crowd",
    accuracyNote: note,
    geoProvider: "crowd-db",
    geoSources: ["crowd-db"],
    precisionScore,
    confidenceLevel:
      opts.exactPin || opts.accuracyTier === "high"
        ? "high"
        : opts.accuracyTier === "normal"
          ? "medium"
          : "medium",
    addressSource: entry.userVerified ? "user-verified" : "crowd-register",
    expertMode: true,
    exactPin: opts.exactPin,
    userVerified: entry.userVerified || undefined,
    spreadM: opts.spreadM,
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
  const importLike = cluster.some((e) => isTrustedImportSource(e.source));
  const baseAccuracyM = Math.max(
    Math.round(spread / 2),
    Math.round(best.accuracyM),
    importLike ? 300 : 360,
  );
  const display = await resolveClusterDisplay(lat, lon, best);
  const policy = refineCrowdPolicy({
    baseAccuracyM,
    hasDong: Boolean(display.dong),
    resolvedDong: display.dong,
    sigungu: display.sigungu,
    sido: display.sido,
    spreadM: spread,
    trustedImport: importLike,
  });

  return toCrowdGeoData(
    normalizeIp(ip),
    {
      lat,
      lon,
      address: buildDistrictAddress({
        sido: display.sido,
        sigungu: display.sigungu,
        dong: display.dong,
        includeDong: policy.showDong && Boolean(display.dong),
      }) || display.address,
      appliedAddress: display.address,
      dong: display.dong || null,
      sido: display.sido || null,
      sigungu: display.sigungu || null,
      roadAddress: null,
      isp: best.isp,
    },
    `등록 DB — 동일 ISP /16 ${cluster.length}건 (가중 중앙값)`,
    policy.precisionScore,
    {
      exactPin: false,
      accuracyM: policy.displayAccuracyM,
      accuracyTier: policy.tier,
      spreadM: spread,
    },
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
  const importLike = siblings.some((e) => isTrustedImportSource(e.source));
  const baseAccuracyM = Math.max(
    Math.round(spread / 2),
    Math.round(best.accuracyM),
    importLike ? 300 : 360,
  );
  const display = await resolveClusterDisplay(lat, lon, best);
  const policy = refineCrowdPolicy({
    baseAccuracyM,
    hasDong: Boolean(display.dong),
    resolvedDong: display.dong,
    sigungu: display.sigungu,
    sido: display.sido,
    spreadM: spread,
    trustedImport: importLike,
  });

  return toCrowdGeoData(
    normalizeIp(ip),
    {
      lat,
      lon,
      address: buildDistrictAddress({
        sido: display.sido,
        sigungu: display.sigungu,
        dong: display.dong,
        includeDong: policy.showDong && Boolean(display.dong),
      }) || display.address,
      appliedAddress: display.address,
      dong: display.dong || null,
      sido: display.sido || null,
      sigungu: display.sigungu || null,
      roadAddress: null,
      isp: best.isp,
    },
    `등록 DB — 인접 대역 ${siblings.length}건 (ISP ${best.isp || "동일"})`,
    policy.precisionScore,
    {
      exactPin: false,
      accuracyM: policy.displayAccuracyM,
      accuracyTier: policy.tier,
      spreadM: spread,
    },
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

  if (
    exact.source === LOOKUP_ABSORB_SOURCE &&
    (exact.accuracyM > LOOKUP_ABSORB_MAX_ACCURACY_M || !exact.sigungu)
  ) {
    return null;
  }

  void prisma.ipLocationEntry
    .update({
      where: { id: exact.id },
      data: { lookupCount: { increment: 1 } },
    })
    .catch(() => {});

  const exactPin = Boolean(exact.userVerified);
  const trustedImport =
    isTrustedImportSource(exact.source) && Boolean(exact.sigungu);

  const baseAccuracyM = trustedImport
    ? Math.min(Math.round(exact.accuracyM), exact.dong ? 320 : 380)
    : Math.max(Math.round(exact.accuracyM), exact.dong ? 300 : 380);

  const policy = refineCrowdPolicy({
    baseAccuracyM,
    hasDong: Boolean(exact.dong),
    resolvedDong: exact.dong,
    sigungu: exact.sigungu,
    sido: exact.sido,
    trustedImport,
    userVerified: exactPin,
  });

  const districtAddress = buildDistrictAddress({
    sido: exact.sido || undefined,
    sigungu: exact.sigungu || undefined,
    dong: exact.dong || undefined,
    includeDong: policy.showDong && Boolean(exact.dong),
  }) || exact.appliedAddress;

  const entryForDisplay = exact.userVerified
    ? exact
    : { ...exact, address: districtAddress };

  const note = exactPin
    ? VERIFIED_ZERO_ERROR_NOTE
    : trustedImport && exact.sigungu
      ? `등록 DB — ${exact.sigungu}${policy.showDong && exact.dong ? ` ${exact.dong}` : ""}`
      : policy.tierNote;

  return toCrowdGeoData(
    queryIp,
    entryForDisplay,
    note,
    policy.precisionScore,
    {
      exactPin,
      accuracyM: policy.displayAccuracyM,
      accuracyTier: policy.tier,
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
    const importLike = isTrustedImportSource(one.source);
    const display = await resolveClusterDisplay(one.lat, one.lon, one);
    const baseAccuracyM = Math.max(
      Math.round(one.accuracyM),
      importLike ? (display.dong ? 260 : 320) : 340,
    );
    const policy = refineCrowdPolicy({
      baseAccuracyM,
      hasDong: Boolean(display.dong),
      resolvedDong: display.dong,
      sigungu: display.sigungu,
      sido: display.sido,
      trustedImport: importLike,
    });
    return toCrowdGeoData(
      queryIp,
      {
        lat: one.lat,
        lon: one.lon,
        address: buildDistrictAddress({
          sido: display.sido,
          sigungu: display.sigungu,
          dong: display.dong,
          includeDong: policy.showDong && Boolean(display.dong),
        }) || display.address,
        appliedAddress: display.address,
        dong: display.dong || null,
        sido: display.sido || null,
        sigungu: display.sigungu || null,
        roadAddress: null,
        isp: one.isp,
      },
      importLike
        ? `등록 DB — 동일 /24 (${display.sigungu || "대역"})`
        : policy.tierNote,
      policy.precisionScore,
      {
        exactPin: false,
        accuracyM: policy.displayAccuracyM,
        accuracyTier: policy.tier,
      },
    );
  }

  const spread = clusterSpreadM(cluster);
  const spreadLimit = maxSpreadForCluster(cluster, CROWD_CLUSTER_MAX_SPREAD_M);
  const adminConsensus = clusterAdminConsensus(cluster);
  if (spread > spreadLimit && !adminConsensus) {
    const sibling = await lookupCrowdSibling(queryIp, cluster[0]?.isp || undefined);
    if (sibling) return sibling;
    const isp = cluster[0]?.isp || undefined;
    return lookupCrowdIspCluster(queryIp, isp);
  }

  const { lat, lon } = weightedMedianCoords(cluster);
  const best = cluster[0];
  const importLike = cluster.some((e) => isTrustedImportSource(e.source));
  const baseAccuracyM = Math.max(
    Math.round(spread / 2),
    Math.round(best.accuracyM),
    importLike ? 280 : 340,
  );
  const display = await resolveClusterDisplay(lat, lon, {
    ...best,
    ...(adminConsensus
      ? { sigungu: adminConsensus.sigungu, sido: adminConsensus.sido }
      : {}),
  });
  const policy = refineCrowdPolicy({
    baseAccuracyM,
    hasDong: Boolean(display.dong),
    resolvedDong: display.dong,
    sigungu: display.sigungu,
    sido: display.sido,
    spreadM: spread,
    trustedImport: importLike || Boolean(adminConsensus),
  });

  return toCrowdGeoData(
    queryIp,
    {
      lat,
      lon,
      address: buildDistrictAddress({
        sido: display.sido,
        sigungu: display.sigungu,
        dong: display.dong,
        includeDong: policy.showDong && Boolean(display.dong),
      }) || display.address,
      appliedAddress: display.address,
      dong: display.dong || null,
      sido: display.sido || null,
      sigungu: display.sigungu || null,
      roadAddress: null,
      isp: best.isp,
    },
    adminConsensus
      ? `등록 DB — /24 ${cluster.length}건 · ${adminConsensus.sigungu} 합의`
      : `등록 DB — 동일 /24 ${cluster.length}건 융합`,
    policy.precisionScore,
    {
      exactPin: false,
      accuracyM: policy.displayAccuracyM,
      accuracyTier: policy.tier,
      spreadM: spread,
    },
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

  const [count, todayRegistered, verifiedCount, grouped] = await Promise.all([
    prisma.ipLocationEntry.count(),
    prisma.ipLocationEntry.count({
      where: { updatedAt: { gte: startOfDay } },
    }),
    prisma.ipLocationEntry.count({
      where: { userVerified: true },
    }),
    prisma.ipLocationEntry.groupBy({
      by: ["source"],
      _count: { _all: true },
    }),
  ]);

  return {
    count,
    todayRegistered,
    verifiedCount,
    bySource: grouped
      .map((g) => ({
        source: g.source,
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

const PROTECTED_SOURCES = new Set([
  "user-verified",
  "admin-verified",
  "gps-register",
]);

function lookupAbsorbAccuracyM(data: GeoLocationData): number {
  let m: number;
  if (data.accuracyM != null && data.accuracyM > 0) {
    m = Math.min(Math.round(data.accuracyM), MAX_ALLOWED_ACCURACY_M);
  } else if (data.ipinfoRadiusKm != null && data.ipinfoRadiusKm > 0) {
    m = Math.min(Math.round(data.ipinfoRadiusKm * 520), 900);
  } else if (data.precisionScore != null && data.precisionScore >= 80) {
    m = 360;
  } else if (data.precisionScore != null && data.precisionScore >= 65) {
    m = 620;
  } else if (data.exactPin) {
    m = 420;
  } else {
    m = 900;
  }

  const policy = applyDualAccuracyPolicy({
    baseAccuracyM: m,
    trustGeoCity: (data.geoTrustScore ?? 0) >= 55,
    addressAligned: Boolean(data.dong && data.sido && data.sigungu),
    hasDong: Boolean(data.dong),
    resolvedDong: data.dong,
    ipinfoRadiusKm: data.ipinfoRadiusKm,
    ispCorrectionBoost: Boolean(data.ispCorrectionId),
  });

  return policy.displayAccuracyM;
}

export function isLookupAbsorbEnabled(): boolean {
  const v = process.env.LOOKUP_ABSORB?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on") return true;
  return false;
}

/** 저품질 GeoIP 결과 crowd DB 오염 방지 */
function shouldAbsorbLookup(data: GeoLocationData): boolean {
  if (data.resolvedVia === "gps" || data.locationSource === "gps") return false;
  if (data.geoProvider === "crowd-db" || data.locationSource === "crowd") {
    return false;
  }
  if (data.isVpn || data.isHosting || data.isAnycast) return false;
  if (!data.sigungu && !data.city) return false;

  const score = data.precisionScore ?? 0;
  const trust = data.geoTrustScore ?? 0;
  const tier = data.accuracyTier;

  if (data.userVerified) return true;
  if (data.ispCorrectionId) return true;
  if (tier === "high") return true;
  if (score >= 78 && trust >= 58) return true;
  if (data.geoProvider === "crowd-db") return false;

  return score >= 72 && Boolean(data.dong) && (data.accuracyM ?? 9999) <= 450;
}

/** GeoIP·융합 조회 결과 → crowd DB 적재 (등록 DB miss 시 자동 흡수) */
export async function absorbLookupResult(data: GeoLocationData): Promise<void> {
  if (!isLookupAbsorbEnabled()) return;
  if (!shouldAbsorbLookup(data)) return;

  if (data.geoProvider === "crowd-db" || data.locationSource === "crowd") {
    return;
  }

  const ip = normalizeIp(data.ip);
  const prefix = ipv4Prefix24(ip);
  if (!prefix) return;

  if (
    !Number.isFinite(data.lat) ||
    !Number.isFinite(data.lon) ||
    (data.lat === 0 && data.lon === 0)
  ) {
    return;
  }

  const accuracyM = lookupAbsorbAccuracyM(data);
  if (accuracyM > MAX_ALLOWED_ACCURACY_M) return;

  const address =
    data.roadAddress || data.address || data.legalAddress || "";
  if (!address.trim()) return;

  const appliedAddress =
    buildDistrictAddress({
      sido: data.sido || data.region || undefined,
      sigungu: data.sigungu || data.city || undefined,
      dong: data.dong || undefined,
      includeDong: Boolean(data.dong),
    }) || address;

  const existing = await prisma.ipLocationEntry.findUnique({ where: { ip } });

  if (existing?.userVerified) {
    void prisma.ipLocationEntry
      .update({
        where: { id: existing.id },
        data: { lookupCount: { increment: 1 } },
      })
      .catch(() => {});
    return;
  }

  if (
    existing &&
    PROTECTED_SOURCES.has(existing.source) &&
    existing.accuracyM + 50 < accuracyM
  ) {
    void prisma.ipLocationEntry
      .update({
        where: { id: existing.id },
        data: { lookupCount: { increment: 1 } },
      })
      .catch(() => {});
    return;
  }

  if (
    existing &&
    existing.source === MYLOCATION_IMPORT_SOURCE &&
    existing.accuracyM + 80 < accuracyM
  ) {
    void prisma.ipLocationEntry
      .update({
        where: { id: existing.id },
        data: { lookupCount: { increment: 1 } },
      })
      .catch(() => {});
    return;
  }

  const geoMeta = [data.geoProvider, ...(data.geoSources || [])]
    .filter(Boolean)
    .join("+");

  await prisma.ipLocationEntry.upsert({
    where: { ip },
    create: {
      ip,
      ipPrefix24: prefix,
      lat: data.lat,
      lon: data.lon,
      accuracyM,
      address,
      appliedAddress,
      dong: data.dong || null,
      sido: data.sido || data.region || null,
      sigungu: data.sigungu || data.city || null,
      roadAddress: data.roadAddress || null,
      isp: data.isp || null,
      source: LOOKUP_ABSORB_SOURCE,
      userVerified: false,
      registerCount: 1,
      lookupCount: 1,
    },
    update: {
      lat: data.lat,
      lon: data.lon,
      accuracyM,
      address,
      appliedAddress,
      dong: data.dong || null,
      sido: data.sido || data.region || null,
      sigungu: data.sigungu || data.city || null,
      roadAddress: data.roadAddress || null,
      isp: data.isp || existing?.isp || null,
      source: LOOKUP_ABSORB_SOURCE,
      lookupCount: { increment: 1 },
      registerCount: { increment: 1 },
    },
  });

  if (process.env.LOOKUP_ABSORB_LOG === "1") {
    console.log(`[lookup-absorb] ${ip} ${accuracyM}m ${geoMeta} → ${appliedAddress}`);
  }
}
