import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateMarkup } from "./markup-check.mjs";
import { packagePageNames, pageNames } from "./page-manifest.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const imageDirectory = path.join(projectRoot, "storage", "public-media", "images");
const issues = [];

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
  "js/shared/mobile-dock.js",
  "js/shared/quote-dialog.js",
  "js/shared/site.js",
  "tools/page-manifest.mjs",
  "tools/render-package-pages.mjs",
];

const heroImages = [
  "hero-still-life-mobile-v3-480w.avif",
  "hero-still-life-mobile-v3-480w.webp",
  "hero-still-life-mobile-v3-768w.avif",
  "hero-still-life-mobile-v3-768w.webp",
  "hero-still-life-v2-960w.avif",
  "hero-still-life-v2-960w.webp",
  "hero-still-life-v2-1440w.avif",
  "hero-still-life-v2-1440w.webp",
];

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function localReference(rawReference) {
  const reference = rawReference.trim();
  if (
    !reference ||
    reference.startsWith("#") ||
    reference.startsWith("//") ||
    /^(?:blob|data|https?|mailto|tel):/i.test(reference)
  ) {
    return null;
  }
  return reference;
}

function srcsetReferences(value) {
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/, 1)[0])
    .filter(Boolean);
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
    const escapedFragment = escapeRegExp(fragment);
    if (!new RegExp(`\\bid=["']${escapedFragment}["']`).test(svg)) {
      issues.push(`${sourceFile}: SVG simgesi bulunamadı (${reference})`);
    }
  }
}

async function checkImage(imageName, { maximumBytes, label } = {}) {
  const relativePath = `storage/public-media/images/${imageName}`;
  const info = await fileInfo(path.join(imageDirectory, imageName));
  if (!info || info.size <= 1_024) {
    issues.push(`${relativePath}: görsel eksik veya boş`);
    return;
  }
  if (maximumBytes && info.size > maximumBytes) {
    issues.push(`${relativePath}: ${label ?? "görsel"} bütçesini aşıyor (${info.size} B)`);
  }
}

for (const relativePath of [...pageNames, ...requiredFiles]) {
  if (!(await fileInfo(path.join(projectRoot, relativePath)))) {
    issues.push(`zorunlu dosya eksik: ${relativePath}`);
  }
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
  for (const match of html.matchAll(/\b(?:href|poster|src)=["']([^"']+)["']/gi)) {
    await verifyReference(pageName, match[1], projectRoot);
  }
  for (const match of html.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
    for (const reference of srcsetReferences(match[1])) {
      await verifyReference(pageName, reference, projectRoot);
    }
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
    if (match[1].startsWith(".")) {
      await verifyReference(relativePath, match[1], path.dirname(moduleFile));
    }
  }
}

let services;
try {
  services = JSON.parse(await readFile(path.join(projectRoot, "content/services.json"), "utf8"));
} catch (error) {
  issues.push(`content/services.json okunamadı: ${error.message}`);
  services = [];
}

