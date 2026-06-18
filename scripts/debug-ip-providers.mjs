/**
 * Debug all geo providers for an IP.
 * Usage: node scripts/debug-ip-providers.mjs [ip]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const ip = process.argv[2] || "119.193.168.69";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env.local
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function queryIpApi() {
  const fields =
    "status,message,country,countryCode,regionName,city,district,zip,lat,lon,timezone,isp,org,as,query";
  const res = await fetch(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=ko&fields=${fields}`,
  );
  return res.json();
}

async function queryIpWho() {
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?language=ko`);
  return res.json();
}

async function queryGeojs() {
  const res = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`);
  return res.json();
}

async function queryKisa() {
  const res = await fetch(
    `https://whois.kisa.or.kr/openapi/whois.jsp?query=${encodeURIComponent(ip)}&answer=json`,
  );
  return res.json();
}

async function queryIp2Location() {
  const dataDir = path.join(root, "geo-data");
  if (!fs.existsSync(dataDir)) return { error: "no geo-data dir" };
  const bins = fs.readdirSync(dataDir).filter((n) => /\.bin$/i.test(n));
  if (bins.length === 0) return { error: "no .bin files" };
  const { IP2Location } = await import("ip2location-nodejs");
  const db = new IP2Location();
  db.open(path.join(dataDir, bins[0]));
  const row = db.getAll(ip);
  db.close();
  return row;
}

async function queryCrowd() {
  const prisma = new PrismaClient();
  try {
    const exact = await prisma.ipLocationEntry.findUnique({ where: { ip } });
    const prefix = ip.split(".").slice(0, 3).join(".");
    const siblings = await prisma.ipLocationEntry.findMany({
      where: { ip: { startsWith: prefix + "." } },
      take: 5,
    });
    return { exact, siblings };
  } finally {
    await prisma.$disconnect();
  }
}

const results = {};
try { results.ipApi = await queryIpApi(); } catch (e) { results.ipApi = { error: String(e) }; }
try { results.ipWho = await queryIpWho(); } catch (e) { results.ipWho = { error: String(e) }; }
try { results.geojs = await queryGeojs(); } catch (e) { results.geojs = { error: String(e) }; }
try { results.kisa = await queryKisa(); } catch (e) { results.kisa = { error: String(e) }; }
try { results.ip2location = await queryIp2Location(); } catch (e) { results.ip2location = { error: String(e) }; }
try { results.crowd = await queryCrowd(); } catch (e) { results.crowd = { error: String(e) }; }

console.log(JSON.stringify(results, null, 2));
