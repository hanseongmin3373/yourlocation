#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function saveHtml(id) {
  const url = `https://www.data.go.kr/data/${id}/fileData.do`;
  const html = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
  fs.writeFileSync(path.join(ROOT, "geo-data", `page-${id}.html`), html);
  const downloads = [...html.matchAll(/fileDownload\.do\?atchFileId=([^&"']+)&fileDetailSn=(\d+)/g)];
  console.log(id, downloads);
}

await saveHtml("15124966");
await saveHtml("15077036");

for (let sn = 1; sn <= 5; sn++) {
  const dl = `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003600631&fileDetailSn=${sn}&insertDataPrcus=N`;
  const buf = Buffer.from(await (await fetch(dl, { headers: { "User-Agent": "Mozilla/5.0" } })).arrayBuffer());
  console.log("15124966 sn", sn, "size", buf.length, "head", buf.slice(0,4).toString("hex"));
}
