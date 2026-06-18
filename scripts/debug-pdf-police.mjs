#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PDF = path.join(ROOT, "geo-data", "police", "police-stations-official.pdf");

const buf = fs.readFileSync(PDF);
const parser = new PDFParse({ data: buf });
const result = await parser.getText();
const text = result.text;
console.log("pages", result.total);
console.log("text length", text.length);
console.log("--- sample ---");
console.log(text.slice(0, 5000));
fs.writeFileSync(path.join(ROOT, "geo-data", "police", "pdf-extract.txt"), text);
await parser.destroy();
