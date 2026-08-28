import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateMarkup } from "./markup-check.mjs";
import { packagePageNames, pageNames } from "./page-manifest.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const requiredFiles = [
  "content/services.json",
  "css/base.css",
  "css/components.css",
  "css/motion.css",
  "css/pages/home.css",
  "css/pages/package-detail.css",
  "css/pages/package-detail-responsive.css",
  "css/pages/package-media.css",
  "css/responsive.css",
  "css/tokens.css",
  "js/home/app.js",
  "js/package/detail-app.js",
  "js/package/gallery.js",
  "js/shared/contact.js",
  "js/shared/site.js",
  "tools/page-manifest.mjs",
  "tools/render-package-pages.mjs",
];
const serviceImages = [
  "qr-memory-album.webp",
  "polaroid-memory.webp",
  "video-booth.webp",
  "guest-interviews.webp",
  "live-stream.webp",
  "audio-phone.webp",
];
const serviceMobileImages = serviceImages.map((imageName) => imageName.replace(".webp", "-mobile.webp"));
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

  const absolutePath = decodedPath.startsWith("/media/")
    ? path.resolve(projectRoot, "storage", "public-media", decodedPath.slice("/media/".length))
    : path.resolve(baseDirectory, decodedPath.replace(/^\/+/, ""));
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
  for (const match of html.matchAll(/\b(?:href|poster|src|srcset)=["']([^"']+)["']/gi)) {
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
    const requiredKeys = [
      "id",
      "number",
      "page",
      "image",
      "mobileImage",
      "imageAlt",
      "name",
      "shortName",
      "summary",
      "description",
      "promise",
      "contents",
    ];
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
    if (!homeHtml.includes(`href="${service.page}"`)) issues.push(`index.html: paket detay bağlantısı eksik (${service.page})`);

    const detailHtml = pages.get(service.page);
    if (!detailHtml) {
      issues.push(`paket detay sayfası eksik: ${service.page}`);
      continue;
    }
    const heroTitle = service.overviewReplacesHero ? `${service.shortName} deneyimi nasıl çalışır?` : service.name;
    for (const expected of [
      `<h1 id="package-title">${heroTitle}</h1>`,
      service.description,
      service.promise,
      `data-whatsapp-service="${service.name}"`,
      `/media/images/${service.image}`,
      `/media/images/${service.mobileImage}`,
    ]) {
      if (!detailHtml.includes(expected)) issues.push(`${service.page}: hizmet içeriği eksik (${expected})`);
    }
    for (const item of service.contents) {
      if (!detailHtml.includes(`<li>${item}</li>`)) issues.push(`${service.page}: kapsam maddesi eksik (${item})`);
    }
  }

  if (JSON.stringify(services.map(({ page }) => page)) !== JSON.stringify(packagePageNames)) {
    issues.push("paket sayfa manifesti içerik kaynağıyla eşleşmiyor");
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

const imageDirectory = path.join(projectRoot, "storage", "public-media", "images");
const publicImageUrl = "/media/images/";
const webpFiles = (await readdir(imageDirectory))
  .filter((name) => name.toLowerCase().endsWith(".webp"))
  .sort();
if (JSON.stringify(webpFiles) !== JSON.stringify([...serviceImages, ...serviceMobileImages].sort())) {
  issues.push(`storage/public-media/images: beklenen masaüstü ve mobil WebP görselleriyle eşleşmiyor (${webpFiles.join(", ")})`);
}
for (const imageName of serviceImages) {
  const relativePath = `storage/public-media/images/${imageName}`;
  const info = await fileInfo(path.join(projectRoot, relativePath));
  if (!info || info.size <= 1_024) issues.push(`${relativePath}: görsel eksik veya boş`);
  const escapedPath = `${publicImageUrl}${imageName}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const uses = homeHtml.match(new RegExp(`src=["']${escapedPath}["']`, "g")) ?? [];
  if (uses.length !== 1) issues.push(`${relativePath}: paket alanında tam bir kez kullanılmalı`);
}
for (const imageName of serviceMobileImages) {
  const relativePath = `storage/public-media/images/${imageName}`;
  const info = await fileInfo(path.join(projectRoot, relativePath));
  if (!info || info.size <= 1_024) issues.push(`${relativePath}: mobil görsel eksik veya boş`);
  const escapedPath = `${publicImageUrl}${imageName}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const uses = homeHtml.match(new RegExp(`srcset=["']${escapedPath}["']`, "g")) ?? [];
  if (uses.length !== 1) issues.push(`${relativePath}: mobil paket alanında tam bir kez kullanılmalı`);
}

for (const imageName of heroImages) {
  const heroImagePath = `storage/public-media/images/${imageName}`;
  const heroImageInfo = await fileInfo(path.join(projectRoot, heroImagePath));
  if (!heroImageInfo || heroImageInfo.size <= 1_024) issues.push(`${heroImagePath}: hero görseli eksik veya boş`);
  const escapedHeroImagePath = `${publicImageUrl}${imageName}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    `Derleme bütünlüğü geçti (${pages.size} sayfa, ${cssFiles.length} CSS, ${moduleFiles.length} istemci modülü, ${services.length} hizmet, 12 WebP ve 2 hero PNG).`,
  );
}