const homeHtml = pages.get("index.html") ?? "";
if (!Array.isArray(services) || services.length !== 6) {
  issues.push("content/services.json tam olarak altı hizmet içermeli");
} else {
  const ids = new Set();
  for (const [index, service] of services.entries()) {
    const requiredKeys = [
      "id",
      "number",
      "featured",
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
    if (typeof service.featured !== "boolean") {
      issues.push(`content/services.json: ${service.id ?? index + 1} featured boolean olmalı`);
    }
    if (ids.has(service.id)) issues.push(`content/services.json: yinelenen id (${service.id})`);
    ids.add(service.id);
    if (service.number !== String(index + 1).padStart(2, "0")) {
      issues.push(`content/services.json: ${service.id} sıra numarası hatalı`);
    }
    if (!Array.isArray(service.contents) || service.contents.length < 5) {
      issues.push(`content/services.json: ${service.id} kapsamı eksik`);
    }

    for (const expected of [
      `id="${service.id}"`,
      `href="${service.page}"`,
      `<span class="package__title--short">${service.shortName}</span>`,
      `<span class="package__title--full">${service.name}</span>`,
      `<p class="package__summary">${service.summary}</p>`,
    ]) {
      if (!homeHtml.includes(expected)) issues.push(`index.html: hizmet içeriği eksik (${expected})`);
    }

    const imageStem = service.image.replace(/\.webp$/i, "");
    for (const imageName of [
      service.image,
      service.mobileImage,
      `${imageStem}-480w.avif`,
      `${imageStem}-480w.webp`,
      `${imageStem}.avif`,
    ]) {
      await checkImage(imageName, {
        maximumBytes: imageName.includes("-480w.") ? 100 * 1_024 : undefined,
        label: "100 KiB kart",
      });
    }
    for (const sourceName of [
      `${imageStem}-480w.avif 480w`,
      `${imageStem}.avif 960w`,
      `${imageStem}-480w.webp 480w`,
      `${imageStem}.webp 960w`,
    ]) {
      if (!homeHtml.includes(`/media/images/${sourceName}`)) {
        issues.push(`index.html: responsive paket kaynağı eksik (${sourceName})`);
      }
    }

    const detailHtml = pages.get(service.page);
    if (!detailHtml) {
      issues.push(`paket detay sayfası eksik: ${service.page}`);
      continue;
    }
    for (const expected of [
      `<h1 id="package-title">${service.shortName}</h1>`,
      service.description,
      service.promise,
      `data-default-service="${service.name}"`,
      `data-quote-service="${service.name}"`,
      `/media/images/${service.image}`,
      `/media/images/${service.mobileImage}`,
    ]) {
      if (!detailHtml.includes(expected)) issues.push(`${service.page}: hizmet içeriği eksik (${expected})`);
    }
    for (const item of service.contents) {
      if (!detailHtml.includes(`<li>${item}</li>`)) issues.push(`${service.page}: kapsam maddesi eksik (${item})`);
    }

    const sectionOrder = [
      detailHtml.indexOf('class="package-detail-hero"'),
      detailHtml.indexOf('class="package-overview"'),
      detailHtml.indexOf('class="package-media"'),
      detailHtml.indexOf('class="package-contact"'),
    ];
    if (sectionOrder.some((position) => position < 0) || sectionOrder.some((position, i) => i > 0 && position <= sectionOrder[i - 1])) {
      issues.push(`${service.page}: detay bölüm sırası hero → kapsam → medya → final CTA olmalı`);
    }
    if ((detailHtml.match(/class="package-photo-card"/g) ?? []).length !== 8) {
      issues.push(`${service.page}: galeri tam olarak sekiz görsel içermeli`);
    }
    if ((detailHtml.match(/<figcaption>Temsili video ön izlemesi<\/figcaption>/g) ?? []).length !== 2) {
      issues.push(`${service.page}: iki pasif video ön izlemesi açıkça etiketlenmeli`);
    }
    if (!/data-package-gallery-toggle[^>]*hidden|hidden[^>]*data-package-gallery-toggle/.test(detailHtml)) {
      issues.push(`${service.page}: galeri kontrolü JavaScript olmadan gizli başlamalı`);
    }
  }

  if (JSON.stringify(services.map(({ page }) => page)) !== JSON.stringify(packagePageNames)) {
    issues.push("paket sayfa manifesti içerik kaynağıyla eşleşmiyor");
  }
  if (services.filter(({ featured }) => featured).length !== 2) {
    issues.push("content/services.json tam olarak iki öne çıkan paket içermeli");
  }
}

const packageOpeningTags = homeHtml.match(/<a\b[^>]*class="[^"]*\bpackage\b[^"]*"[^>]*>/g) ?? [];
if (packageOpeningTags.length !== 6) {
  issues.push("index.html: birleşik grid tam olarak altı tıklanabilir package kartı içermeli");
}
if ((homeHtml.match(/<span class="package__badge">Öne çıkan<\/span>/g) ?? []).length !== 2) {
  issues.push("index.html: tam olarak iki Öne çıkan rozeti bulunmalı");
}
if (/\b(?:featured-grid|featured-card|package__link|memory-machine|memory-tile)\b/.test(homeHtml)) {
  issues.push("index.html: kaldırılan eski paket yapısı bulunmamalı");
}
if (!/class="hero"[\s\S]*?href="#paketler"[\s\S]*?Paketleri [Kk]eşfet/.test(homeHtml)) {
  issues.push("index.html: hero yalnız paket keşif akışını başlatmalı");
}
if (!/data-mobile-dock/.test(homeHtml) || !/data-quote-trigger/.test(homeHtml)) {
  issues.push("index.html: mobil aksiyon çubuğu veya teklif tetikleyicisi eksik");
}
for (const hook of [
  "data-quote-dialog",
  "data-quote-form",
  'data-quote-step="date"',
  'data-quote-step="city"',
  'data-quote-step="package"',
  "data-quote-whatsapp",
]) {
  if (!homeHtml.includes(hook)) issues.push(`index.html: teklif akışı kancası eksik (${hook})`);
}
if (!homeHtml.includes("Konsepti seçin") || !homeHtml.includes("Tarih ve kurulumu netleştirelim") || !homeHtml.includes("Anılarınızı teslim edelim")) {
  issues.push("index.html: paketlerden bağımsız üç adımlı süreç metni eksik");
}
if (!/href="tel:\+905386888306"/.test(homeHtml) || !/href="mailto:info@konseptgelsin\.com"/.test(homeHtml)) {
  issues.push("index.html: telefon veya e-posta iletişim kanalı eksik");
}

for (const heroImage of heroImages) {
  await checkImage(heroImage, {
    maximumBytes: heroImage.includes("mobile") ? 500 * 1_024 : undefined,
    label: "500 KiB mobil hero",
  });
  if (!homeHtml.includes(`/media/images/${heroImage}`)) {
    issues.push(`index.html: responsive hero kaynağı eksik (${heroImage})`);
  }
}
const faviconInfo = await fileInfo(path.join(imageDirectory, "ui", "favicon.svg"));
if (!faviconInfo || faviconInfo.size > 10 * 1_024) {
  issues.push("storage/public-media/images/ui/favicon.svg: favicon 10 KiB bütçesine uymalı");
}

if (issues.length > 0) {
  console.error(`Derleme bütünlüğü kontrolü ${issues.length} sorun buldu:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Derleme bütünlüğü geçti (${pages.size} sayfa, ${cssFiles.length} CSS, ${moduleFiles.length} istemci modülü, ${services.length} hizmet, responsive AVIF/WebP bütçeleri).`,
  );
}
