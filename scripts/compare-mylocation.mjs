/**
 * Compare mylocation.co.kr vs yourlocation for multiple IPs.
 * Usage: npx tsx scripts/compare-mylocation.mjs [ip1 ip2 ...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchMylocationIp } from "./mylocation-search.mjs";

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
  "118.222.244.233", // 부산 금정
  "118.36.133.148", // 동작 (등록)
  "119.193.168.69", // 의정부
  "175.223.45.1", // SKT
  "211.106.118.1", // KT 서울
  "114.70.0.1", // 울산
  "1.227.161.184", // 강남 등록
  "59.16.45.88", // 인천
  "221.147.38.10", // 광주
  "210.89.160.5", // 성남
  "125.131.24.55", // 대전
  "112.217.48.12", // 수원
  "203.248.252.2", // KT 대표
  "115.68.208.12", // 카페24
  "106.101.1.1", // 제주
];

const ips = process.argv.slice(2).length ? process.argv.slice(2) : defaultIps;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchMylocation(ip) {
  try {
    const r = await fetchMylocationIp(ip);
    return { address: r.address, ok: r.ok };
  } catch (e) {
    return { address: null, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchYourlocationLocal(ip, lookupIp) {
  try {
    const r = await lookupIp(ip);
    return {
      address: r.address || "-",
      provider: r.geoProvider || "-",
      dong: r.dong || "",
      sigungu: r.sigungu || r.city || "",
      verified: r.userVerified ? "Y" : "N",
      accuracyM: r.accuracyM != null ? Math.round(r.accuracyM) : "-",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchYourlocationProd(ip) {
  try {
    const res = await fetch(
      `https://www.yourlocation.co.kr/api/geolocation?ip=${encodeURIComponent(ip)}`,
      { cache: "no-store" },
    );
    const j = await res.json();
    if (!j.success) return { error: j.error || "fail" };
    const d = j.data;
    return {
      address: d.address || "-",
      provider: d.geoProvider || "-",
      dong: d.dong || "",
      sigungu: d.sigungu || d.city || "",
      verified: d.userVerified ? "Y" : "N",
      accuracyM: d.accuracyM != null ? Math.round(d.accuracyM) : "-",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function norm(s) {
  return (s || "")
    .replace(/\s+/g, "")
    .replace(/특별시|광역시|특별자치시|특별자치도/g, "")
    .toLowerCase();
}

function matchLevel(a, b) {
  if (!a || !b) return "—";
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return "일치";
  if (na.includes(nb) || nb.includes(na)) return "유사";
  const aGu = a.match(/([가-힣]+[구군시])/);
  const bGu = b.match(/([가-힣]+[구군시])/);
  if (aGu && bGu && norm(aGu[1]) === norm(bGu[1])) return "구군일치";
  const aDo = a.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/);
  const bDo = b.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/);
  if (aDo && bDo && aDo[1] === bDo[1]) return "광역만";
  return "불일치";
}

const { lookupIp } = await import(
  pathToFileURL(path.join(root, "src/lib/geo.ts")).href
);

console.log("=== mylocation vs yourlocation IP 대조 ===\n");
console.log(
  ["IP", "mylocation", "yourlocation(로컬)", "yourlocation(운영)", "판정"].join("\t"),
);

const summary = { match: 0, similar: 0, gu: 0, region: 0, miss: 0, mylocEmpty: 0, mylocFail: 0 };

for (const ip of ips) {
  const my = await fetchMylocation(ip);
  if (ips.indexOf(ip) < ips.length - 1) await sleep(2000);
  const [local, prod] = await Promise.all([
    fetchYourlocationLocal(ip, lookupIp),
    fetchYourlocationProd(ip),
  ]);

  const ylAddr = local.error ? `ERR:${local.error}` : local.address;
  const prodAddr = prod.error ? `ERR:${prod.error}` : prod.address;
  const myAddr = my.address || (my.hint ? `(없음: ${my.hint})` : "(조회실패)");
  const ylCompare = prod.error
    ? local.error
      ? null
      : local.address
    : prod.address;

  const judge =
    my.address && ylCompare ? matchLevel(my.address, ylCompare) : "—";
  if (!my.address) {
    if (my.hint?.includes("empty") || my.hint?.includes("검색")) summary.mylocEmpty++;
    else summary.mylocFail++;
  } else if (judge === "일치") summary.match++;
  else if (judge === "유사") summary.similar++;
  else if (judge === "구군일치") summary.gu++;
  else if (judge === "광역만") summary.region++;
  else summary.miss++;

  console.log(
    [
      ip,
      myAddr,
      ylAddr,
      prodAddr,
      judge,
    ].join("\t"),
  );

  if (!local.error) {
    console.log(
      `  └ local: ${local.provider} verified=${local.verified} ±${local.accuracyM}m`,
    );
  }
  if (!prod.error) {
    console.log(
      `  └ prod:  ${prod.provider} verified=${prod.verified} ±${prod.accuracyM}m`,
    );
  }
}

console.log("\n--- 요약 ---");
console.log(`테스트 IP: ${ips.length}개`);
console.log(`mylocation 결과 없음: ${summary.mylocEmpty}개, 조회 실패: ${summary.mylocFail}개`);
console.log(`일치/유사/구군일치/광역만/불일치: ${summary.match}/${summary.similar}/${summary.gu}/${summary.region}/${summary.miss}`);
