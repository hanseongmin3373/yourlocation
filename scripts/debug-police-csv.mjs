#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function fetchCsv(pageUrl, outName) {
  const res = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const matches = [
    ...html.matchAll(
      /fileDownload\.do\?atchFileId=([^&"']+)&fileDetailSn=(\d+)/g,
    ),
  ];
  console.log(pageUrl, "downloads:", matches.length);
  for (const m of matches.slice(0, 5)) {
    const dl = `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=${m[1]}&fileDetailSn=${m[2]}&insertDataPrcus=N`;
    const csvRes = await fetch(dl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const buf = Buffer.from(await csvRes.arrayBuffer());
    const head = buf.slice(0, 20).toString("hex");
    const text = buf.toString("utf8");
    console.log(" ", m[2], "size", buf.length, "head", head);
    if (text.includes(",") && !head.startsWith("ffd8")) {
      fs.writeFileSync(path.join(ROOT, "geo-data", outName), text);
      console.log("  saved", outName);
      console.log("  first line:", text.split("\n")[0]);
      console.log("  row2:", text.split("\n")[1]?.slice(0, 120));
      return text;
    }
  }
  return null;
}

await fetchCsv(
  "https://www.data.go.kr/data/15124966/fileData.do",
  "police-stations.csv",
);
await fetchCsv(
  "https://www.data.go.kr/data/15077036/fileData.do",
  "police-substations.csv",
);
