#!/usr/bin/env node
/**
 * IP2Location DB 자동 다운로드·설치
 *
 * 1) .env.local 의 IP2LOCATION_DOWNLOAD_TOKEN 으로 LITE BIN 다운로드
 * 2) Downloads 폴더의 IP2LOCATION*.ZIP 압축 해제 후 geo-data/ 에 BIN 복사
 *
 * 사용: npm run geo:update-db
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GEO_DIR = path.join(ROOT, "geo-data");
const DOWNLOADS = path.join(process.env.USERPROFILE || process.env.HOME || "", "Downloads");

/** 좌표 포함 최소 DB5. IPv6 탭은 코드명이 다를 수 있어 순서대로 시도 */
const LITE_DOWNLOAD_CODES = [
  "DB11LITEBINIPV6",
  "DB9LITEBINIPV6",
  "DB5LITEBINIPV6",
  "DB11LITEBIN",
  "DB9LITEBIN",
  "DB5LITEBIN",
];

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

function scoreBinName(name) {
  let score = 0;
  if (/ipv6/i.test(name)) score += 200;
  const m = name.match(/DB(\d+)/i);
  if (m) score += Number(m[1]) * 10;
  if (/LITE/i.test(name)) score += 1;
  return score;
}

function ensureGeoDir() {
  fs.mkdirSync(GEO_DIR, { recursive: true });
}

function findBinFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findBinFiles(full));
    } else if (/\.bin$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function pickBestBin(files) {
  if (files.length === 0) return null;
  return [...files].sort((a, b) => scoreBinName(b) - scoreBinName(a))[0];
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const isWin = process.platform === "win32";
  if (isWin) {
    const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
    const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error(`압축 해제 실패: ${zipPath}`);
    return;
  }
  const r = spawnSync("tar", ["-xf", zipPath, "-C", destDir], {
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error(`압축 해제 실패: ${zipPath}`);
}

function installBin(srcPath) {
  const base = path.basename(srcPath);
  const dest = path.join(GEO_DIR, base);
  fs.copyFileSync(srcPath, dest);
  console.log(`✓ 설치: geo-data/${base} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`);
  return dest;
}

async function downloadWithToken(token, fileCode) {
  const url = `https://www.ip2location.com/download?token=${encodeURIComponent(token)}&file=${encodeURIComponent(fileCode)}`;
  console.log(`다운로드 시도: ${fileCode} ...`);

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    console.warn(`  → HTTP ${res.status} (${fileCode})`);
    return null;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) {
    console.warn(`  → 파일이 너무 작음 (${buf.length} bytes)`);
    return null;
  }

  const head = buf.subarray(0, 4);
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const tmpDir = path.join(GEO_DIR, ".tmp-download");
  fs.mkdirSync(tmpDir, { recursive: true });

  if (isZip) {
    const zipPath = path.join(tmpDir, `${fileCode}.zip`);
    fs.writeFileSync(zipPath, buf);
    const extractDir = path.join(tmpDir, fileCode);
    extractZip(zipPath, extractDir);
    const bin = pickBestBin(findBinFiles(extractDir));
    if (!bin) {
      console.warn(`  → ZIP 안에 .BIN 없음 (${fileCode})`);
      return null;
    }
    return installBin(bin);
  }

  if (/\.bin$/i.test(fileCode) || buf.length > 1_000_000) {
    const binPath = path.join(GEO_DIR, `IP2LOCATION-${fileCode}.BIN`);
    fs.writeFileSync(binPath, buf);
    console.log(`✓ 설치: geo-data/${path.basename(binPath)}`);
    return binPath;
  }

  console.warn(`  → 알 수 없는 형식 (${fileCode})`);
  return null;
}

function processLocalZips() {
  const sources = [DOWNLOADS, GEO_DIR];
  const zips = new Set();

  for (const dir of sources) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/^IP2LOCATION.*\.ZIP$/i.test(name)) continue;
      if (/MULTILINGUAL|FLAGS|INFORMATION|GEONAME|ISO3166|OLSON|WEATHER|WORLD|ZIPCODE|IAB|CONTINENT/i.test(name)) {
        continue;
      }
      if (/\.(BIN|CSV|CIDR|MMDB)\.ZIP$/i.test(name)) {
        zips.add(path.join(dir, name));
      }
    }
  }

  let installed = null;
  for (const zipPath of zips) {
    console.log(`로컬 ZIP 처리: ${path.basename(zipPath)}`);
    const tmpDir = path.join(GEO_DIR, ".tmp-local", path.basename(zipPath, ".ZIP"));
    try {
      extractZip(zipPath, tmpDir);
      const bin = pickBestBin(findBinFiles(tmpDir));
      if (bin) installed = installBin(bin);
    } catch (e) {
      console.warn(`  → 실패:`, e instanceof Error ? e.message : e);
    }
  }
  return installed;
}

async function testLookup(binPath) {
  try {
    const { IP2Location } = await import("ip2location-nodejs");
    const db = new IP2Location();
    db.open(binPath);
    const testIp = "114.206.216.6";
    const row = db.getAll(testIp);
    db.close();
    console.log(`\n테스트 조회 ${testIp}:`);
    console.log(`  ${row.city}, ${row.region}, ${row.countryShort}`);
    console.log(`  ${row.latitude}, ${row.longitude}`);
  } catch (e) {
    console.warn("테스트 조회 실패:", e instanceof Error ? e.message : e);
  }
}

async function main() {
  loadEnvLocal();
  ensureGeoDir();

  console.log("=== IP2Location DB 자동 설치 ===\n");

  let installed = processLocalZips();

  const token = process.env.IP2LOCATION_DOWNLOAD_TOKEN?.trim();
  if (token) {
    console.log("\n다운로드 토큰으로 LITE BIN 받는 중...\n");
    for (const code of LITE_DOWNLOAD_CODES) {
      const result = await downloadWithToken(token, code);
      if (result) {
        installed = result;
        break;
      }
    }
  } else {
    console.log(
      "\nℹ IP2LOCATION_DOWNLOAD_TOKEN 이 없어 온라인 다운로드를 건너뜁니다.",
    );
    console.log(
      "  lite.ip2location.com 로그인 → database-download 페이지의 Download Token 을",
    );
    console.log("  .env.local 에 IP2LOCATION_DOWNLOAD_TOKEN=... 로 넣고 다시 실행하세요.\n");
  }

  const bins = findBinFiles(GEO_DIR).filter(
    (f) => !f.includes(".tmp"),
  );
  const best = installed || pickBestBin(bins);

  if (!best) {
    console.log("\n❌ geo-data/ 에 사용 가능한 .BIN 이 없습니다.");
    console.log("   스크린샷의 IP2LOCATION-LITE-DB5.BIN.ZIP (또는 IPv6 탭 DB5) 을");
    console.log("   Downloads 에 두고 다시 실행하거나, 토큰을 설정하세요.");
    process.exit(1);
  }

  console.log(`\n사용 DB: ${path.basename(best)}`);
  await testLookup(best);

  console.log("\n완료. 서버를 재시작하면 IP 조회에 ip2location 이 반영됩니다.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
