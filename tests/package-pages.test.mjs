import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateMarkup } from "../tools/markup-check.mjs";
import { packagePageNames, pageNames, services } from "../tools/page-manifest.mjs";

const projectRoot = new URL("../", import.meta.url);
const pages = new Map(
  await Promise.all(
    pageNames.map(async (pageName) => [pageName, await readFile(new URL(pageName, projectRoot), "utf8")]),
  ),
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagContent(html, tagName) {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"))?.[1].trim() ?? "";
}

function canonicalHref(html) {
  return html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1] ?? "";
}

test("tüm paket detay sayfaları ortak HTML ve erişilebilirlik sözleşmesini karşılar", () => {
  for (const pageName of packagePageNames) {
    const html = pages.get(pageName);
    assert.deepEqual(validateMarkup(pageName, html, pages), []);
    assert.match(html, /<body\b[^>]*class="package-detail-page"/);
    assert.equal((html.match(/<section\b/g) ?? []).length, 4);
    assert.match(html, /<section\b[^>]*class="package-detail-hero"/);
    assert.match(html, /<section\b[^>]*class="package-overview"/);
    assert.match(html, /<section\b[^>]*class="package-media"/);
    assert.match(html, /<section\b[^>]*class="package-contact"/);
  }
});

test("paket sayfaları benzersiz SEO başlıkları ve canonical adresleri taşır", () => {
  const titles = packagePageNames.map((pageName) => tagContent(pages.get(pageName), "title"));
  const canonicals = packagePageNames.map((pageName) => canonicalHref(pages.get(pageName)));

  assert.equal(new Set(titles).size, packagePageNames.length);
  assert.equal(new Set(canonicals).size, packagePageNames.length);

  for (const service of services) {
    const html = pages.get(service.page);
    assert.equal(tagContent(html, "title"), `${service.name} | Konsept Gelsin`);
    assert.equal(canonicalHref(html), `https://konseptgelsin.com/${service.page}`);
    assert.match(html, new RegExp(`<meta property="og:image" content="https://konseptgelsin\\.com/media/images/${escapeRegExp(service.image)}">`));
  }
});

test("her detay sayfası kendi hizmet içeriğini, geri yolunu ve WhatsApp CTA'larını taşır", () => {
  for (const service of services) {
    const html = pages.get(service.page);
    assert.match(html, new RegExp(`<h1 id="package-title">${escapeRegExp(service.name)}<\\/h1>`));
    assert.match(html, new RegExp(escapeRegExp(service.description)));
    assert.match(html, new RegExp(escapeRegExp(service.promise)));
    assert.equal((html.match(new RegExp(`data-whatsapp-service="${escapeRegExp(service.name)}"`, "g")) ?? []).length, 3);
    assert.match(html, /href="index\.html#paketler"/);
    assert.match(html, /href="index\.html#iletisim"/);
    assert.match(html, new RegExp(`src="/media/images/${escapeRegExp(service.image)}"`));
    assert.match(html, new RegExp(`srcset="/media/images/${escapeRegExp(service.mobileImage)}"`));
  }
});

test("video alanları kaynak yokken bozuk oynatıcı yerine açık etiketli placeholder kullanır", () => {
  for (const pageName of packagePageNames) {
    const html = pages.get(pageName);
    assert.doesNotMatch(html, /<(?:audio|iframe|video)\b/i);
    assert.equal((html.match(/\bclass="package-video-placeholder"/g) ?? []).length, 1);
    assert.match(html, /Örnek video alanı/);
    assert.match(html, /Orijinal çekim eklenecek/);
    assert.doesNotMatch(html, /package-video-placeholder[^>]*(?:href|tabindex|type)=/i);
  }
});
