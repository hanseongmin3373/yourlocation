import fs from "node:fs";
import path from "node:path";
import { IP2Location } from "ip2location-nodejs";
import { toGeoCandidate, type GeoPointCandidate } from "./geo-fusion";
import { sanitizeGeoFields, sanitizeGeoText } from "./geo-field-sanitize";
import type { GeoLocationData } from "./types";

let engine: IP2Location | null = null;
let openedPath: string | null = null;
let openFailed = false;

/** DB11 > DB9 > DB5, IPv6 통합 BIN 우선 */
function scoreBinFile(name: string): number {
  let score = 0;
  if (/ipv6/i.test(name)) score += 200;
  const m = name.match(/DB(\d+)/i);
  if (m) score += Number(m[1]) * 10;
  return score;
}

function resolveBinPath(): string | null {
  const fromEnv = process.env.IP2LOCATION_BIN_PATH?.trim();
  if (fromEnv) {
    const resolved = path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(process.cwd(), fromEnv);
    if (fs.existsSync(resolved)) return resolved;
  }

  const dataDir = path.join(process.cwd(), "geo-data");
  if (!fs.existsSync(dataDir)) return null;

  const bins = fs
    .readdirSync(dataDir)
    .filter((name) => /\.bin$/i.test(name))
    .sort((a, b) => scoreBinFile(b) - scoreBinFile(a));

  if (bins.length === 0) return null;
  return path.join(dataDir, bins[0]);
}

function getEngine(): IP2Location | null {
  if (openFailed) return null;
  if (engine && openedPath) return engine;

  const binPath = resolveBinPath();
  if (!binPath) {
    openFailed = true;
    return null;
  }

  try {
    engine = new IP2Location();
    engine.open(binPath);
    openedPath = binPath;
    return engine;
  } catch {
    openFailed = true;
    engine = null;
    openedPath = null;
    return null;
  }
}

export function isIp2LocationConfigured(): boolean {
  return Boolean(resolveBinPath());
}

export function getIp2LocationBinPath(): string | null {
  return openedPath ?? resolveBinPath();
}

/** IP2Location 로컬 BIN 조회 (IPv4·IPv6) */
export async function lookupFromIp2Location(ip: string): Promise<{
  data: Partial<GeoLocationData> & { district?: string };
  point: GeoPointCandidate;
} | null> {
  const db = getEngine();
  if (!db) return null;

  try {
    const row = db.getAll(ip);
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat === 0 && lon === 0) return null;

    const point = toGeoCandidate(lat, lon, "ip2location", 3)!;
    if (!point) return null;

    const isp = sanitizeGeoText(row.isp);
    const org = sanitizeGeoText(row.domain);
    const asRaw = row.as ? `AS${String(row.as).replace(/^AS/i, "")}` : "";
    const asField = sanitizeGeoText(asRaw);

    const data = sanitizeGeoFields({
      country: row.countryLong || "",
      countryCode: row.countryShort || "",
      region: row.region || "",
      city: row.city || "",
      zip: row.zipCode || "",
      lat,
      lon,
      timezone: sanitizeGeoText(row.timeZone),
      isp,
      org,
      as: asField,
      district: row.district || "",
    });

    return {
      point,
      data,
    };
  } catch {
    return null;
  }
}
