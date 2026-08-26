import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateMarkup } from "./markup-check.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const pageNames = ["index.html"];
const requiredFiles = [
  "content/services.json",
  "css/base.css",
  "css/components.css",
  "css/motion.css",
  "css/pages/home.css",
  "css/responsive.css",
  "css/tokens.css",
  "js/home/app.js",
  "js/shared/contact.js",
  "js/shared/site.js",
];
const serviceImages = [
  "qr-memory-album.webp",
  "polaroid-memory.webp",
  "video-booth.webp",
  "guest-interviews.webp",
  "live-stream.webp",
  "audio-phone.webp",
];
const heroImages = ["hero-still-life-v2.png", "hero-still-life-mobile-v3.png"];
const issues = [];

async function walk(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(target, extensions);
      return extensions.has(path.extname(entry.name).toLowerCase()) ? [target] : [];
    }),
  );
  return nested.flat();
}

async function fileInfo(target) {
  try {
    const info = await stat(target);
    return info.isFile() ? info : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function localReference(rawReference) {
  const reference = rawReference.trim();
  if (
    !reference ||
    reference.startsWith("#") ||
    reference.startsWith("//") ||
    /^(?:data|https?|mailto|tel):/i.test(reference)
  ) {
    return null;
  }
  return reference;
}

async function verifyReference(sourceFile, rawReference, baseDirectory) {
  const reference = localReference(rawReference);
  if (!reference) return;

  const [pathWithQuery, fragment = ""] = reference.split("#", 2);
  const cleanPath = pathWithQuery.split("?", 1)[0];
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(cleanPath);
  } catch {
    issues.push(`${sourceFile}: kodlaması bozuk yerel adres (${reference})`);
    return;
  }

  const absolutePath = path.resolve(baseDirectory, decodedPath.replace(/^\/+/, ""));
  const relativeToRoot = path.relative(projectRoot, absolutePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    issues.push(`${sourceFile}: proje dışına çıkan adres (${reference})`);
    return;
  }
  if (!(await fileInfo(absolutePath))) {
    issues.push(`${sourceFile}: yerel dosya bulunamadı (${reference})`);
    return;
  }

  if (fragment && path.extname(absolutePath).toLowerCase() === ".svg") {
    const svg = await readFile(absolutePath, "utf8");
    const escapedFragment = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`\\bid=["']${escapedFragment}["']`).test(svg)) {
      issues.push(`${sourceFile}: SVG simgesi bulunamadı (${reference})`);
    }
  }
}

for (const relativePath of [...pageNames, ...requiredFiles]) {
  if (!(await fileInfo(path.join(projectRoot, relativePath)))) issues.push(`zorunlu dosya eksik: ${relativePath}`);
}
if (await fileInfo(path.join(projectRoot, "iletisim.html"))) {
  issues.push("ayrı iletişim sayfası kaldırılmalı: iletisim.html");
}

const pages = new Map(
  await Promise.all(
    pageNames.map(async (pageName) => [pageName, await readFile(path.join(projectRoot, pageName), "utf8")]),
  ),
);

for (const [pageName, html] of pages) {
  issues.push(...validateMarkup(pageName, html, pages));
  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    await verifyReference(pageName, match[1], projectRoot);
  }
}

const cssFiles = await walk(path.join(projectRoot, "css"), new Set([".css"]));
for (const cssFile of cssFiles) {
  const css = await readFile(cssFile, "utf8");
  const relativePath = path.relative(projectRoot, cssFile);
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    await verifyReference(relativePath, match[1], path.dirname(cssFile));
  }
}

