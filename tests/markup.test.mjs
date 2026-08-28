import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { validateMarkup } from "../tools/markup-check.mjs";

const projectRoot = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", projectRoot), "utf8");
const pages = new Map([["index.html", html]]);

test("index.html semantik ve bağlantı sözleşmesini karşılar", () => {
  assert.deepEqual(validateMarkup("index.html", html, pages), []);
});

test("landing page hero, paketler ve WhatsApp iletişimi olmak üzere üç ana section içerir", () => {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  assert.ok(main, "main bulunamadı");
  assert.equal((main[1].match(/<section\b/g) ?? []).length, 3);
  assert.match(main[1], /<section\b[^>]*class="[^"]*\bhero\b/);
  assert.match(main[1], /<section\b[^>]*id="paketler"/);
  assert.match(main[1], /<section\b[^>]*id="iletisim"/);
});

test("header navigasyonu hizmetler ve iletişim bölümlerine tüm ekranlarda doğrudan erişim sağlar", () => {
  const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i);
  assert.ok(header, "header bulunamadı");
  assert.equal((header[1].match(/href="#paketler"/g) ?? []).length, 1);
  assert.equal((header[1].match(/href="#iletisim"/g) ?? []).length, 1);
  assert.doesNotMatch(header[1], /\b(?:menu-button|mobile-menu)\b/i);
  assert.doesNotMatch(header[1], /\bheader-contact\b|data-whatsapp-general/i);
});

test("kaldırılması istenen hero alt metni görünmez", () => {
  assert.doesNotMatch(html, /6 hizmet\s*·\s*tek güçlü hatıra/i);
});

test("hero referans marka sloganını kullanır ve eski memory-machine yapısını içermez", () => {
  const heroTitle = html.match(/<h1\b[^>]*id="hero-title"[^>]*>([\s\S]*?)<\/h1>/i);
  assert.ok(heroTitle, "hero başlığı bulunamadı");
  assert.match(heroTitle[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), /^Düğününüz sadece yaşanmasın\. Hatırlansın\.$/i);
  assert.doesNotMatch(html, /\bmemory-(?:machine|tile)\b/i);
  assert.doesNotMatch(html, /Gece biter|Anılar konuşmaya/i);
});

test("ortak referans akışı öne çıkanlar, altı paket, üç adım, CTA ve mobil hızlı işlem çubuğu içerir", () => {
  assert.equal((html.match(/\bclass="[^"]*\bfeatured-card\b[^"]*"/g) ?? []).length, 2);
  assert.equal((html.match(/\bclass="[^"]*\bpackage__link\b[^"]*"/g) ?? []).length, 6);
  assert.equal((html.match(/\bclass="[^"]*\bprocess-step\b[^"]*"/g) ?? []).length, 3);
  assert.match(html, /<div\b[^>]*class="[^"]*\bcontact-banner\b/);
  assert.match(html, /<nav\b[^>]*class="[^"]*\bmobile-action-bar\b[^>]*aria-label="Mobil hızlı işlemler"/i);
  assert.doesNotMatch(html, /\b(?:featured-card__badge|package__icon|mobile-reference)\b|Tümünü gör/i);
  assert.doesNotMatch(html, /mobile-reference\.css/i);
});

test("iletişim alanı formsuz ve doğrudan WhatsApp odaklıdır", () => {
  const contactSection = html.match(/<section\b[^>]*id="iletisim"[^>]*>([\s\S]*?)<\/section>/i);
  assert.ok(contactSection, "iletişim section bulunamadı");
  assert.doesNotMatch(contactSection[1], /<form\b/i);
  assert.doesNotMatch(contactSection[1], /\bcontact-card(?:__icon|__kicker)?\b|<h3\b/i);
  assert.doesNotMatch(html, /<(?:input|select|textarea)\b/i);
  assert.match(
    contactSection[1],
    /<a\b[^>]*href="https:\/\/wa\.me\/905386888306"[^>]*data-whatsapp-general[^>]*>/i,
  );
});

test("kaldırılması istenen hizmet geçiş çizgisi ve ayrı iletişim sayfası yoktur", async () => {
  assert.doesNotMatch(html, /\bconcept-line\b/);
  assert.doesNotMatch(html, /(?:href|src)=["'][^"']*iletisim\.html/i);
  await assert.rejects(stat(new URL("iletisim.html", projectRoot)), (error) => error.code === "ENOENT");
});

test("marka iletişim bilgileri ve güvenli dış bağlantılar görünür", () => {
  assert.match(html, /href="tel:\+905386888306"/);
  assert.match(html, /href="mailto:info@konseptgelsin\.com"/);
  assert.match(html, /href="https:\/\/wa\.me\/905386888306"/);
  for (const link of html.matchAll(/<a\b([^>]*)target="_blank"([^>]*)>/gi)) {
    assert.match(`${link[1]} ${link[2]}`, /rel="[^"]*noopener[^"]*noreferrer[^"]*"/i);
  }
});
