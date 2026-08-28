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
    assert.match(html, /<body\b[^>]*class="[^"]*\bpackage-detail-page\b[^"]*"/);
    assert.equal((html.match(/<section\b/g) ?? []).length, 4);
    assert.match(html, /<section\b[^>]*class="package-detail-hero"/);
    assert.match(html, /<section\b[^>]*class="package-overview"/);
    assert.match(html, /<section\b[^>]*class="package-media"/);
    assert.match(html, /<section\b[^>]*class="package-contact"/);
  }
});

test("paket sayfaları geçiş güvenli medya, responsive ve bootstrap dosyalarını yükler", () => {
  for (const pageName of packagePageNames) {
    const html = pages.get(pageName);
    const detailIndex = html.indexOf('href="css/pages/package-detail.css"');
    const mediaIndex = html.indexOf('href="css/pages/package-media.css"');
    const sharedResponsiveIndex = html.indexOf('href="css/responsive.css"');
    const detailResponsiveIndex = html.indexOf('href="css/pages/package-detail-responsive.css"');

    assert.ok(detailIndex >= 0 && mediaIndex > detailIndex, `${pageName}: yeni medya stili detay stilinden sonra yüklenmeli`);
    assert.notEqual(sharedResponsiveIndex, -1, `${pageName}: ortak responsive stil bağlantısı eksik`);
    assert.ok(
      detailResponsiveIndex > sharedResponsiveIndex,
      `${pageName}: paket responsive stilleri ortak katmandan sonra yüklenmeli`,
    );
    assert.match(html, /<script type="module" src="js\/package\/detail-app\.js"><\/script>/);
    assert.doesNotMatch(html, /<script type="module" src="js\/package\/app\.js"><\/script>/);
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
    const heroTitle = service.overviewReplacesHero ? `${service.shortName} deneyimi nasıl çalışır?` : service.name;
    assert.match(html, new RegExp(`<h1 id="package-title">${escapeRegExp(heroTitle)}<\\/h1>`));
    assert.match(html, new RegExp(escapeRegExp(service.description)));
    assert.match(html, new RegExp(escapeRegExp(service.promise)));
    assert.equal((html.match(new RegExp(`data-whatsapp-service="${escapeRegExp(service.name)}"`, "g")) ?? []).length, 3);
    assert.match(html, /href="index\.html#paketler"/);
    assert.match(html, /href="index\.html#iletisim"/);
    assert.match(html, new RegExp(`src="/media/images/${escapeRegExp(service.image)}"`));
    assert.match(html, new RegExp(`src="/media/images/${escapeRegExp(service.mobileImage)}"`));
    assert.doesNotMatch(html, new RegExp(`rel="preload"[^>]*${escapeRegExp(service.image)}`));
  }
});

test("tüm paket detay sayfaları sade hero ve birleşik açıklama yapısını kullanır", () => {
  for (const service of services) {
    const html = pages.get(service.page);
    const hero = html.match(/<section\b[^>]*class="package-detail-hero"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? "";
    const overview = html.match(/<section\b[^>]*class="package-overview"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? "";

    assert.doesNotMatch(hero, new RegExp(`Paket ${escapeRegExp(service.number)} ·`));
    assert.doesNotMatch(hero, /<figure\b|package-detail-hero__media/);
    assert.doesNotMatch(overview, />Deneyimin özü<|>Paket kapsamı</);
    const descriptionRegion = service.overviewReplacesHero ? hero : overview;
    assert.match(descriptionRegion, new RegExp(`${escapeRegExp(service.description)} ${escapeRegExp(service.promise)}`));
    assert.doesNotMatch(overview, /<blockquote\b/);
  }
});

test("QR paketinin deneyim metni mevcut hero metninin yerini alır", () => {
  const service = services.find(({ overviewReplacesHero }) => overviewReplacesHero === true);
  assert.ok(service);

  const html = pages.get(service.page);
  const hero = html.match(/<section\b[^>]*class="package-detail-hero"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? "";
  const overview = html.match(/<section\b[^>]*class="package-overview"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? "";

  assert.match(hero, new RegExp(`<h1 id="package-title">${escapeRegExp(service.shortName)} deneyimi nasıl çalışır\\?<\\/h1>`));
  assert.match(hero, new RegExp(`<p class="package-detail__lead">${escapeRegExp(service.description)} ${escapeRegExp(service.promise)}<\\/p>`));
  assert.doesNotMatch(hero, new RegExp(`<h1 id="package-title">${escapeRegExp(service.name)}<\\/h1>`));
  assert.doesNotMatch(hero, new RegExp(`<p class="package-detail__lead">${escapeRegExp(service.summary)}<\\/p>`));
  assert.doesNotMatch(overview, /package-overview__copy/);
  assert.match(overview, /package-overview__grid--scope-only/);
  assert.match(overview, /<div class="package-scope" aria-labelledby="scope-title">/);
});

test("medya alanları sade fotoğraf mozaiği ve iki dikey video kapağı kullanır", () => {
  for (const pageName of packagePageNames) {
    const html = pages.get(pageName);
    assert.doesNotMatch(html, /<(?:audio|iframe|video)\b/i);
    assert.equal((html.match(/\bclass="package-photo-card/g) ?? []).length, 8);
    assert.equal((html.match(/\bclass="package-video-card"/g) ?? []).length, 2);
    assert.equal((html.match(/\bclass="package-gallery-toggle"/g) ?? []).length, 1);
    assert.match(html, /aria-controls="package-photo-gallery"/);
    assert.match(html, />Tümünü Gör</);
    assert.doesNotMatch(html, /<figcaption\b/i);
    assert.doesNotMatch(html, /Örnek|Orijinal|Geçici medya|güncellenecek|gerçek paket videosu/i);
  }
});
