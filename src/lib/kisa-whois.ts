import { normalizeIp } from "./client-ip";
import { searchAddressByQuery } from "./kakao-geocode";

const FETCH_OPTS: RequestInit = { cache: "no-store" };

export type KisaWhoisInfo = {
  orgName?: string;
  address?: string;
  zip?: string;
  netName?: string;
};

/** KISA IP WHOIS — 할당 기관 등록 주소 (한국 IP) */
export async function lookupKisaWhois(ip: string): Promise<KisaWhoisInfo | null> {
  const queryIp = normalizeIp(ip);
  const parts = queryIp.split(".");
  if (parts.length !== 4) return null;

  try {
    const res = await fetch(
      `https://whois.kisa.or.kr/openapi/whois.jsp?query=${encodeURIComponent(queryIp)}&answer=json`,
      FETCH_OPTS,
    );
    if (!res.ok) return null;

    const text = await res.text();
    const json = JSON.parse(text) as {
      whois?: {
        korean?: {
          ISP?: { netinfo?: { servName?: string; orgName?: string } };
          user?: {
            addr?: string;
            zipCode?: string;
            orgName?: string;
          };
        };
      };
    };

    const ko = json.whois?.korean;
    const user = ko?.user;
    const isp = ko?.ISP?.netinfo;

    const address = user?.addr?.trim();
    if (!address) return null;

    return {
      orgName: user?.orgName || isp?.orgName || isp?.servName,
      address,
      zip: user?.zipCode,
      netName: isp?.servName,
    };
  } catch {
    return null;
  }
}

/** WHOIS 등록 주소 → 카카오 좌표 */
export async function geocodeWhoisAddress(
  whois: KisaWhoisInfo,
): Promise<{ lat: number; lon: number; address: string } | null> {
  const queries = [whois.address, whois.zip, whois.orgName].filter(
    (q): q is string => Boolean(q?.trim()),
  );

  for (const q of queries) {
    const hit = await searchAddressByQuery(q);
    if (hit) {
      return {
        lat: hit.lat,
        lon: hit.lng,
        address: hit.road || hit.full,
      };
    }
  }
  return null;
}
