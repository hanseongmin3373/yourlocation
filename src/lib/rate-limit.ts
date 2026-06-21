/**
 * IP 기반 API rate limit (인메모리 — Vercel 서버리스는 인스턴스별)
 * DB 유출·무차별 조회·등록 남용 완화
 */
import { createMemoryCache } from "./memory-cache";

type Bucket = { count: number; resetAt: number };

const buckets = createMemoryCache<Bucket>(60_000, 20_000);

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return {
      allowed: true,
      remaining: opts.limit - 1,
      retryAfterSec: 0,
    };
  }

  if (bucket.count >= opts.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: opts.limit - bucket.count,
    retryAfterSec: 0,
  };
}

/** 조회 API — IP당 분당 120회 (무제한 정책과 별개, 남용·스크래핑 방지) */
export function checkGeoLookupRateLimit(clientIp: string): RateLimitResult {
  const limit = Number(process.env.GEO_RATE_LIMIT_PER_MIN || 120);
  return checkRateLimit(`geo:${clientIp}`, {
    limit: Math.max(30, limit),
    windowMs: 60_000,
  });
}

/** 위치 등록 — IP당 시간당 20회 */
export function checkLocationRegisterRateLimit(clientIp: string): RateLimitResult {
  return checkRateLimit(`reg:${clientIp}`, {
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
}

/** 동일 클라이언트가 분당 조회하는 서로 다른 IP 수 제한 (DB 대량 스크래핑 방지) */
type DistinctBucket = { ips: Set<string>; resetAt: number };
const distinctBuckets = createMemoryCache<DistinctBucket>(120_000, 10_000);

export function checkDistinctIpLookupBurst(
  clientIp: string,
  targetIp: string,
): RateLimitResult {
  const limit = Number(process.env.GEO_DISTINCT_IPS_PER_MIN || 60);
  const now = Date.now();
  const key = `distinct:${clientIp}`;
  let bucket = distinctBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { ips: new Set([targetIp]), resetAt: now + 60_000 };
    distinctBuckets.set(key, bucket);
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  bucket.ips.add(targetIp);
  distinctBuckets.set(key, bucket);

  if (bucket.ips.size > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: limit - bucket.ips.size,
    retryAfterSec: 0,
  };
}
