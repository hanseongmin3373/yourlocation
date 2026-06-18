import fs from "node:fs";
import path from "node:path";
import stationsBundled from "../../geo-data/police/stations.json";
import { haversineMeters } from "./geo-fusion";
import type { PoliceStationInfo } from "./types";

export type PoliceStationRecord = {
  name: string;
  address: string;
  phone: string;
  office?: string;
  parentStation?: string;
  sigungu?: string;
  jurisdictionRaw?: string;
  jurisdictionDongs?: string[];
  type: "station" | "district" | "substation";
  lat?: number;
  lon?: number;
  source?: string;
};

type PoliceDbFile = {
  updatedAt?: string;
  count?: number;
  stationCount?: number;
  source?: string;
  stations: PoliceStationRecord[];
};

let cache: PoliceStationRecord[] | null = null;

function dbPath(): string {
  return path.join(process.cwd(), "geo-data", "police", "stations.json");
}

function readPoliceDbFile(): PoliceDbFile {
  const file = dbPath();
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as PoliceDbFile;
  }
  return stationsBundled as PoliceDbFile;
}

export function loadPoliceStations(): PoliceStationRecord[] {
  if (cache) return cache;
  const raw = readPoliceDbFile();
  cache = (raw.stations ?? []).filter((s) => s.name && s.address);
  return cache;
}

function compact(s: string) {
  return s.replace(/\s/g, "");
}

/** "서울특별시 동작구" → "동작구" */
function extractGuName(sigungu?: string): string {
  if (!sigungu) return "";
  const trimmed = sigungu.trim();
  const match = trimmed.match(/([가-힣0-9]+(?:구|군|시))\s*$/);
  if (match) return compact(match[1]);
  return compact(trimmed);
}

/** 구 이름에서 경찰서명 매칭용 어간 (동작구 → 동작) */
function guNameStem(guNorm: string): string {
  return guNorm.replace(/(특별자치시|특별자치도|특별시|광역시|구|군|시)$/u, "");
}

function sigunguMatches(stationGu: string, userGu: string): boolean {
  if (!stationGu || !userGu) return false;
  return (
    stationGu === userGu ||
    userGu.includes(stationGu) ||
    stationGu.includes(userGu)
  );
}

const SIDO_STATION_PREFIX: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  제주특별자치도: "제주",
};

function sidoToStationPrefix(sido?: string): string | null {
  if (!sido) return null;
  const c = compact(sido);
  for (const [key, prefix] of Object.entries(SIDO_STATION_PREFIX)) {
    if (c.includes(compact(key))) return prefix;
  }
  const m = sido.match(/^([가-힣]{2,4})/);
  return m?.[1] ?? null;
}

function stationInGu(
  station: PoliceStationRecord,
  guNorm: string,
): boolean {
  const sGu = extractGuName(station.sigungu);
  if (sigunguMatches(sGu, guNorm)) return true;

  const raw = compact(station.jurisdictionRaw ?? "");
  if (raw === guNorm) return true;

  const stem = guNameStem(guNorm);
  return (
    stem.length >= 2 &&
    station.name.includes(stem) &&
    station.name.endsWith("경찰서")
  );
}

/** [별표2] PDF — 구(시·군) 단위 관할 경찰서 우선, 동은 분할 관할 보조 */
export function matchJurisdictionStation(
  stations: PoliceStationRecord[],
  opts: { sido?: string; sigungu?: string; dong?: string },
): PoliceStationRecord | null {
  const guNorm = extractGuName(opts.sigungu);
  const dongNorm = opts.dong ? compact(opts.dong) : "";
  if (!guNorm && !dongNorm) return null;

  const cityPrefix = sidoToStationPrefix(opts.sido);
  const official = stations.filter((s) => s.type === "station");
  const candidates = cityPrefix
    ? official.filter((s) => s.name.startsWith(cityPrefix))
    : official;

  const inGu = guNorm
    ? candidates.filter((s) => stationInGu(s, guNorm))
    : candidates;

  // 1) 분할 관할 구 — 동으로 경찰서 특정 (강남구 논현동 → 서울강남경찰서)
  if (dongNorm && inGu.length > 1) {
    for (const s of inGu) {
      if (s.jurisdictionDongs?.includes(dongNorm)) return s;
    }
    for (const s of inGu) {
      if (s.jurisdictionRaw?.replace(/\s/g, "").includes(dongNorm)) return s;
    }
  }

  // 2) 구 전체가 단일 경찰서 (동작구 → 서울동작경찰서)
  if (guNorm && inGu.length === 1) return inGu[0];

  if (guNorm) {
    const wholeDistrict = inGu.filter(
      (s) => compact(s.jurisdictionRaw ?? "") === guNorm,
    );
    if (wholeDistrict.length === 1) return wholeDistrict[0];

    const stem = guNameStem(guNorm);
    if (stem.length >= 2) {
      const byName = inGu.filter(
        (s) => s.name.includes(stem) && s.name.endsWith("경찰서"),
      );
      if (byName.length === 1) return byName[0];
    }
  }

  // 3) 동만으로 매칭 (구 정보 없을 때)
  if (dongNorm) {
    for (const s of candidates) {
      if (guNorm && !stationInGu(s, guNorm)) continue;
      if (s.jurisdictionDongs?.includes(dongNorm)) return s;
    }
    for (const s of candidates) {
      if (guNorm && !stationInGu(s, guNorm)) continue;
      if (s.jurisdictionRaw?.replace(/\s/g, "").includes(dongNorm)) return s;
    }
  }

  return null;
}

