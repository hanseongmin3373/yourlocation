/**
 * Compare yourlocation API vs ip-api vs crowd DB for multiple IPs.
 * Usage: node scripts/compare-ip-sources.mjs [ip1 ip2 ...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

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
  "118.36.133.148",
  "119.193.168.69",
  "1.227.161.184",
  "211.106.118.1",
  "175.223.45.1",
  "114.70.0.1",
  "8.8.8.8",
  "1.1.1.1",
];

const ips = process.argv.slice(2).length ? process.argv.slice(2) : defaultIps;
const prisma = new PrismaClient();

async function fetchYourlocation(ip) {
  try {
    const res = await fetch(
      `https://www.yourlocation.co.kr/api/geolocation?ip=${encodeURIComponent(ip)}`,
      { cache: "no-store" },
    );
    const json = await res.json();
    if (!json.success) return { error: json.error || "failed" };
    const d = json.data;
    return {
      address: d.address || "-",
      verified: d.userVerified ? "Y" : "N",
      exact: d.exactPin ? "Y" : "N",
      provider: d.geoProvider || "-",
      note: (d.accuracyNote || "").slice(0, 30),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchIpApi(ip) {
  try {
    const fields =
      "status,country,city,lat,lon,isp,query";
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=ko&fields=${fields}`,
    );
    const j = await res.json();
    if (j.status !== "success") return { error: j.message || "fail" };
    return {
      city: j.city || "-",
      lat: j.lat?.toFixed(4),
      lon: j.lon?.toFixed(4),
      isp: (j.isp || "-").slice(0, 20),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchCrowd(ip) {
  try {
    const exact = await prisma.ipLocationEntry.findUnique({ where: { ip } });
    if (!exact) return { status: "없음" };
    return {
      address: (exact.roadAddress || exact.address || "-").slice(0, 40),
      verified: exact.userVerified ? "Y" : "N",
      accuracy: Math.round(exact.accuracyM),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function fmt(obj) {
  if (obj.error) return `ERR:${obj.error}`;
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

console.log("=== IP 소스 대조 (yourlocation 운영 API vs ip-api vs 등록DB) ===\n");

for (const ip of ips) {
  const [yl, api, crowd] = await Promise.all([
    fetchYourlocation(ip),
    fetchIpApi(ip),
    fetchCrowd(ip),
  ]);
  console.log(`【${ip}】`);
  console.log(`  yourlocation : ${fmt(yl)}`);
  console.log(`  ip-api       : ${fmt(api)}`);
  console.log(`  crowd DB     : ${fmt(crowd)}`);
  console.log("");
}

const total = await prisma.ipLocationEntry.count();
const verified = await prisma.ipLocationEntry.count({
  where: { userVerified: true },
});
console.log(`등록 DB: 총 ${total}건, userVerified ${verified}건`);
await prisma.$disconnect();
