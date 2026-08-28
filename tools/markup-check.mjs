import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { pageNames } from "./page-manifest.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function withoutComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function tags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, "gi"))].map((match) => ({
    attributes: match[1],
    source: match[0],
  }));
}

function attribute(attributes, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${escapedName}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+)))?`, "i"),
  );
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function count(html, expression) {
  return (html.match(expression) ?? []).length;
}

function visibleText(source) {
  return source
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function idSet(html) {
  return new Set(tags(html, "[a-z][a-z0-9:-]*").map(({ attributes }) => attribute(attributes, "id")).filter(Boolean));
}

function allStartTags(html) {
  return [...html.matchAll(/<([a-z][a-z0-9:-]*)\b([^>]*)>/gi)].map((match) => ({
    name: match[1].toLowerCase(),
    attributes: match[2],
    source: match[0],
  }));
}

function fragmentTarget(href, currentPage) {
  if (href.startsWith("#")) return { page: currentPage, id: href.slice(1) };
  const match = href.match(/^([^?#]+\.html)#(.+)$/i);
  return match ? { page: path.basename(match[1]), id: match[2] } : null;
}

export function validateMarkup(pageName, originalHtml, allPages = new Map([[pageName, originalHtml]])) {
  const html = withoutComments(originalHtml);
  const issues = [];
  const add = (message) => issues.push(`${pageName}: ${message}`);
  const startTags = allStartTags(html);
  const metaTags = tags(html, "meta");
  const ids = startTags.map(({ attributes }) => attribute(attributes, "id")).filter(Boolean);
  const idsOnPage = new Set(ids);

  if (!/^<!doctype html>/i.test(html.trimStart())) add("HTML5 doctype eksik");
  if (!/<html\b[^>]*\blang=["']tr["']/i.test(html)) add('html lang="tr" olmalı');
  if (!metaTags.some(({ attributes }) => attribute(attributes, "charset")?.toLowerCase() === "utf-8")) {
    add("UTF-8 charset bildirimi eksik");
  }
  const viewport = metaTags.find(({ attributes }) => attribute(attributes, "name")?.toLowerCase() === "viewport");
  if (!viewport || !attribute(viewport.attributes, "content")?.includes("width=device-width")) {
    add("responsive viewport bildirimi eksik");
  }
  if (count(html, /<title\b[^>]*>[\s\S]*?<\/title>/gi) !== 1) add("tam bir title öğesi bulunmalı");
  const description = metaTags.find(({ attributes }) => attribute(attributes, "name")?.toLowerCase() === "description");
  if (!description || (attribute(description.attributes, "content")?.trim().length ?? 0) < 40) {
    add("anlamlı meta description eksik");
  }
  if (count(html, /<main\b/gi) !== 1) add("tam olarak bir main öğesi bulunmalı");
  if (count(html, /<h1\b/gi) !== 1) add("tam olarak bir h1 bulunmalı");
  if (!/<a\b[^>]*class=["'][^"']*\bskip-link\b[^"']*["'][^>]*href=["']#main-content["']/i.test(html)) {
    add("ana içeriğe giden skip-link eksik");
  }
  if (new Set(ids).size !== ids.length) {
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    add(`yinelenen id: ${duplicates.join(", ")}`);
  }
  if (!idsOnPage.has("main-content")) add("main-content kimliği eksik");
  if (/\son[a-z]+\s*=/i.test(html)) add("inline event handler kullanılmamalı");
  if (/\sstyle\s*=/i.test(html)) add("inline style kullanılmamalı");

  for (const section of tags(html, "section")) {
    const labelledBy = attribute(section.attributes, "aria-labelledby");
    if (!labelledBy) add(`section aria-labelledby içermeli (${section.source.slice(0, 90)})`);
    else if (!idsOnPage.has(labelledBy)) add(`section etiketi bulunamadı: #${labelledBy}`);
  }

  for (const nav of tags(html, "nav")) {
    if (!attribute(nav.attributes, "aria-label") && !attribute(nav.attributes, "aria-labelledby")) {
      add("her nav erişilebilir bir ad taşımalı");
    }
  }

  for (const button of tags(html, "button")) {
    if (!attribute(button.attributes, "type")) add(`button için açık type gerekli (${button.source})`);
  }

  for (const image of tags(html, "img")) {
    if (attribute(image.attributes, "alt") === null) add(`img için alt niteliği gerekli (${image.source})`);
    const width = Number.parseInt(attribute(image.attributes, "width") ?? "", 10);
    const height = Number.parseInt(attribute(image.attributes, "height") ?? "", 10);
    if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
      add(`img için pozitif width ve height gerekli (${image.source})`);
    }
  }

  for (const script of tags(html, "script")) {
    if (!attribute(script.attributes, "src")) add("inline script kullanılmamalı");
    if (attribute(script.attributes, "type") !== "module") add("sayfa scriptleri ES module olmalı");
  }

  const labels = new Set(tags(html, "label").map(({ attributes }) => attribute(attributes, "for")).filter(Boolean));
  for (const fieldName of ["input", "select", "textarea"]) {
    for (const field of tags(html, fieldName)) {
      if (attribute(field.attributes, "type") === "hidden") continue;
      const id = attribute(field.attributes, "id");
      if (!id) add(`${fieldName} id içermeli (${field.source})`);
      else if (!labels.has(id)) add(`${fieldName} etiketsiz: #${id}`);
      if (!attribute(field.attributes, "name")) add(`${fieldName} name içermeli: #${id ?? "?"}`);
    }
  }

  if (tags(html, "form").length > 0) add("landing page form içermemeli");
  if (/\bconcept-line\b/i.test(html)) add("kaldırılan hizmet geçiş çizgisi bulunmamalı");
  if (/(?:href|src)=["'][^"']*iletisim\.html/i.test(html)) add("ayrı iletişim sayfasına bağlantı bulunmamalı");

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attribute(match[1], "href");
    const ariaLabel = attribute(match[1], "aria-label");
    if (!href || href === "#" || /^javascript:/i.test(href)) add("bağlantı geçerli href içermeli");
    if (!ariaLabel && !visibleText(match[2])) add(`bağlantının erişilebilir adı yok: ${match[0].slice(0, 90)}`);

    if (attribute(match[1], "target") === "_blank") {
      const rel = new Set((attribute(match[1], "rel") ?? "").split(/\s+/));
      if (!rel.has("noopener") || !rel.has("noreferrer")) add(`yeni sekme bağlantısı güvenli rel içermeli: ${href}`);
    }

    const target = href ? fragmentTarget(href, pageName) : null;
    if (target) {
      const targetHtml = allPages.get(target.page);
      if (!targetHtml) add(`fragment sayfası bulunamadı: ${target.page}`);
      else if (!idSet(withoutComments(targetHtml)).has(target.id)) add(`fragment hedefi bulunamadı: ${href}`);
    }
  }

  for (const { attributes } of startTags) {
    for (const relation of ["aria-controls", "aria-labelledby"]) {
      const references = (attribute(attributes, relation) ?? "").split(/\s+/).filter(Boolean);
      for (const reference of references) {
        if (!idsOnPage.has(reference)) add(`${relation} hedefi bulunamadı: #${reference}`);
      }
    }
  }

  return issues;
}

async function run() {
  const pages = new Map(
    await Promise.all(
      pageNames.map(async (pageName) => [pageName, await readFile(path.join(projectRoot, pageName), "utf8")]),
    ),
  );
  const issues = [...pages].flatMap(([pageName, html]) => validateMarkup(pageName, html, pages));

  if (issues.length > 0) {
    console.error(`HTML sözleşme kontrolü ${issues.length} sorun buldu:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`HTML sözleşme kontrolü geçti (${pages.size} sayfa).`);
  }
}

const isCommandLine = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCommandLine) await run();