function typePriority(type: PoliceStationRecord["type"]): number {
  if (type === "station") return 3;
  if (type === "district") return 2;
  return 1;
}

function hasValidCoords(
  s: Pick<PoliceStationRecord, "lat" | "lon">,
): boolean {
  return Number.isFinite(s.lat) && Number.isFinite(s.lon);
}

/** 관할 경찰서에 좌표가 없을 때 하위 관서·동일 명칭 레코드에서 좌표 보완 */
function resolveStationCoords(
  station: PoliceStationRecord,
  stations: PoliceStationRecord[],
  userLat: number,
  userLon: number,
): { lat: number; lon: number } | null {
  if (hasValidCoords(station)) {
    return { lat: station.lat!, lon: station.lon! };
  }

  const sameName = stations.find(
    (s) => s.name === station.name && hasValidCoords(s),
  );
  if (sameName) return { lat: sameName.lat!, lon: sameName.lon! };

  const children = stations.filter(
    (s) => s.parentStation === station.name && hasValidCoords(s),
  );
  if (children.length) {
    let best = children[0];
    let bestD = haversineMeters(userLat, userLon, best.lat!, best.lon!);
    for (const c of children.slice(1)) {
      const d = haversineMeters(userLat, userLon, c.lat!, c.lon!);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return { lat: best.lat!, lon: best.lon! };
  }

  const sgNorm = station.sigungu ? compact(station.sigungu) : "";
  if (sgNorm) {
    const inSg = stations.filter(
      (s) =>
        s.type === "station" &&
        hasValidCoords(s) &&
        compact(s.sigungu ?? "").includes(sgNorm),
    );
    if (inSg.length) {
      let best = inSg[0];
      let bestD = haversineMeters(userLat, userLon, best.lat!, best.lon!);
      for (const c of inSg.slice(1)) {
        const d = haversineMeters(userLat, userLon, c.lat!, c.lon!);
        if (d < bestD) {
          best = c;
          bestD = d;
        }
      }
      return { lat: best.lat!, lon: best.lon! };
    }
  }

  return null;
}

function toInfo(
  s: PoliceStationRecord,
  lat: number,
  lon: number,
): PoliceStationInfo | null {
  if (!hasValidCoords(s)) return null;
  return {
    name: s.name,
    address: s.address,
    phone: s.phone || "",
    distanceM: Math.round(haversineMeters(lat, lon, s.lat!, s.lon!)),
    lat: s.lat!,
    lng: s.lon!,
  };
}

function findNearestWithCoords(
  stations: PoliceStationRecord[],
  userLat: number,
  userLon: number,
  opts?: { stationsOnly?: boolean },
): PoliceStationRecord | null {
  let best: PoliceStationRecord | null = null;
  let bestScore = -Infinity;

  for (const s of stations) {
    if (!hasValidCoords(s)) continue;
    if (opts?.stationsOnly && s.type !== "station") continue;
    const distanceM = haversineMeters(userLat, userLon, s.lat!, s.lon!);
    const typeBoost = typePriority(s.type) * 50;
    const score = -distanceM + (distanceM < 800 ? typeBoost : 0);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  return best;
}

/** 관할구역 우선 → 없으면 최근접 (경찰청 [별표2] + 지구대·파출소 DB) */
export function findPoliceForLocation(opts: {
  lat: number;
  lon: number;
  sido?: string;
  sigungu?: string;
  dong?: string;
}): PoliceStationInfo | null {
  const stations = loadPoliceStations();
  if (!stations.length) return null;

  const jurisdictional = matchJurisdictionStation(stations, {
    sido: opts.sido,
    sigungu: opts.sigungu,
    dong: opts.dong,
  });
  if (jurisdictional) {
    const coords = resolveStationCoords(
      jurisdictional,
      stations,
      opts.lat,
      opts.lon,
    );
    if (coords) {
      return toInfo(
        { ...jurisdictional, lat: coords.lat, lon: coords.lon },
        opts.lat,
        opts.lon,
      );
    }
  }

  const best =
    findNearestWithCoords(stations, opts.lat, opts.lon, { stationsOnly: true }) ??
    findNearestWithCoords(stations, opts.lat, opts.lon);
  return best ? toInfo(best, opts.lat, opts.lon) : null;
}

/** @deprecated findPoliceForLocation 사용 */
export function findNearestPoliceStation(
  lat: number,
  lon: number,
): PoliceStationInfo | null {
  return findPoliceForLocation({ lat, lon });
}

export function policeDbMeta(): {
  count: number;
  stationCount?: number;
  updatedAt?: string;
  source?: string;
} {
  const raw = readPoliceDbFile();
  return {
    count: raw.count ?? raw.stations?.length ?? 0,
    stationCount: raw.stationCount,
    updatedAt: raw.updatedAt,
    source: raw.source,
  };
}
