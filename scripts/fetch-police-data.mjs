#!/usr/bin/env node
/** Probe data.go.kr / police.go.kr for police station data sources */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function main() {
  const pages = [
    "https://www.data.go.kr/data/15124966/fileData.do",
    "https://www.data.go.kr/data/15077036/fileData.do",
  ];

  for (const url of pages) {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const html = await res.text();
    const uddi = [...html.matchAll(/uddi:[a-f0-9-]+/gi)].map((m) => m[0]);
    const apis = [...html.matchAll(/https:\/\/api\.odcloud\.kr[^"'\s]+/g)].map(
      (m) => m[0],
    );
    console.log("\n===", url, "===");
    console.log("uddi:", [...new Set(uddi)].slice(0, 5));
    console.log("apis:", [...new Set(apis)].slice(0, 5));
    fs.writeFileSync(
      path.join(ROOT, "geo-data", `probe-${path.basename(url)}.html`),
      html,
    );
  }
}

main().catch(console.error);
