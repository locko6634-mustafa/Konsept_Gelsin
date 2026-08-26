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

test("header navigasyonu hizmetler ve iletişim bölümlerine masaüstü ve mobil erişim sağlar", () => {
  const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i);
  assert.ok(header, "header bulunamadı");
  assert.equal((header[1].match(/href="#paketler"/g) ?? []).length, 2);
  assert.equal((header[1].match(/href="#iletisim"/g) ?? []).length, 2);
  assert.match(header[1], /<button\b[^>]*aria-controls="mobile-menu"[^>]*aria-expanded="false"/i);
  assert.match(header[1], /<nav\b[^>]*id="mobile-menu"[^>]*data-open="false"/i);
});

test("kaldırılması istenen hero alt metni görünmez", () => {
  assert.doesNotMatch(html, /6 hizmet\s*·\s*tek güçlü hatıra/i);
});

test("hero Excel marka sloganını kullanır ve eski memory-machine yapısını içermez", () => {
  assert.match(html, /<h1[^>]*>Düğününüzde herkesin bir anısı kalsın\.<\/h1>/i);
  assert.doesNotMatch(html, /\bmemory-(?:machine|tile)\b/i);
  assert.doesNotMatch(html, /Gece biter|Anılar konuşmaya/i);
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
