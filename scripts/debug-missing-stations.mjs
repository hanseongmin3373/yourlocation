#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";
import { normalizePdfText, parsePolicePdfText } from "./parse-police-pdf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PDF = path.join(ROOT, "geo-data", "police", "police-stations-official.pdf");

function compact(s) {
  return s.replace(/\s/g, "");
}

const buf = fs.readFileSync(PDF);
const parser = new PDFParse({ data: buf });
const result = await parser.getText();
await parser.destroy();

const lines = normalizePdfText(result.text).split("\n");
const parsed = parsePolicePdfText(result.text);
const parsedNames = new Set(parsed.map((s) => s.name));

// Find all station name candidates: line followed by "경찰서" marker
const expected = [];
for (let i = 0; i < lines.length - 1; i++) {
  const c = compact(lines[i]);
  const next = compact(lines[i + 1] ?? "");
  if (next === "경찰서" && /^[가-힣0-9]{2,20}$/.test(c)) {
    expected.push(`${c}경찰서`);
  }
}

const expectedSet = new Set(expected);
const missing = expected.filter((n) => !parsedNames.has(n));
const extra = [...parsedNames].filter((n) => !expectedSet.has(n));

console.log("PDF station markers:", expected.length);
console.log("Parsed stations:", parsed.length);
console.log("\nMissing from parser:", missing.length);
for (const n of missing) console.log("  -", n);

console.log("\nExtra in parser (not in markers):", extra.length);
for (const n of extra) console.log("  +", n);

// Stations with empty/incomplete data
const incomplete = parsed.filter(
  (s) =>
    !s.jurisdictionRaw ||
    s.jurisdictionRaw.length < 5 ||
    !s.address ||
    s.address === s.sigungu,
);
console.log("\nIncomplete parsed stations:", incomplete.length);
for (const s of incomplete.slice(0, 30)) {
  console.log(`  ${s.name}: addr="${s.address}" jur="${(s.jurisdictionRaw || "").slice(0, 60)}..."`);
}

// Duplicate expected names
const dupes = expected.filter((n, i) => expected.indexOf(n) !== i);
if (dupes.length) {
  console.log("\nDuplicate markers:", [...new Set(dupes)]);
}
