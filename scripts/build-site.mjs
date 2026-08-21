#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

const FILES = [
  "index.html",
  "styles.css",
  "app.js",
  "portfolio-data.js",
  "images/manifest.json"
];

const DIRECTORIES = [
  "fonts",
  "images/derived",
  "images/contact"
];

function copyFile(relativePath) {
  const source = path.join(ROOT_DIR, relativePath);
  const target = path.join(DIST_DIR, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(relativePath) {
  const source = path.join(ROOT_DIR, relativePath);
  const target = path.join(DIST_DIR, relativePath);
  fs.cpSync(source, target, { recursive: true });
}

fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

FILES.forEach(copyFile);
DIRECTORIES.forEach(copyDirectory);

process.stdout.write(
  `Sitio generado en ${path.relative(ROOT_DIR, DIST_DIR)}/ sin originales de alta resolución.\n`
);
