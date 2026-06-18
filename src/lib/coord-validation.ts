export type SearchQueryType = "ip" | "address" | "coords";

export type ParsedCoordinates = {
  lat: number;
  lon: number;
};

/** 위도·경도 문자열 파싱 — 37.4957,126.9526 / 37.4957 126.9526 등 */
export function parseCoordinates(query: string): ParsedCoordinates | null {
  const q = query.trim().replace(/[°]/g, "");
  if (!q) return null;

  const patterns = [
    /^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/,
    /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/,
    /^위도\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*[,，]?\s*경도\s*[:=]?\s*(-?\d+(?:\.\d+)?)$/i,
    /^lat\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*[,，]?\s*lng\s*[:=]?\s*(-?\d+(?:\.\d+)?)$/i,
  ];

  for (const pattern of patterns) {
    const m = q.match(pattern);
    if (!m) continue;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (!isValidCoordinate(lat, lon)) continue;
    return { lat, lon };
  }

  return null;
}

export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function formatAppliedAddress(
  sido?: string,
  sigungu?: string,
  dong?: string,
): string {
  return [sido, sigungu, dong].filter(Boolean).join(" ").trim();
}
