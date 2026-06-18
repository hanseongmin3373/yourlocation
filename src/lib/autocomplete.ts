import { parseCoordinates } from "./coord-validation";
import { isValidIp } from "./ip-validation";
import {
  searchAddressCandidates,
  searchKeywordCandidates,
} from "./kakao-geocode";

export type AutocompleteSuggestion = {
  id: string;
  label: string;
  sublabel?: string;
  value: string;
  type: "ip" | "address" | "coords";
  group?: "recent" | "suggest";
};

function dedupeSuggestions(
  items: AutocompleteSuggestion[],
): AutocompleteSuggestion[] {
  const seen = new Set<string>();
  const out: AutocompleteSuggestion[] = [];
  for (const item of items) {
    const key = `${item.type}|${item.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 12);
}

/** 주소 API 호출이 의미 있는 입력인지 (순수 IP·좌표 숫자는 제외) */
export function looksLikeAddressQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (/[가-힣]/.test(q)) return true;
  if (/[가-힣]+(로|길|동|읍|면|리)\b/.test(q)) return true;
  if (/\b(gu|si|do|ro|gil|dong|eup|myeon|ri)\b/i.test(q)) return true;
  if (/[a-zA-Z가-힣]/.test(q) && /\s/.test(q) && !/^-?\d/.test(q)) return true;
  return false;
}

function looksLikePartialIp(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (parseCoordinates(q)) return false;
  return /^[\d.]+$/.test(q) && (q.includes(".") || /^\d{1,3}$/.test(q));
}

function buildIpSuggestions(
  query: string,
  clientIp?: string,
): AutocompleteSuggestion[] {
  const q = query.trim();
  const suggestions: AutocompleteSuggestion[] = [];

  if (isValidIp(q)) {
    suggestions.push({
      id: "ip-input",
      label: q,
      sublabel: "IP 위치 조회",
      value: q,
      type: "ip",
      group: "suggest",
    });
    return suggestions;
  }

  if (!clientIp) return suggestions;

  const normalizedClient = clientIp.trim();
  const prefix = q.replace(/\s/g, "");

  if (
    prefix.length >= 2 &&
    normalizedClient.startsWith(prefix) &&
    normalizedClient !== prefix
  ) {
    suggestions.push({
      id: "ip-prefix-own",
      label: normalizedClient,
      sublabel: `내 접속 IP · "${prefix}" 입력 중`,
      value: normalizedClient,
      type: "ip",
      group: "suggest",
    });
  }

  if (
    prefix.length >= 3 &&
    normalizedClient.includes(prefix) &&
    !normalizedClient.startsWith(prefix)
  ) {
    suggestions.push({
      id: "ip-own",
      label: normalizedClient,
      sublabel: "내 접속 IP",
      value: normalizedClient,
      type: "ip",
      group: "suggest",
    });
  }

  if (looksLikePartialIp(q) && !suggestions.some((s) => s.value === normalizedClient)) {
    const octets = prefix.split(".").filter(Boolean);
    if (octets.length >= 1 && octets.length < 4) {
      suggestions.push({
        id: "ip-partial-hint",
        label: prefix,
        sublabel: "IP 입력 중 — 완성 후 Enter 또는 내 IP 선택",
        value: prefix,
        type: "ip",
        group: "suggest",
      });
    }
  }

  return suggestions;
}

function buildCoordSuggestions(query: string): AutocompleteSuggestion[] {
  const q = query.trim();
  const suggestions: AutocompleteSuggestion[] = [];

  const coords = parseCoordinates(q);
  if (coords) {
    suggestions.push({
      id: "coords-input",
      label: `${coords.lat.toFixed(7)}, ${coords.lon.toFixed(7)}`,
      sublabel: "위도·경도 좌표 검색",
      value: `${coords.lat.toFixed(7)}, ${coords.lon.toFixed(7)}`,
      type: "coords",
      group: "suggest",
    });
    return suggestions;
  }

  const partialCoord = q.match(/^(-?\d+(?:\.\d+)?)\s*[,，]?\s*(-?\d*)$/);
  if (partialCoord) {
    const lat = partialCoord[1];
    const lon = partialCoord[2];
    if (lon) {
      const value = `${lat}, ${lon}`;
      suggestions.push({
        id: "coords-partial",
        label: value,
        sublabel: "좌표 입력 중 — Enter로 검색",
        value,
        type: "coords",
        group: "suggest",
      });
    } else if (lat.includes(".")) {
      suggestions.push({
        id: "coords-lat-only",
        label: `${lat}, `,
        sublabel: "경도를 이어서 입력하세요",
        value: `${lat}, `,
        type: "coords",
        group: "suggest",
      });
    }
  }

  return suggestions;
}

export async function buildAutocompleteSuggestions(
  query: string,
  clientIp?: string,
): Promise<AutocompleteSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const suggestions: AutocompleteSuggestion[] = [
    ...buildCoordSuggestions(q),
    ...buildIpSuggestions(q, clientIp),
  ];

  if (looksLikeAddressQuery(q) && !looksLikePartialIp(q)) {
    const [addresses, keywords] = await Promise.all([
      searchAddressCandidates(q, 6),
      searchKeywordCandidates(q, 4),
    ]);

    for (const a of addresses) {
      const label = a.road || a.full;
      suggestions.push({
        id: `addr-${a.lat}-${a.lng}-${label}`,
        label,
        sublabel: [a.sido, a.sigungu, a.dong].filter(Boolean).join(" "),
        value: label,
        type: "address",
        group: "suggest",
      });
    }

    for (const k of keywords) {
      const label = k.full;
      suggestions.push({
        id: `kw-${k.lat}-${k.lng}-${label}`,
        label,
        sublabel: `장소 · ${k.lat.toFixed(5)}, ${k.lng.toFixed(5)}`,
        value: label,
        type: "address",
        group: "suggest",
      });
    }
  }

  return dedupeSuggestions(suggestions);
}
