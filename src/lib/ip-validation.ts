import { normalizeIp } from "./client-ip";
import { parseCoordinates } from "./coord-validation";

export type SearchQueryType = "ip" | "address" | "coords";

export function isValidIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  const ipv4 =
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  const ipv6 =
    /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)\.){3}(25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)\.){3}(25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d))$/;
  return ipv4.test(normalized) || ipv6.test(normalized);
}

export function detectSearchQueryType(query: string): SearchQueryType {
  const q = query.trim();
  if (!q) return "ip";
  if (parseCoordinates(q)) return "coords";
  if (isValidIp(q)) return "ip";
  if (/[가-힣]/.test(q)) return "address";
  if (/\b(gu|si|do|ro|gil|dong)\b/i.test(q)) return "address";
  if (/[a-zA-Z]/.test(q) && q.includes(" ") && !parseCoordinates(q)) {
    return "address";
  }
  return "ip";
}

export function isAddressQuery(query: string): boolean {
  return detectSearchQueryType(query) === "address";
}
