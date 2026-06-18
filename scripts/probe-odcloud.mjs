#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

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

loadEnvLocal();

const key =
  process.env.DATA_GO_KR_SERVICE_KEY ||
  process.env.PUBLIC_DATA_SERVICE_KEY ||
  process.env.ODCLOUD_SERVICE_KEY;

const endpoints = [
  {
    name: "police-stations",
    url: "https://api.odcloud.kr/api/15124966/v1/uddi:345a2432-5fee-4c49-a353-80b62496a43b",
  },
  {
    name: "police-substations",
    url: "https://api.odcloud.kr/api/15077036/v1/uddi:282a8462-6a54-473f-b8d0-93b917ba97e9",
  },
];

async function tryFetch(ep) {
  const u = new URL(ep.url);
  u.searchParams.set("page", "1");
  u.searchParams.set("perPage", "5");
  if (key) u.searchParams.set("serviceKey", key);

  const res = await fetch(u, { headers: { Accept: "application/json" } });
  const text = await res.text();
  console.log(`\n${ep.name}: ${res.status}`);
  console.log(text.slice(0, 800));
}

for (const ep of endpoints) {
  await tryFetch(ep);
}
