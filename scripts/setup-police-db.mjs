#!/usr/bin/env node
/**
 * 경찰관서 DB 구축
 * 1) [별표2] PDF — 경찰서 공식 명칭·주소·관할구역 (우선)
 * 2) 공공데이터 CSV — 지구대·파출소 (최근접 보조)
 *
 * npm run police:update-db
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";
import { parsePolicePdfText, geocodeAddressCandidates } from "./parse-police-pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "geo-data", "police");
const OUT_JSON = path.join(OUT_DIR, "stations.json");
const PDF_DEFAULT = path.join(OUT_DIR, "police-stations-official.pdf");

const PAGES = {
  substations: "https://www.data.go.kr/data/15077036/fileData.do",
};

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function decodeBuffer(buf) {
  for (const enc of ["utf-8", "euc-kr", "cp949"]) {
    try {
      const text = new TextDecoder(enc).decode(buf);
      if (/주소|경찰|시도/.test(text)) return text;
    } catch {
      /* next */
    }
  }
  return buf.toString("utf8");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((c) => c.length)) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field.trim());
    if (row.some((c) => c.length)) rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? "").trim();
    });
    return obj;
  });
}

async function getAtchFileId(pageUrl) {
  const html = await (
    await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" } })
  ).text();
  const m = html.match(/fileDownload\.do\?atchFileId=([^&"']+)/);
  return m?.[1] ?? null;
}

async function downloadSubstationCsv() {
  const atchFileId = await getAtchFileId(PAGES.substations);
  if (!atchFileId) return null;
  const dl = `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=${atchFileId}&fileDetailSn=1&insertDataPrcus=N`;
  const buf = Buffer.from(
    await (await fetch(dl, { headers: { "User-Agent": "Mozilla/5.0" } })).arrayBuffer(),
  );
  return decodeBuffer(buf);
}

function normalizeSubstationRow(row) {
  const office = row["시도청"] || "";
  const parent = row["경찰서"] || "";
  const unit = row["관서명"] || "";
  const kind = row["구분"] || "";
  const address = row["주소"]?.replace(/\s+/g, " ").trim() || "";
  const phone = row["전화번호"] || "";
  if (!unit || !address) return null;

  const name =
    kind === "경찰서" || unit === parent
      ? `${parent}경찰서`
      : `${parent}${unit}${kind || ""}`.replace(/\s/g, "");

  let type = "substation";
  if (/지구대/.test(kind) || /지구대/.test(name)) type = "district";
  if (/파출소|치안센터/.test(kind) || /파출소|치안센터/.test(name)) {
    type = "substation";
  }

  return {
    name,
    address,
    phone,
    office,
    parentStation: parent ? `${parent}경찰서` : undefined,
    type,
    source: "police-go-kr-csv",
  };
}

async function parsePdfStations(pdfPath) {
  if (!fs.existsSync(pdfPath)) {
    console.warn("PDF 없음:", pdfPath);
    return [];
  }
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  const stations = parsePolicePdfText(result.text);
  console.log(`[PDF] 경찰서 ${stations.length}건`);
  return stations;
}

function dedupe(stations) {
  const map = new Map();
  for (const s of stations) {
    const key = `${s.name}|${s.address}`;
    if (!map.has(key)) map.set(key, s);
  }
  return [...map.values()];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeAddress(address, key) {
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}&size=1`,
    { headers: { Authorization: `KakaoAK ${key}` } },
  );
  if (!res.ok) return null;
  const json = await res.json();
  const doc = json.documents?.[0];
  if (!doc) return null;
  return { lat: Number(doc.y), lon: Number(doc.x) };
}

async function geocodeAll(stations, key) {
  const out = [];
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    if (s.lat != null && s.lon != null) {
      out.push(s);
      ok++;
      continue;
    }
    const queries =
      s.type === "station" ? geocodeAddressCandidates(s) : [s.address];
    let coords = null;
    for (const q of queries) {
      coords = await geocodeAddress(q, key);
      if (coords) break;
    }
    if (coords) {
      out.push({ ...s, lat: coords.lat, lon: coords.lon });
      ok++;
    } else {
      out.push(s);
      fail++;
      if (s.type === "station") {
        console.warn(`  지오코딩 실패: ${s.name} (${s.address})`);
      }
    }
    if ((i + 1) % 100 === 0) {
      console.log(`  지오코딩 ${i + 1}/${stations.length} (${ok} ok, ${fail} fail)`);
      await sleep(150);
    } else {
      await sleep(35);
    }
  }
  console.log(`  지오코딩 완료: ${ok} 성공, ${fail} 실패 (좌표 없는 관서도 DB에 유지)`);
  return out;
}

async function main() {
  loadEnvLocal();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pdfPath = process.argv[2] || PDF_DEFAULT;
  const pdfStations = await parsePdfStations(pdfPath);

  let substations = [];
  const csv = await downloadSubstationCsv();
  if (csv) {
    const parsed = rowsToObjects(parseCsv(csv));
    substations = parsed.map(normalizeSubstationRow).filter(Boolean);
    console.log(`[CSV] 지구대·파출소 ${substations.length}건`);
  }

  let merged = dedupe([...pdfStations, ...substations]);
  console.log(`합계 ${merged.length}건 (중복 제거)`);

  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  if (!kakaoKey) {
    console.error("KAKAO_REST_API_KEY 필요");
    process.exit(1);
  }

  const existing = fs.existsSync(OUT_JSON)
    ? JSON.parse(fs.readFileSync(OUT_JSON, "utf8"))
    : null;
  const existingMap = new Map(
    (existing?.stations ?? []).map((s) => [`${s.name}|${s.address}`, s]),
  );

  merged = merged.map((s) => {
    const hit = existingMap.get(`${s.name}|${s.address}`);
    if (hit?.lat != null && hit?.lon != null) {
      return { ...s, lat: hit.lat, lon: hit.lon };
    }
    return s;
  });

  const needGeo = merged.filter((s) => s.lat == null || s.lon == null);
  if (needGeo.length) {
    console.log(`\n지오코딩 ${needGeo.length}건...`);
    merged = await geocodeAll(merged, kakaoKey);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    source:
      "경찰청 직제 시행규칙 [별표2] PDF + 공공데이터 지구대·파출소 (police.go.kr bbsCode=1038)",
    pdfPath: path.basename(pdfPath),
    count: merged.length,
    stationCount: merged.filter((s) => s.type === "station").length,
    stations: merged,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(payload));
  console.log(`\n✓ ${OUT_JSON}`);
  console.log(`  경찰서 ${payload.stationCount} + 관서 ${payload.count - payload.stationCount} = ${payload.count}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
