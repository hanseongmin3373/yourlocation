import { isIpv4, isPrivateIp, normalizeIp } from "./client-ip";

function isLocalIp(ip: string): boolean {
  return isPrivateIp(ip);
}

async function fetchJsonIp(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { ip?: string };
    return json.ip?.trim() || null;
  } catch {
    return null;
  }
}

/** mylocation.co.kr — 서버가 본 IPv4 우선, IPv6만 오면 IPv4 보조 조회 */
export async function resolveVisitorIp(serverHint?: string): Promise<string> {
  const hint = serverHint?.trim() ? normalizeIp(serverHint.trim()) : "";

  if (hint && !isLocalIp(hint) && isIpv4(hint)) {
    return hint;
  }

  const serverRes = await fetch("/api/ip", { cache: "no-store" }).then(
    (r) => r.json() as Promise<{ ip?: string; ipv4?: string | null }>,
  );

  const serverIp = serverRes.ip?.trim() ? normalizeIp(serverRes.ip.trim()) : "";
  const headerIpv4 = serverRes.ipv4?.trim()
    ? normalizeIp(serverRes.ipv4.trim())
    : "";

  if (headerIpv4 && !isLocalIp(headerIpv4)) {
    return headerIpv4;
  }

  if (serverIp && !isLocalIp(serverIp) && isIpv4(serverIp)) {
    return serverIp;
  }

  if (serverIp && !isLocalIp(serverIp) && !isIpv4(serverIp)) {
    const v4 = await fetchJsonIp("https://api4.ipify.org?format=json");
    if (v4 && !isLocalIp(v4)) return normalizeIp(v4);
    return serverIp;
  }

  if (serverIp && !isLocalIp(serverIp)) {
    return serverIp;
  }

  const v4 = await fetchJsonIp("https://api4.ipify.org?format=json");
  if (v4 && !isLocalIp(v4)) return normalizeIp(v4);

  return hint || serverIp || "";
}
