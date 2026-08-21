#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(ROOT_DIR, "images");
const DERIVED_DIR = path.join(IMAGES_DIR, "derived");

const MAIN_WIDTHS = [320, 480, 960, 1600];
const THUMB_WIDTH = 640;
const JPEG_QUALITY = Number(process.env.JPEG_QUALITY || 68);
const JPEG_QUALITY_MOBILE = Number(process.env.JPEG_QUALITY_MOBILE || 56);
const JPEG_QUALITY_THUMB = Number(process.env.JPEG_QUALITY_THUMB || 60);
const IMAGE_EXT_REGEX = /\.(avif|jpe?g|png|webp)$/i;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function ensureSipsAvailable() {
  const probe = spawnSync("sips", ["--help"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) {
    fail("Error: se necesita 'sips' para generar variantes.");
  }
}

function toPosixRelative(absPath) {
  return path.relative(ROOT_DIR, absPath).split(path.sep).join("/");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function shouldSkipEntry(name) {
  return name.startsWith(".") || name === "contact" || name === "derived";
}

function listProjectFolders() {
  return fs
    .readdirSync(IMAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !shouldSkipEntry(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function listImageFiles(folderPath) {
  return fs
    .readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_REGEX.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function readImageSize(absPath) {
  const out = spawnSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", absPath], {
    encoding: "utf8"
  });

  if (out.status !== 0) {
    throw new Error(`No se pudo leer dimensiones: ${toPosixRelative(absPath)}`);
  }

  const widthMatch = out.stdout.match(/pixelWidth:\s*(\d+)/);
  const heightMatch = out.stdout.match(/pixelHeight:\s*(\d+)/);

  if (!widthMatch || !heightMatch) {
    throw new Error(`Respuesta invalida de sips para: ${toPosixRelative(absPath)}`);
  }

  return {
    width: Number(widthMatch[1]),
    height: Number(heightMatch[1])
  };
}

function buildDerivedName(fileName, maxDimension) {
  const ext = path.extname(fileName);
  const stem = ext ? fileName.slice(0, -ext.length) : fileName;
  return `${stem}-${maxDimension}.jpg`;
}

function shouldRegenerate(sourcePath, targetPath) {
  if (!fs.existsSync(targetPath)) {
    return true;
  }
  const sourceMtime = fs.statSync(sourcePath).mtimeMs;
  const targetMtime = fs.statSync(targetPath).mtimeMs;
  return sourceMtime > targetMtime;
}

function getVariantQuality(maxDimension, variant) {
  if (variant === "thumb") {
    return JPEG_QUALITY_THUMB;
  }
  if (maxDimension <= 480) {
    return JPEG_QUALITY_MOBILE;
  }
  return JPEG_QUALITY;
}

function generateJpegVariant(sourcePath, targetPath, maxDimension, variant = "main") {
  if (!shouldRegenerate(sourcePath, targetPath)) {
    return true;
  }

  ensureDir(path.dirname(targetPath));
  const quality = getVariantQuality(maxDimension, variant);

  const out = spawnSync(
    "sips",
    [
      "--resampleHeightWidthMax",
      String(maxDimension),
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      String(quality),
      sourcePath,
      "--out",
      targetPath
    ],
    { encoding: "utf8" }
  );

  if (out.status !== 0) {
    process.stderr.write(
      `Aviso: no se pudo generar variante para ${toPosixRelative(sourcePath)} (${maxDimension}px), se usa original.\n`
    );
    return false;
  }

  return true;
}

function buildPhotoEntry(folder, fileName) {
  const sourcePath = path.join(IMAGES_DIR, folder, fileName);
  const { width, height } = readImageSize(sourcePath);
  const maxDimension = Math.max(width, height);

  const mainSources = {};
  for (const requestedMaxDimension of MAIN_WIDTHS) {
    const maxOutputDimension = Math.min(requestedMaxDimension, maxDimension);
    const outputWidth = Math.min(
      width,
      Math.round((width * maxOutputDimension) / maxDimension)
    );

    if (mainSources[outputWidth]) {
      continue;
    }

    const targetPath = path.join(
      DERIVED_DIR,
      "main",
      folder,
      buildDerivedName(fileName, maxOutputDimension)
    );
    const generated = generateJpegVariant(
      sourcePath,
      targetPath,
      maxOutputDimension,
      "main"
    );
    const sourceWidth = generated ? outputWidth : width;
    mainSources[sourceWidth] = generated
      ? toPosixRelative(targetPath)
      : toPosixRelative(sourcePath);
  }

  let thumbSource = toPosixRelative(sourcePath);
  if (maxDimension > THUMB_WIDTH) {
    const thumbPath = path.join(DERIVED_DIR, "thumb", folder, buildDerivedName(fileName, THUMB_WIDTH));
    const generated = generateJpegVariant(sourcePath, thumbPath, THUMB_WIDTH, "thumb");
    thumbSource = generated ? toPosixRelative(thumbPath) : toPosixRelative(sourcePath);
  }

  return {
    file: fileName,
    width,
    height,
    sources: {
      main: mainSources,
      thumb: thumbSource
    }
  };
}

function validateManifest(manifest) {
  for (const [folder, photos] of Object.entries(manifest.projects)) {
    for (const photo of photos) {
      const sources = [...Object.values(photo.sources.main), photo.sources.thumb];
      if (!Object.keys(photo.sources.main).length || sources.some((source) => !source)) {
        fail(`Manifest incompleto: ${folder}/${photo.file}`);
      }
      for (const source of sources) {
        if (!fs.existsSync(path.join(ROOT_DIR, source))) {
          fail(`Fuente inexistente en manifest: ${source}`);
        }
      }
    }
  }
}

function main() {
  ensureSipsAvailable();
  ensureDir(DERIVED_DIR);

  const manifest = {
    generatedAt: new Date().toISOString(),
    variants: {
      main: MAIN_WIDTHS,
      thumb: THUMB_WIDTH
    },
    projects: {}
  };

  const folders = listProjectFolders();
  for (const folder of folders) {
    const folderPath = path.join(IMAGES_DIR, folder);
    const files = listImageFiles(folderPath);
    manifest.projects[folder] = files.map((fileName) => buildPhotoEntry(folder, fileName));
  }

  validateManifest(manifest);

  const outputPath = path.join(IMAGES_DIR, "manifest.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(
    `Manifest generado: ${toPosixRelative(outputPath)} | proyectos: ${folders.length}\n`
  );
}

main();
