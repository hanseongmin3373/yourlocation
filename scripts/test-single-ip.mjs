/**
 * Quick lookupIp test for one IP.
 * Usage: npx tsx scripts/test-single-ip.mjs 118.222.244.233
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

const ip = process.argv[2] || "118.222.244.233";
const { lookupIp } = await import(
  pathToFileURL(path.join(root, "src/lib/geo.ts")).href
);

const r = await lookupIp(ip);
console.log(
  JSON.stringify(
    {
      ip: r.ip,
      address: r.address,
      sido: r.sido,
      sigungu: r.sigungu,
      dong: r.dong,
      lat: r.lat,
      lon: r.lon,
      exactPin: r.exactPin,
      userVerified: r.userVerified,
      geoProvider: r.geoProvider,
      geoSources: r.geoSources,
      accuracyM: r.accuracyM,
    },
    null,
    2,
  ),
);
