/**
 * Test crowd IP lookup (no TS import — uses Prisma + fetch to local API).
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

const ips = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "118.36.133.148",
      "118.36.133.200",
      "119.193.168.69",
      "211.106.118.1",
      "175.223.45.1",
    ];

const prisma = new PrismaClient();

async function crowdInfo(ip) {
  const exact = await prisma.ipLocationEntry.findUnique({ where: { ip } });
  if (exact) {
    return `exact:${exact.sido} ${exact.sigungu} ${exact.dong || ""}`.trim();
  }
  const parts = ip.split(".");
  const prefix = parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}` : null;
  if (!prefix) return "no-prefix";
  const cluster = await prisma.ipLocationEntry.count({
    where: { ipPrefix24: prefix, source: "mylocation-import" },
  });
  const prefix16 = `${parts[0]}.${parts[1]}`;
  const ispCluster = await prisma.ipLocationEntry.count({
    where: {
      ip: { startsWith: `${prefix16}.` },
      source: "mylocation-import",
    },
  });
  return `prefix24:${cluster} isp/16:${ispCluster}`;
}

console.log("IP\tcrowd-db\taddress\tsigungu\tdong\t±m\tprovider");
for (const ip of ips) {
  const crowd = await crowdInfo(ip);
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const res = await fetch(
      `${base}/api/geolocation?ip=${encodeURIComponent(ip)}`,
      { cache: "no-store" },
    );
    const json = await res.json();
    if (!json.success) {
      console.log(`${ip}\t${crowd}\tERROR\t${json.error || "fail"}`);
      continue;
    }
    const d = json.data;
    console.log(
      [
        ip,
        crowd,
        d.address || "-",
        d.sigungu || d.city || "-",
        d.dong || "-",
        d.accuracyM != null ? Math.round(d.accuracyM) : "-",
        d.geoProvider || "-",
      ].join("\t"),
    );
  } catch (e) {
    console.log(`${ip}\t${crowd}\tFETCH_ERR\t${e.message}`);
  }
}

const total = await prisma.ipLocationEntry.count();
const imported = await prisma.ipLocationEntry.count({
  where: { source: "mylocation-import" },
});
console.log(`\nDB: ${total} total, ${imported} mylocation-import`);
await prisma.$disconnect();
