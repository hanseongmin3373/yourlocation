#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";
import {
  matchJurisdictionStation,
  parsePolicePdfText,
} from "./parse-police-pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const pdfPath =
  process.argv[2] ||
  path.join(ROOT, "geo-data", "police", "police-stations-official.pdf");

const buf = fs.readFileSync(pdfPath);
const parser = new PDFParse({ data: buf });
const result = await parser.getText();
await parser.destroy();

const stations = parsePolicePdfText(result.text);
console.log("parsed stations:", stations.length);
console.log("sample:", stations.slice(0, 3));
const gangnam = stations.find((s) => s.name.includes("강남"));
console.log("강남:", gangnam);

const match = matchJurisdictionStation(stations, {
  sigungu: "강남구",
  dong: "논현동",
});
console.log("논현동 관할:", match?.name, match?.address);
