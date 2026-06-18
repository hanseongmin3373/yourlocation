/**
 * mylocation.co.kr IP DB → yourlocation IpLocationEntry
 *
 * Usage:
 *   node scripts/import-mylocation.mjs --file geo-data/mylocation/export.csv
 *   node scripts/import-mylocation.mjs --file geo-data/mylocation/export.json
 *   node scripts/import-mylocation.mjs --mssql   (MYLOCATION_MSSQL_URL in .env.local)
 *   node scripts/import-mylocation.mjs --probe   (discover MSSQL tables)
 *
 * Env (.env.local):
 *   MYLOCATION_MSSQL_URL=Server=host;Database=db;User Id=u;Password=p;Encrypt=true
 *   MYLOCATION_MSSQL_TABLE=dbo.IPLocation   (optional, auto-probe if omitted)
 *   MYLOCATION_MSSQL_QUERY=SELECT ...        (optional custom SQL)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvFile() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
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
}

loadEnvFile();

const prisma = new PrismaClient();
const BATCH = 500;

const COLUMN_ALIASES = {
  ip: ["ip", "userip", "user_ip", "exip", "clientip", "client_ip", "ipaddress", "ip_address"],
  lat: ["lat", "latitude", "y", "hflatitude"],
  lon: ["lon", "lng", "longitude", "x", "hflongitude"],
  accuracyM: ["accuracym", "accuracy", "acc", "hfaccuracy", "gpsaccuracy"],
  address: ["address", "addr", "fulladdress", "roadaddress", "road_address", "location"],
  appliedAddress: ["appliedaddress", "applied_address", "shortaddress"],
  dong: ["dong", "eupmyeon", "region3"],
  sido: ["sido", "region1", "province"],
  sigungu: ["sigungu", "gu", "region2", "city", "district"],
  roadAddress: ["roadaddress", "road_address"],
  isp: ["isp", "ispname", "provider"],
  createdAt: ["createdat", "created_at", "regdate", "registerdate", "insertdate"],
};

function normKey(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mapRow(raw) {
  const keys = Object.keys(raw);
  const byNorm = new Map(keys.map((k) => [normKey(k), k]));
  const pick = (names) => {
    for (const n of names) {
      const k = byNorm.get(normKey(n));
      if (k != null && raw[k] != null && raw[k] !== "") return raw[k];
    }
    return undefined;
  };

  const ip = String(pick(COLUMN_ALIASES.ip) ?? "").trim();
  const lat = Number(pick(COLUMN_ALIASES.lat));
  const lon = Number(pick(COLUMN_ALIASES.lon));
  if (!ip || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const parts = ip.replace(/[^0-9.]/g, "").split(".");
  const ipPrefix24 =
    parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}` : ip;

  const accuracyRaw = pick(COLUMN_ALIASES.accuracyM);
  const accuracyM = Math.max(
    3,
    Number.isFinite(Number(accuracyRaw)) ? Number(accuracyRaw) : 30,
  );

  const address = String(pick(COLUMN_ALIASES.address) ?? "").trim();
  const sido = pick(COLUMN_ALIASES.sido);
  const sigungu = pick(COLUMN_ALIASES.sigungu);
  const dong = pick(COLUMN_ALIASES.dong);
  const roadAddress = pick(COLUMN_ALIASES.roadAddress);
  const appliedAddress =
    String(pick(COLUMN_ALIASES.appliedAddress) ?? "").trim() ||
    [sido, sigungu, dong].filter(Boolean).join(" ") ||
    address;

  const createdRaw = pick(COLUMN_ALIASES.createdAt);
  const verifiedAt = createdRaw ? new Date(createdRaw) : undefined;

  return {
    ip,
    ipPrefix24,
    lat,
    lon,
    accuracyM,
    address: address || appliedAddress || `${lat},${lon}`,
    appliedAddress: appliedAddress || address || `${lat},${lon}`,
    dong: dong ? String(dong) : null,
    sido: sido ? String(sido) : null,
    sigungu: sigungu ? String(sigungu) : null,
    roadAddress: roadAddress ? String(roadAddress) : address || null,
    isp: pick(COLUMN_ALIASES.isp) ? String(pick(COLUMN_ALIASES.isp)) : null,
    source: "mylocation-import",
    userVerified: Boolean(address && address.length > 8),
    verifiedAt: verifiedAt && !Number.isNaN(verifiedAt.getTime()) ? verifiedAt : null,
    registerCount: 1,
  };
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    const raw = {};
    headers.forEach((h, j) => {
      raw[h] = cols[j];
    });
    rows.push(raw);
  }
  return rows;
}

async function importRows(rows, { dryRun = false } = {}) {
  let mapped = 0;
  let skipped = 0;
  const batch = [];

  for (const raw of rows) {
    const row = mapRow(raw);
    if (!row) {
      skipped++;
      continue;
    }
    mapped++;
    batch.push(row);
    if (batch.length >= BATCH) {
      if (!dryRun) await flushBatch(batch.splice(0, batch.length));
      else batch.length = 0;
      process.stdout.write(`\r  처리 ${mapped}건 (skip ${skipped})`);
    }
  }
  if (batch.length && !dryRun) await flushBatch(batch);
  console.log(`\n완료: import ${mapped}, skip ${skipped}`);
  return { mapped, skipped };
}

async function flushBatch(batch) {
  for (const row of batch) {
    await prisma.ipLocationEntry.upsert({
      where: { ip: row.ip },
      create: row,
      update: {
        lat: row.lat,
        lon: row.lon,
        accuracyM: row.accuracyM,
        address: row.address,
        appliedAddress: row.appliedAddress,
        dong: row.dong,
        sido: row.sido,
        sigungu: row.sigungu,
        roadAddress: row.roadAddress,
        isp: row.isp ?? undefined,
        source: row.source,
        userVerified: row.userVerified,
        verifiedAt: row.verifiedAt ?? undefined,
      },
    });
  }
}

async function importFile(filePath, opts) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  if (!fs.existsSync(abs)) throw new Error(`파일 없음: ${abs}`);
  const text = fs.readFileSync(abs, "utf8");
  const ext = path.extname(abs).toLowerCase();
  const rows =
    ext === ".json"
      ? JSON.parse(text)
      : parseCsv(text);
  if (!Array.isArray(rows)) throw new Error("JSON은 배열이어야 합니다.");
  console.log(`파일 ${abs}: ${rows.length}행`);
  return importRows(rows, opts);
}

async function importMssql(opts) {
  const conn = process.env.MYLOCATION_MSSQL_URL;
  if (!conn) {
    throw new Error(
      "MYLOCATION_MSSQL_URL 이 없습니다. Cafe24 MSSQL 연결 문자열을 .env.local 에 추가하세요.",
    );
  }

  let mssql;
  try {
    mssql = await import("mssql");
  } catch {
    throw new Error("npm install mssql 실행 후 다시 시도하세요.");
  }

  const pool = await mssql.default.connect(conn);
  const customQuery = process.env.MYLOCATION_MSSQL_QUERY?.trim();
  const table = process.env.MYLOCATION_MSSQL_TABLE?.trim();

  let query = customQuery;
  if (!query) {
    const tableName =
      table ||
      (await probeTable(pool)) ||
      (() => {
        throw new Error(
          "테이블을 찾지 못했습니다. MYLOCATION_MSSQL_TABLE 또는 MYLOCATION_MSSQL_QUERY 설정",
        );
      })();
    query = `SELECT TOP 1000000 * FROM ${tableName}`;
    console.log(`MSSQL 조회: ${query.slice(0, 120)}...`);
  }

  const result = await pool.request().query(query);
  await pool.close();
  console.log(`MSSQL ${result.recordset.length}행`);
  return importRows(result.recordset, opts);
}

async function probeTable(pool) {
  const candidates = [
    "IPLocation",
    "IpLocation",
    "UserIP",
    "UserLocation",
    "TB_IP",
    "tb_ip",
    "MyLocation",
    "IP_DATA",
    "LocationData",
  ];
  const r = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
  `);
  const tables = r.recordset.map(
    (x) => `${x.TABLE_SCHEMA}.${x.TABLE_NAME}`,
  );
  console.log("MSSQL 테이블:", tables.slice(0, 30).join(", "));
  for (const c of candidates) {
    const hit = tables.find((t) => t.toLowerCase().includes(c.toLowerCase()));
    if (hit) {
      console.log(`후보 테이블: ${hit}`);
      return hit;
    }
  }
  const ipCol = await pool.request().query(`
    SELECT TOP 20 TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME LIKE '%IP%' OR COLUMN_NAME LIKE '%Lat%'
    ORDER BY TABLE_NAME
  `);
  console.log("IP/Lat 컬럼 샘플:", ipCol.recordset.slice(0, 15));
  return null;
}

async function probeOnly() {
  const conn = process.env.MYLOCATION_MSSQL_URL;
  if (!conn) {
    console.log("MYLOCATION_MSSQL_URL 미설정 — Cafe24 DB 접속 정보가 필요합니다.");
    console.log("또는 CSV보내기: node scripts/import-mylocation.mjs --file export.csv");
    return;
  }
  const mssql = await import("mssql");
  const pool = await mssql.default.connect(conn);
  await probeTable(pool);
  await pool.close();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileIdx = args.indexOf("--file");
  const opts = { dryRun };

  if (args.includes("--probe")) {
    await probeOnly();
    return;
  }

  if (fileIdx >= 0 && args[fileIdx + 1]) {
    await importFile(args[fileIdx + 1], opts);
  } else if (args.includes("--mssql")) {
    await importMssql(opts);
  } else {
    console.log(`
mylocation.co.kr IP DB 가져오기

  node scripts/import-mylocation.mjs --file geo-data/mylocation/export.csv
  node scripts/import-mylocation.mjs --mssql
  node scripts/import-mylocation.mjs --probe

Cafe24 MSSQL 연결 문자열을 .env.local 에:
  MYLOCATION_MSSQL_URL=Server=...;Database=...;User Id=...;Password=...;Encrypt=true
`);
    return;
  }

  const total = await prisma.ipLocationEntry.count();
  console.log(`IpLocationEntry 총 ${total}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
