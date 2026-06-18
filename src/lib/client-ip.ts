/** 사설·루프백 IP 여부 */
export function isPrivateIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return true;
  if (
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized === "localhost"
  ) {
    return true;
  }
  if (normalized.startsWith("10.")) return true;
  if (normalized.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(normalized);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  return false;
}

/** IPv6-mapped IPv4 등 정규화 */
export function normalizeIp(raw: string): string {
  let ip = raw.trim();
  if (!ip) return "";

  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]"));
  }

  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const v4 = ip.slice(7);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return v4;
  }

  return ip;
}

const IP_HEADER_KEYS = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "fastly-client-ip",
] as const;

/** IPv4 여부 */
export function isIpv4(ip: string): boolean {
  const n = normalizeIp(ip);
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(n);
}

export function isIpv6(ip: string): boolean {
  const n = normalizeIp(ip);
  return n.includes(":");
}

function collectHeaderIps(headers: Headers): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of IP_HEADER_KEYS) {
    const value = headers.get(key);
    if (!value) continue;
    for (const part of value.split(",")) {
      const ip = normalizeIp(part.trim());
      if (!ip || seen.has(ip)) continue;
      seen.add(ip);
      out.push(ip);
    }
  }
  return out;
}

export function collectHeaderIpsForApi(headers: Headers): string[] {
  return collectHeaderIps(headers);
}

/** mylocation.co.kr 방식 — 공인 IPv4 우선 (듀얼스택 시 IPv4 표시) */
export function getPreferredClientIp(headers: Headers): string | null {
  const candidates = collectHeaderIps(headers);
  const publicV4 = candidates.find((ip) => !isPrivateIp(ip) && isIpv4(ip));
  if (publicV4) return publicV4;

  const publicAny = candidates.find((ip) => !isPrivateIp(ip));
  if (publicAny) return publicAny;

  const anyV4 = candidates.find((ip) => isIpv4(ip));
  if (anyV4) return anyV4;

  return candidates[0] ?? null;
}

/** 서버 요청 헤더에서 클라이언트 IP 추출 (Vercel·CDN 대응) */
export function getClientIpFromHeaders(headers: Headers): string | null {
  return getPreferredClientIp(headers);
}

export function getClientIp(headers: Headers): string {
  return getClientIpFromHeaders(headers) || "127.0.0.1";
}
