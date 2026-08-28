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

test("tüm paket detay sayfaları hero, kapsam, medya ve iletişim sırasını korur", () => {
  for (const pageName of packagePageNames) {
    const html = pages.get(pageName);
    const heroIndex = html.indexOf('<section class="package-detail-hero"');
    const overviewIndex = html.indexOf('<section class="package-overview"');
    const mediaIndex = html.indexOf('<section class="package-media"');
    const contactIndex = html.indexOf('<section class="package-contact"');

    assert.deepEqual(validateMarkup(pageName, html, pages), []);
    assert.match(html, /<body\b[^>]*class="[^"]*\bpackage-detail-page\b[^"]*"/);
    assert.match(html, /<main\b[^>]*id="main-content"[^>]*tabindex="-1"[^>]*>/i);
    assert.equal((html.match(/<section\b/g) ?? []).length, 4);
    assert.ok(heroIndex >= 0, `${pageName}: hero bölümü eksik`);
    assert.ok(overviewIndex > heroIndex, `${pageName}: kapsam hero sonrasında olmalı`);
    assert.ok(mediaIndex > overviewIndex, `${pageName}: medya kapsam sonrasında olmalı`);
    assert.ok(contactIndex > mediaIndex, `${pageName}: iletişim medya sonrasında olmalı`);
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

test("her detay sayfası kendi hizmet içeriğini ve güvenli teklif fallback'lerini taşır", () => {
  for (const service of services) {
    const html = pages.get(service.page);
    const quoteTriggers = [
      ...html.matchAll(/<a\b([^>]*data-quote-trigger[^>]*)>([\s\S]*?)<\/a>/gi),
    ];

    assert.match(
      html,
      new RegExp(`<h1 id="package-title">${escapeRegExp(service.shortName)}<\\/h1>`),
    );
    assert.match(html, new RegExp(escapeRegExp(service.description)));
    assert.match(html, new RegExp(escapeRegExp(service.promise)));
    assert.equal(quoteTriggers.length, 3);
    assert.equal(
      (
        html.match(
          new RegExp(`data-quote-service="${escapeRegExp(service.name)}"`, "g"),
        ) ?? []
      ).length,
      3,
    );
    assert.match(
      html,
      new RegExp(`data-default-service="${escapeRegExp(service.name)}"`),
    );
    for (const trigger of quoteTriggers) {
      assert.match(
        trigger[1],
        /href="https:\/\/wa\.me\/905386888306\?text=[^"]+"/,
      );
      assert.match(trigger[1], /target="_blank"/);
      assert.match(trigger[1], /rel="[^"]*noopener[^"]*noreferrer[^"]*"/);
    }
    assert.match(html, /href="index\.html#paketler"/);
    assert.match(html, /href="index\.html#iletisim"/);
    assert.match(html, /<nav\b[^>]*data-mobile-dock/);
    assert.match(html, new RegExp(`src="/media/images/${escapeRegExp(service.image)}"`));
    assert.match(html, new RegExp(`src="/media/images/${escapeRegExp(service.mobileImage)}"`));
    assert.doesNotMatch(html, new RegExp(`rel="preload"[^>]*${escapeRegExp(service.image)}`));
  }
});

test("final iletişim alanı teklif CTA'sından sonra telefon ve e-posta seçeneklerini korur", () => {
  for (const pageName of packagePageNames) {
    const html = pages.get(pageName);
    const contact = html.match(
      /<section\b[^>]*class="package-contact"[^>]*>([\s\S]*?)<\/section>/i,
    );

    assert.ok(contact, `${pageName}: final iletişim alanı eksik`);
    const ctaIndex = contact[1].indexOf("data-quote-trigger");
    const detailsIndex = contact[1].indexOf('class="package-contact__details"');
    const address = contact[1].match(
      /<address\b([^>]*class="package-contact__details"[^>]*)>([\s\S]*?)<\/address>/i,
    );

    assert.ok(ctaIndex >= 0, `${pageName}: teklif CTA'sı eksik`);
    assert.ok(detailsIndex > ctaIndex, `${pageName}: iletişim kanalları CTA'dan sonra gelmeli`);
    assert.ok(address, `${pageName}: erişilebilir iletişim address yapısı eksik`);
    assert.match(address[1], /aria-label="Diğer iletişim kanalları"/);
    assert.match(address[2], /href="tel:\+905386888306"/);
    assert.match(address[2], /href="mailto:info@konseptgelsin\.com"/);
    assert.match(address[2], />Telefon</);
    assert.match(address[2], />E-posta</);
  }
});

test("tüm paket detay sayfaları kısa hero ve ayrı kapsam açıklamasını kullanır", () => {
  for (const service of services) {
    const html = pages.get(service.page);
    const hero = html.match(/<section\b[^>]*class="package-detail-hero"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? "";
    const overview = html.match(/<section\b[^>]*class="package-overview"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? "";

    assert.doesNotMatch(hero, new RegExp(`Paket ${escapeRegExp(service.number)} ·`));
    assert.doesNotMatch(hero, /<figure\b|package-detail-hero__media/);
    assert.match(
      hero,
      new RegExp(
        `<p class="package-detail__lead">${escapeRegExp(service.summary)}<\\/p>`,
      ),
    );
    assert.match(
      hero,
      new RegExp(
        `<p class="package-detail__promise">${escapeRegExp(service.promise)}<\\/p>`,
      ),
    );
    assert.match(overview, new RegExp(`<p>${escapeRegExp(service.description)}<\\/p>`));
    assert.match(overview, /<div class="package-scope" aria-labelledby="scope-title">/);
    assert.doesNotMatch(overview, /<blockquote\b/);
  }
});

test("teklif dialogu detay sayfasının hizmetini varsayılan ve seçili paket yapar", () => {
  for (const service of services) {
    const html = pages.get(service.page);
    const hero = html.match(/<section\b[^>]*class="package-detail-hero"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? "";
    const dialog = html.match(/<dialog\b([^>]*)>([\s\S]*?)<\/dialog>/i);

    assert.match(hero, /class="package-detail__actions"/);
    assert.match(hero, /data-quote-trigger/);
    assert.match(hero, />\s*Fiyat ve uygunluk sor\s*</);
    assert.ok(dialog, `${service.page}: teklif dialogu eksik`);
    assert.match(
      dialog[1],
      new RegExp(`data-default-service="${escapeRegExp(service.name)}"`),
    );
    assert.match(
      dialog[2],
      new RegExp(
        `<option value="${escapeRegExp(service.name)}" selected>${escapeRegExp(service.name)}<\\/option>`,
      ),
    );
    assert.equal((dialog[2].match(/\sselected(?:\s|>)/g) ?? []).length, 1);
    assert.match(dialog[2], /<option value="Kararsızım">Kararsızım<\/option>/);
  }
});

test("medya alanları no-JS galerisi ve iki pasif video ön izlemesi kullanır", () => {
  for (const pageName of packagePageNames) {
    const html = pages.get(pageName);
    const gallery = html.match(
      /<div\b[^>]*class="package-photo-gallery"[^>]*id="package-photo-gallery"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const galleryRegionIndex = html.indexOf("data-package-gallery-region");
    const galleryIndex = html.indexOf('id="package-photo-gallery"');
    const galleryEndIndex = gallery ? gallery.index + gallery[0].length : -1;
    const toggleIndex = html.indexOf("data-package-gallery-toggle");
    const videoIndex = html.indexOf('<h2 id="video-title">');

    assert.match(html, /<h2 id="media-title">Fotoğraflar<\/h2>/);
    assert.match(html, /<h2 id="video-title">Videolar<\/h2>/);
    assert.doesNotMatch(html, /<(?:audio|iframe|video)\b/i);
    assert.ok(gallery, `${pageName}: fotoğraf galerisi bulunamadı`);
    assert.equal((gallery[1].match(/\bclass="package-photo-card/g) ?? []).length, 8);
    assert.equal((gallery[1].match(/<img\b/g) ?? []).length, 8);
    assert.doesNotMatch(gallery[0], /\bhidden\b|data-package-gallery-toggle/);
    assert.equal((html.match(/\bclass="package-video-card"/g) ?? []).length, 2);
    assert.equal(
      (
        html.match(
          /<figcaption>Temsili video ön izlemesi<\/figcaption>/g,
        ) ?? []
      ).length,
      2,
    );
    assert.equal((html.match(/\bclass="package-gallery-toggle"/g) ?? []).length, 1);
    assert.ok(galleryRegionIndex >= 0 && galleryIndex > galleryRegionIndex);
    assert.ok(toggleIndex > galleryEndIndex, `${pageName}: galeri kontrolü galeri dışında olmalı`);
    assert.ok(toggleIndex < videoIndex, `${pageName}: galeri kontrolü medya grubundan taşmamalı`);
    assert.match(
      html,
      /<button\b[^>]*class="package-gallery-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="package-photo-gallery"[^>]*data-package-gallery-toggle[^>]*hidden[^>]*>/,
    );
    assert.match(html, />Tümünü Gör</);
    assert.doesNotMatch(html, /\bpackage-video-card__play\b|icon-video/);
    assert.doesNotMatch(html, /Orijinal|Geçici medya|güncellenecek|gerçek paket videosu/i);
  }
});

test("paket kapsamı ortalanmış başlık ve ortak kart yapısını kullanır", () => {
  for (const pageName of packagePageNames) {
    const html = pages.get(pageName);
    assert.match(html, /<h2 id="scope-title">Neler dahil\?<\/h2>/);
  }
});
