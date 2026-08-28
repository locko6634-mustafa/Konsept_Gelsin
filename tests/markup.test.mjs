import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { validateMarkup } from "../tools/markup-check.mjs";
import { services } from "../tools/page-manifest.mjs";

const projectRoot = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", projectRoot), "utf8");
const pages = new Map([["index.html", html]]);

function attribute(attributes, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attributes.match(
    new RegExp(
      `(?:^|\\s)${escapedName}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+)))?`,
      "i",
    ),
  );
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function startTags(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, "gi"))].map((match) => ({
    attributes: match[1],
    source: match[0],
  }));
}

function visibleText(source) {
  return source
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("index.html semantik ve bağlantı sözleşmesini karşılar", () => {
  assert.deepEqual(validateMarkup("index.html", html, pages), []);
  assert.match(html, /<main\b[^>]*id="main-content"[^>]*tabindex="-1"[^>]*>/i);
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

test("hero yalnız paket keşif CTA'sını sunar ve kaldırılan alt metni göstermez", () => {
  const hero = html.match(/<section\b[^>]*class="[^"]*\bhero\b[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
  assert.ok(hero, "hero bulunamadı");
  const heroLinks = startTags(hero[1], "a");

  assert.equal(heroLinks.length, 1);
  assert.equal(attribute(heroLinks[0].attributes, "href"), "#paketler");
  assert.match(hero[1], /Paketleri keşfet/i);
  assert.doesNotMatch(hero[1], /data-quote-trigger|data-whatsapp/i);
  assert.doesNotMatch(html, /6 hizmet\s*·\s*tek güçlü hatıra/i);
});

test("hero referans marka sloganını kullanır ve eski memory-machine yapısını içermez", () => {
  const heroTitle = html.match(/<h1\b[^>]*id="hero-title"[^>]*>([\s\S]*?)<\/h1>/i);
  assert.ok(heroTitle, "hero başlığı bulunamadı");
  assert.match(heroTitle[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), /^Düğününüz sadece yaşanmasın\. Hatırlansın\.$/i);
  assert.doesNotMatch(html, /\bmemory-(?:machine|tile)\b/i);
  assert.doesNotMatch(html, /Gece biter|Anılar konuşmaya/i);
});

test("birleşik paket gridi, yeni süreç ve teklif tetikleyicili mobil dock görünür", () => {
  const packageLinks = startTags(html, "a").filter(({ attributes }) =>
    (attribute(attributes, "class") ?? "").split(/\s+/).includes("package"),
  );
  const dock = html.match(/<nav\b([^>]*data-mobile-dock[^>]*)>([\s\S]*?)<\/nav>/i);

  assert.equal(packageLinks.length, 6);
  assert.equal((html.match(/\bclass="[^"]*\bpackage__badge\b[^"]*"/g) ?? []).length, 2);
  assert.equal((html.match(/\bclass="[^"]*\bprocess-step\b[^"]*"/g) ?? []).length, 3);
  assert.match(html, />Konsepti seçin</);
  assert.match(html, />Tarih ve kurulumu netleştirelim</);
  assert.match(html, />Anılarınızı teslim edelim</);
  assert.match(html, /<div\b[^>]*class="[^"]*\bcontact-banner\b/);
  assert.ok(dock, "data-mobile-dock hızlı işlem çubuğu bulunamadı");
  assert.match(dock[1], /\bclass="[^"]*\bmobile-action-bar\b[^"]*"/i);
  assert.equal(attribute(dock[1], "aria-label"), "Mobil hızlı işlemler");
  assert.match(dock[2], /href="#paketler"/);
  assert.match(dock[2], /data-quote-trigger/);
  assert.match(visibleText(dock[2]), /Paketler.*Fiyat ve uygunluk sor/i);
  assert.doesNotMatch(
    html,
    /\b(?:featured-grid|featured-card|featured-card__badge|package__link|package__icon|mobile-reference)\b|Tümünü gör/i,
  );
  assert.doesNotMatch(html, /mobile-reference\.css/i);
});

test("erişilebilir teklif dialogu üç adımı ve JavaScript'siz WhatsApp fallback'ini taşır", () => {
  const contactSection = html.match(/<section\b[^>]*id="iletisim"[^>]*>([\s\S]*?)<\/section>/i);
  const dialog = html.match(/<dialog\b([^>]*)>([\s\S]*?)<\/dialog>/i);

  assert.ok(contactSection, "iletişim section bulunamadı");
  assert.ok(dialog, "teklif dialogu bulunamadı");
  assert.equal(startTags(html, "dialog").length, 1);
  assert.equal(attribute(dialog[1], "id"), "quote-dialog");
  assert.ok((attribute(dialog[1], "class") ?? "").split(/\s+/).includes("quote-dialog"));
  assert.notEqual(attribute(dialog[1], "data-quote-dialog"), null);
  assert.equal(attribute(dialog[1], "data-default-service"), "");
  assert.equal(attribute(dialog[1], "aria-labelledby"), "quote-dialog-title");
  assert.equal(attribute(dialog[1], "aria-describedby"), "quote-dialog-description");
  assert.match(
    dialog[2],
    /<h2 id="quote-dialog-title">Fiyat ve uygunluğu birlikte netleştirelim\.<\/h2>/,
  );
  assert.match(
    dialog[2],
    /<p id="quote-dialog-description">Üç kısa bilgiyle WhatsApp mesajınızı hazırlayalım\.<\/p>/,
  );

  const forms = startTags(dialog[2], "form").filter(
    ({ attributes }) => attribute(attributes, "data-quote-form") !== null,
  );
  assert.equal(forms.length, 1);
  assert.equal(startTags(html, "form").length, 1);
  assert.equal(attribute(forms[0].attributes, "action"), null);
  assert.equal(attribute(forms[0].attributes, "method"), null);

  const progress = startTags(dialog[2], "progress").find(
    ({ attributes }) => attribute(attributes, "data-quote-progress") !== null,
  );
  assert.ok(progress, "üç adımlı ilerleme göstergesi bulunamadı");
  assert.equal(attribute(progress.attributes, "max"), "3");
  assert.equal(attribute(progress.attributes, "value"), "1");

  const fieldsets = [
    ...dialog[2].matchAll(/<fieldset\b([^>]*)>([\s\S]*?)<\/fieldset>/gi),
  ];
  assert.equal(fieldsets.length, 3);
  assert.deepEqual(
    fieldsets.map((fieldset) => attribute(fieldset[1], "data-quote-step")),
    ["date", "city", "package"],
  );
  for (const [, , fieldsetBody] of fieldsets) {
    const legend = fieldsetBody.match(/<legend\b[^>]*>([\s\S]*?)<\/legend>/i);
    assert.ok(legend, "her teklif adımı görünür legend içermeli");
    assert.ok(visibleText(legend[1]).length > 2, "legend metni boş bırakılamaz");
  }

  const inputs = startTags(dialog[2], "input");
  const selects = startTags(dialog[2], "select");
  const labels = [...dialog[2].matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)].map(
    (match) => ({ attributes: match[1], text: visibleText(match[2]) }),
  );
  const dateInput = inputs.find(
    ({ attributes }) => attribute(attributes, "data-quote-date") !== null,
  );
  const dateUnknown = inputs.find(
    ({ attributes }) => attribute(attributes, "data-quote-date-unknown") !== null,
  );
  const cityInput = inputs.find(
    ({ attributes }) => attribute(attributes, "data-quote-city") !== null,
  );
  const cityUnknown = inputs.find(
    ({ attributes }) => attribute(attributes, "data-quote-city-unknown") !== null,
  );
  const serviceSelect = selects.find(
    ({ attributes }) => attribute(attributes, "data-quote-service") !== null,
  );

  for (const field of [dateInput, dateUnknown, cityInput, cityUnknown, serviceSelect]) {
    assert.ok(field, "teklif alanı eksik");
    assert.ok(attribute(field.attributes, "name"), "teklif alanı name içermeli");
  }
  for (const field of [dateInput, dateUnknown, cityInput, cityUnknown, serviceSelect]) {
    const id = attribute(field.attributes, "id");
    assert.ok(id, "teklif alanı id içermeli");
    assert.ok(
      labels.some(({ attributes }) => attribute(attributes, "for") === id),
      "#" + id + " görünür label ile ilişkilendirilmeli",
    );
  }
  for (const unknownField of [dateUnknown, cityUnknown]) {
    assert.equal(attribute(unknownField.attributes, "type"), "checkbox");
    const id = attribute(unknownField.attributes, "id");
    const label = labels.find(({ attributes }) => attribute(attributes, "for") === id);
    assert.ok(label, "Henüz net değil seçeneği görünür label içinde olmalı");
    assert.match(label.text, /Henüz net değil/i);
  }

  const optionValues = [...dialog[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
    .map((match) => attribute(match[1], "value"))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "tr"));
  const expectedOptionValues = [...services.map(({ name }) => name), "Kararsızım"].sort(
    (left, right) => left.localeCompare(right, "tr"),
  );
  assert.deepEqual(optionValues, expectedOptionValues);
  assert.match(dialog[2], /<option value="Kararsızım" selected>Kararsızım<\/option>/);
  assert.equal((dialog[2].match(/\sselected(?:\s|>)/g) ?? []).length, 1);

  for (const control of ["data-quote-next", "data-quote-back"]) {
    const button = startTags(dialog[2], "button").find(
      ({ attributes }) => attribute(attributes, control) !== null,
    );
    assert.ok(button, control + " kontrolü eksik");
    assert.equal(attribute(button.attributes, "type"), "button");
  }
  const close = dialog[2].match(/<button\b([^>]*data-quote-close[^>]*)>([\s\S]*?)<\/button>/i);
  assert.ok(close, "dialog kapatma düğmesi bulunamadı");
  assert.equal(attribute(close[1], "type"), "button");
  assert.equal(attribute(close[1], "aria-label"), "Teklif formunu kapat");
  assert.match(visibleText(close[2]), /^Kapat$/);

  const finalLink = startTags(dialog[2], "a").find(
    ({ attributes }) => attribute(attributes, "data-quote-whatsapp") !== null,
  );
  assert.ok(finalLink, "WhatsApp final bağlantısı bulunamadı");
  assert.match(
    attribute(finalLink.attributes, "href"),
    /^https:\/\/wa\.me\/905386888306\?text=.+/,
  );

  const quoteTriggers = startTags(html, "a").filter(
    ({ attributes }) => attribute(attributes, "data-quote-trigger") !== null,
  );
  assert.equal(quoteTriggers.length, 2, "iletişim ve mobil dock teklif tetikleyicileri eksik");
  assert.match(contactSection[1], /data-quote-trigger/);
  for (const trigger of quoteTriggers) {
    assert.notEqual(attribute(trigger.attributes, "data-quote-service"), null);
    assert.match(
      attribute(trigger.attributes, "href"),
      /^https:\/\/wa\.me\/905386888306\?text=.+/,
    );
    assert.equal(attribute(trigger.attributes, "target"), "_blank");
    const rel = new Set((attribute(trigger.attributes, "rel") ?? "").split(/\s+/));
    assert.ok(rel.has("noopener") && rel.has("noreferrer"));
  }
  assert.doesNotMatch(dialog[2], /<textarea\b/i);
});

test("kaldırılması istenen hizmet geçiş çizgisi ve ayrı iletişim sayfası yoktur", async () => {
  assert.doesNotMatch(html, /\bconcept-line\b/);
  assert.doesNotMatch(html, /(?:href|src)=["'][^"']*iletisim\.html/i);
  await assert.rejects(stat(new URL("iletisim.html", projectRoot)), (error) => error.code === "ENOENT");
});

test("marka iletişim bilgileri ve güvenli dış bağlantılar görünür", () => {
  assert.match(html, /href="tel:\+905386888306"/);
  assert.match(html, /href="mailto:info@konseptgelsin\.com"/);
  assert.match(html, /href="https:\/\/wa\.me\/905386888306\?text=.+?"/);
  for (const link of html.matchAll(/<a\b([^>]*)target="_blank"([^>]*)>/gi)) {
    assert.match(`${link[1]} ${link[2]}`, /rel="[^"]*noopener[^"]*noreferrer[^"]*"/i);
  }
});
