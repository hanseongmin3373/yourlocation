/**
 * ipinfo Plus Lookup API — 32속성 파싱·신뢰도 검증
 * Usage: npx tsx scripts/test-ipinfo-plus.mjs [ip]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const ip = process.argv[2] || "175.223.45.1";
const { lookupFromIpinfo } = await import(
  pathToFileURL(path.join(root, "src/lib/geo-ipinfo.ts")).href
);

const result = await lookupFromIpinfo(ip);
if (!result) {
  console.error("lookup failed — check IPINFO_TOKEN");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ip,
      isPlus: result.meta.isPlus,
      geoTrustScore: result.meta.geoTrustScore,
      precisionDelta: result.meta.precisionDelta,
      trustGeoCity: result.meta.trustGeoCity,
      allowRoadHint: result.meta.allowRoadHint,
      networkFlags: result.meta.networkFlags,
      accuracyNotes: result.meta.accuracyNotes,
      meta: result.meta,
      data: result.data,
    },
    null,
    2,
  ),
);