const moduleFiles = await walk(path.join(projectRoot, "js"), new Set([".js", ".mjs"]));
for (const moduleFile of moduleFiles) {
  const source = await readFile(moduleFile, "utf8");
  const relativePath = path.relative(projectRoot, moduleFile);
  const specifiers = [
    ...source.matchAll(/\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ];
  for (const match of specifiers) {
    if (match[1].startsWith(".")) await verifyReference(relativePath, match[1], path.dirname(moduleFile));
  }
}

let services;
try {
  services = JSON.parse(await readFile(path.join(projectRoot, "content/services.json"), "utf8"));
} catch (error) {
  issues.push(`content/services.json okunamadı: ${error.message}`);
  services = [];
}

const homeHtml = pages.get("index.html");
if (!Array.isArray(services) || services.length !== 6) {
  issues.push("content/services.json tam olarak altı hizmet içermeli");
} else {
  const ids = new Set();
  for (const [index, service] of services.entries()) {
    const requiredKeys = ["id", "number", "name", "shortName", "summary", "description", "promise", "contents"];
    for (const key of requiredKeys) {
      if (!(key in service)) issues.push(`content/services.json: ${index + 1}. kayıtta ${key} eksik`);
    }
    if (ids.has(service.id)) issues.push(`content/services.json: yinelenen id (${service.id})`);
    ids.add(service.id);
    if (service.number !== String(index + 1).padStart(2, "0")) {
      issues.push(`content/services.json: ${service.id} sıra numarası hatalı`);
    }
    if (!Array.isArray(service.contents) || service.contents.length < 5) {
      issues.push(`content/services.json: ${service.id} kapsamı eksik`);
    }
    if (!homeHtml.includes(`id="${service.id}"`)) issues.push(`index.html: hizmet id eksik (${service.id})`);
    if (!homeHtml.includes(`<h3>${service.name}</h3>`)) issues.push(`index.html: hizmet başlığı eksik (${service.name})`);
    if (!homeHtml.includes(`<p>${service.summary}</p>`)) issues.push(`index.html: hizmet özeti eksik (${service.name})`);
  }
}

if (/\bpackage__cta\b|data-whatsapp-service/.test(homeHtml)) {
  issues.push("index.html: paket alanında kaldırılan WhatsApp CTA'sı bulunmamalı");
}

const divClasses = [...homeHtml.matchAll(/<div\b[^>]*class="([^"]*)"/g)].map((match) => match[1].split(/\s+/));
if (/\bmemory-(?:machine|tile)\b/.test(homeHtml)) {
  issues.push("index.html: kaldırılan memory-machine veya memory-tile yapısı bulunmamalı");
}
if (divClasses.filter((tokens) => tokens.includes("package")).length !== 6) {
  issues.push("index.html: paket alanı tam olarak altı gerçek package div içermeli");
}

const webpFiles = (await readdir(path.join(projectRoot, "assets", "images")))
  .filter((name) => name.toLowerCase().endsWith(".webp"))
  .sort();
if (JSON.stringify(webpFiles) !== JSON.stringify([...serviceImages].sort())) {
  issues.push(`assets/images: beklenen altı WebP ile eşleşmiyor (${webpFiles.join(", ")})`);
}
for (const imageName of serviceImages) {
  const relativePath = `assets/images/${imageName}`;
  const info = await fileInfo(path.join(projectRoot, relativePath));
  if (!info || info.size <= 1_024) issues.push(`${relativePath}: görsel eksik veya boş`);
  const escapedPath = relativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const uses = homeHtml.match(new RegExp(`src=["']${escapedPath}["']`, "g")) ?? [];
  if (uses.length !== 1) issues.push(`${relativePath}: paket alanında tam bir kez kullanılmalı`);
}

for (const imageName of heroImages) {
  const heroImagePath = `assets/images/${imageName}`;
  const heroImageInfo = await fileInfo(path.join(projectRoot, heroImagePath));
  if (!heroImageInfo || heroImageInfo.size <= 1_024) issues.push(`${heroImagePath}: hero görseli eksik veya boş`);
  const escapedHeroImagePath = heroImagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heroImageUses = homeHtml.match(new RegExp(`(?:src|srcset)=["']${escapedHeroImagePath}["']`, "g")) ?? [];
  if (heroImageUses.length !== 1) issues.push(`${heroImagePath}: hero içinde tam bir kez kullanılmalı`);
}

const main = homeHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
if (!main || (main[1].match(/<section\b/g) ?? []).length !== 3) {
  issues.push("index.html: main tam olarak hero, paketler ve iletişim olmak üzere üç section içermeli");
}
if (/<form\b/i.test(homeHtml)) issues.push("index.html: form bulunmamalı");
if (/\bconcept-line\b/i.test(homeHtml)) issues.push("index.html: kaldırılan hizmet geçiş çizgisi bulunmamalı");
if (!/<section\b[^>]*id="iletisim"[\s\S]*?data-whatsapp-general/i.test(homeHtml)) {
  issues.push("index.html: iletişim section doğrudan WhatsApp CTA içermeli");
}

if (issues.length > 0) {
  console.error(`Derleme bütünlüğü kontrolü ${issues.length} sorun buldu:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Derleme bütünlüğü geçti (tek landing page, ${cssFiles.length} CSS, ${moduleFiles.length} istemci modülü, ${services.length} hizmet, 6 WebP ve 2 hero PNG).`,
  );
}
