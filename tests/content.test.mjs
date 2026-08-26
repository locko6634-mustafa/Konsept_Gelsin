import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const serviceImages = [
  "qr-memory-album.webp",
  "polaroid-memory.webp",
  "video-booth.webp",
  "guest-interviews.webp",
  "live-stream.webp",
  "audio-phone.webp",
];
const heroImages = ["hero-still-life-v2.png", "hero-still-life-mobile-v3.png"];

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8");
}

async function projectFileExists(path) {
  try {
    return (await stat(new URL(path, projectRoot))).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const [servicesSource, homeHtml] = await Promise.all([
  readProjectFile("content/services.json"),
  readProjectFile("index.html"),
]);
const services = JSON.parse(servicesSource);

test("hizmet veri kaynağı altı eksiksiz ve benzersiz kayıt içerir", () => {
  assert.equal(services.length, 6);
  assert.deepEqual(
    services.map(({ number }) => number),
    ["01", "02", "03", "04", "05", "06"],
  );
  assert.equal(new Set(services.map(({ id }) => id)).size, services.length);
  assert.equal(new Set(services.map(({ name }) => name)).size, services.length);

  for (const service of services) {
    assert.match(service.id, /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u);
    for (const field of ["name", "shortName", "summary", "description", "promise"]) {
      assert.equal(typeof service[field], "string", `${service.id}.${field} metin olmalı`);
      assert.ok(service[field].trim().length > 2, `${service.id}.${field} boş bırakılamaz`);
      assert.doesNotMatch(service[field], /(?:lorem ipsum|todo|\[[^\]]+\])/i);
    }
    assert.ok(Array.isArray(service.contents));
    assert.ok(service.contents.length >= 5, `${service.id} en az beş kapsam maddesi içermeli`);
    assert.ok(service.contents.every((item) => typeof item === "string" && item.trim().length > 2));
  }
});

test("hero yeni görsel kompozisyonu, paket alanı ise altı gerçek hizmet yapısını sunar", () => {
  const divClassLists = [...homeHtml.matchAll(/<div\b[^>]*class="([^"]*)"/g)].map((match) =>
    match[1].split(/\s+/),
  );
  assert.doesNotMatch(homeHtml, /\bmemory-(?:machine|tile)\b/);
  for (const heroImage of heroImages) {
    assert.match(homeHtml, new RegExp(`(?:src|srcset)="assets/images/${escapeRegExp(heroImage)}"`));
  }
  assert.equal(divClassLists.filter((tokens) => tokens.includes("package")).length, 6);
  const packageThemes = divClassLists
    .filter((tokens) => tokens.includes("package"))
    .map((tokens) => tokens.find((token) => /^package--(?:sage|yellow|ink|paper|orange|blue)$/.test(token)));
  assert.equal(new Set(packageThemes).size, 6, "her paket benzersiz bir renk teması kullanmalı");

  for (const service of services) {
    assert.match(homeHtml, new RegExp(`id="${escapeRegExp(service.id)}"`));
    assert.match(homeHtml, new RegExp(`<h3>${escapeRegExp(service.name)}<\\/h3>`));
    assert.match(homeHtml, new RegExp(`<p>${escapeRegExp(service.summary)}<\\/p>`));
  }
  const packageSection = homeHtml.match(/<section\b[^>]*id="paketler"[^>]*>([\s\S]*?)<\/section>/i);
  assert.ok(packageSection, "paket alanı bulunamadı");
  assert.doesNotMatch(packageSection[1], /<(?:blockquote|details)\b|\bpackage__cta\b|data-whatsapp-service/i);
});

test("imagegen hero görseli ve hizmet WebP görselleri doğru alanlarda kullanılır", async () => {
  const webpFiles = (await readdir(new URL("assets/images/", projectRoot)))
    .filter((name) => name.toLowerCase().endsWith(".webp"))
    .sort();
  assert.deepEqual(webpFiles, [...serviceImages].sort());

  for (const imageName of serviceImages) {
    const imagePath = `assets/images/${imageName}`;
    assert.ok(await projectFileExists(imagePath), `${imagePath} bulunamadı`);
    const imageStats = await stat(new URL(imagePath, projectRoot));
    assert.ok(imageStats.size > 1_024, `${imagePath} boş veya geçersiz görünüyor`);
    const uses = homeHtml.match(new RegExp(`src="${escapeRegExp(imagePath)}"`, "g")) ?? [];
    assert.equal(uses.length, 1, `${imagePath} paket alanında bir kez kullanılmalı`);
  }

  for (const heroImage of heroImages) {
    const heroImagePath = `assets/images/${heroImage}`;
    assert.ok(await projectFileExists(heroImagePath), `${heroImagePath} bulunamadı`);
    const heroImageStats = await stat(new URL(heroImagePath, projectRoot));
    assert.ok(heroImageStats.size > 1_024, `${heroImagePath} boş veya geçersiz görünüyor`);
    assert.equal(
      (homeHtml.match(new RegExp(`(?:src|srcset)="${escapeRegExp(heroImagePath)}"`, "g")) ?? []).length,
      1,
    );
  }
});

test("ürün yalnız tek landing page olarak kalır", async () => {
  assert.equal(await projectFileExists("iletisim.html"), false);
  assert.doesNotMatch(homeHtml, /(?:href|src)=["'][^"']*iletisim\.html/i);
});
