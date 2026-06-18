/**
 * Batch test lookupIp for multiple IPs.
 * Usage: node scripts/test-lookup-batch.mjs [ip1 ip2 ...]
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

const defaultIps = [
  "119.193.168.69", // 의정부 (mylocation 비교)
  "118.36.133.148", // 접속 IP (스크린샷)
  "1.227.161.184", // 등록 DB 검증 IP
  "211.106.118.1", // KT 서울 대표
  "175.223.45.1", // SKT
  "8.8.8.8", // US
  "114.70.0.1", // KT
];

const ips = process.argv.slice(2).length ? process.argv.slice(2) : defaultIps;

const { lookupIp } = await import(
  pathToFileURL(path.join(root, "src/lib/geo.ts")).href
);

console.log("IP\taddress\tcity\tdong\t±m\tsources");
for (const ip of ips) {
  try {
    const r = await lookupIp(ip);
    const src = (r.geoSources || []).slice(0, 4).join("+") || "-";
    console.log(
      [
        ip,
        r.address || "-",
        r.city || r.sigungu || "-",
        r.dong || "-",
        r.accuracyM != null ? Math.round(r.accuracyM) : "-",
        src,
      ].join("\t"),
    );
  } catch (e) {
    console.log(`${ip}\tERROR\t${e instanceof Error ? e.message : e}`);
  }
}
