import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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
const serviceMobileImages = serviceImages.map((imageName) => imageName.replace(".webp", "-mobile.webp"));
const serviceResponsiveImages = serviceImages.flatMap((imageName) => [
  imageName.replace(".webp", "-480w.avif"),
  imageName.replace(".webp", "-480w.webp"),
]);
const serviceAvifImages = serviceImages.map((imageName) => imageName.replace(".webp", ".avif"));
const heroFallbackImages = ["hero-still-life-v2.png", "hero-still-life-mobile-v3.png"];
const heroResponsiveImages = [
  "hero-still-life-mobile-v3-480w.avif",
  "hero-still-life-mobile-v3-480w.webp",
  "hero-still-life-mobile-v3-768w.avif",
  "hero-still-life-mobile-v3-768w.webp",
  "hero-still-life-v2-960w.avif",
  "hero-still-life-v2-960w.webp",
  "hero-still-life-v2-1440w.avif",
  "hero-still-life-v2-1440w.webp",
];
const imageDirectory = "storage/public-media/images/";
const imageUrl = "/media/images/";

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
const packagePages = new Map(
  await Promise.all(
    services.map(async ({ page }) => [page, await readProjectFile(page)]),
  ),
);

test("hizmet veri kaynağı altı eksiksiz ve benzersiz kayıt içerir", () => {
  assert.equal(services.length, 6);
  assert.deepEqual(
    services.map(({ number }) => number),
    ["01", "02", "03", "04", "05", "06"],
  );
  assert.equal(new Set(services.map(({ id }) => id)).size, services.length);
  assert.equal(new Set(services.map(({ name }) => name)).size, services.length);
  assert.equal(new Set(services.map(({ page }) => page)).size, services.length);
  assert.deepEqual(
    services.filter(({ featured }) => featured).map(({ id }) => id),
    ["qr-anı-albumu", "sesli-ani-telefonu"],
  );

  for (const service of services) {
    assert.match(service.id, /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u);
    assert.match(service.page, /^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/);
    assert.match(service.image, /^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/);
    assert.match(service.mobileImage, /^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/);
    assert.equal(typeof service.featured, "boolean", service.id + ".featured boolean olmalı");
    for (const field of ["name", "shortName", "summary", "description", "promise", "imageAlt"]) {
      assert.equal(typeof service[field], "string", `${service.id}.${field} metin olmalı`);
      assert.ok(service[field].trim().length > 2, `${service.id}.${field} boş bırakılamaz`);
      assert.doesNotMatch(service[field], /(?:lorem ipsum|todo|\[[^\]]+\])/i);
    }
    assert.ok(Array.isArray(service.contents));
    assert.ok(service.contents.length >= 5, `${service.id} en az beş kapsam maddesi içermeli`);
    assert.ok(service.contents.every((item) => typeof item === "string" && item.trim().length > 2));
  }
});

test("ana sayfa altı hizmeti tek birleşik kart gridinde sunar", () => {
  const packageCards = [
    ...homeHtml.matchAll(/<a\b([^>]*)class="([^"]*\bpackage\b[^"]*)"([^>]*)>([\s\S]*?)<\/a>/g),
  ];

  assert.doesNotMatch(homeHtml, /\bmemory-(?:machine|tile)\b/);
  assert.equal(packageCards.length, 6);
  assert.equal(
    (
      homeHtml.match(
        /<span\b[^>]*class="[^"]*\bpackage__badge\b[^"]*"[^>]*>Öne çıkan<\/span>/g,
      ) ?? []
    ).length,
    2,
  );
  assert.doesNotMatch(homeHtml, /\b(?:featured-grid|featured-card|package__link)\b/);
  assert.doesNotMatch(homeHtml, /\bpackage--(?:wide|compact|sage|yellow|ink|paper|orange|blue)\b/);

  for (const service of services) {
    const card = packageCards.find((match) => {
      const attributes = `${match[1]} ${match[3]}`;
      return (
        attributes.includes(`id="${service.id}"`) &&
        attributes.includes(`href="${service.page}"`)
      );
    });

    assert.ok(card, `${service.id} birleşik paket kartında bulunamadı`);
    assert.match(
      card[4],
      new RegExp(
        `<h3\\b[^>]*>[\\s\\S]*${escapeRegExp(service.shortName)}[\\s\\S]*<\\/h3>`,
      ),
    );
    assert.match(card[4], new RegExp(escapeRegExp(service.name)));
    assert.match(
      card[4],
      new RegExp(
        `<p\\b[^>]*class="[^"]*\\bpackage__summary\\b[^"]*"[^>]*>${escapeRegExp(service.summary)}<\\/p>`,
      ),
    );
    if (service.featured) {
      assert.match(
        card[4],
        /<span\b[^>]*class="[^"]*\bpackage__badge\b[^"]*"[^>]*>Öne çıkan<\/span>/,
      );
    } else {
      assert.doesNotMatch(card[4], /\bpackage__badge\b|Öne çıkan/);
    }
  }
  const packageSection = homeHtml.match(/<section\b[^>]*id="paketler"[^>]*>([\s\S]*?)<\/section>/i);
  assert.ok(packageSection, "paket alanı bulunamadı");
  assert.doesNotMatch(packageSection[1], /<(?:blockquote|details)\b|\bpackage__cta\b|data-whatsapp-service/i);
});

test("hero ve paketler responsive AVIF/WebP kaynaklarını bütçe içinde kullanır", async () => {
  const sourceTags = [...homeHtml.matchAll(/<source\b[^>]*>/g)].map((match) => match[0]);
  const linkTags = [...homeHtml.matchAll(/<link\b[^>]*>/g)].map((match) => match[0]);

  for (const extension of ["avif", "webp"]) {
    const mobile480 = `/media/images/hero-still-life-mobile-v3-480w.${extension}`;
    const mobile768 = `/media/images/hero-still-life-mobile-v3-768w.${extension}`;
    const desktop960 = `/media/images/hero-still-life-v2-960w.${extension}`;
    const desktop1440 = `/media/images/hero-still-life-v2-1440w.${extension}`;
    const mobileSource = sourceTags.find((tag) => tag.includes(mobile480));
    const desktopSource = sourceTags.find((tag) => tag.includes(desktop960));

    assert.ok(mobileSource, `${extension} mobil hero source eksik`);
    assert.match(mobileSource, new RegExp(`type="image/${extension}"`));
    assert.match(mobileSource, /media="\(max-width: 47\.999rem\)"/);
    assert.match(
      mobileSource,
      new RegExp(
        `srcset="${escapeRegExp(mobile480)} 480w, ${escapeRegExp(mobile768)} 768w"`,
      ),
    );
    assert.match(mobileSource, /sizes="100vw"/);

    assert.ok(desktopSource, `${extension} masaüstü hero source eksik`);
    assert.match(desktopSource, new RegExp(`type="image/${extension}"`));
    assert.match(desktopSource, /media="\(min-width: 48rem\)"/);
    assert.match(
      desktopSource,
      new RegExp(
        `srcset="${escapeRegExp(desktop960)} 960w, ${escapeRegExp(desktop1440)} 1440w"`,
      ),
    );
    assert.match(desktopSource, /sizes="100vw"/);
  }

  for (const [viewport, firstWidth, secondWidth] of [
    ["mobile", "480", "768"],
    ["desktop", "960", "1440"],
  ]) {
    const stem =
      viewport === "mobile"
        ? "hero-still-life-mobile-v3"
        : "hero-still-life-v2";
    const preload = linkTags.find(
      (tag) =>
        tag.includes('rel="preload"') &&
        tag.includes(`/media/images/${stem}-${firstWidth}w.avif`),
    );

    assert.ok(preload, `${viewport} AVIF hero preload eksik`);
    assert.match(preload, /as="image"/);
    assert.match(preload, /type="image\/avif"/);
    assert.match(
      preload,
      new RegExp(
        `imagesrcset="/media/images/${stem}-${firstWidth}w\\.avif ${firstWidth}w, /media/images/${stem}-${secondWidth}w\\.avif ${secondWidth}w"`,
      ),
    );
    assert.match(preload, /imagesizes="100vw"/);
    assert.match(preload, /fetchpriority="high"/);
    assert.match(
      preload,
      viewport === "mobile"
        ? /media="\(max-width: 47\.999rem\)"/
        : /media="\(min-width: 48rem\)"/,
    );
  }

  for (const imageName of serviceImages) {
    const imagePath = `${imageDirectory}${imageName}`;
    const publicUrl = `${imageUrl}${imageName}`;
    assert.ok(await projectFileExists(imagePath), `${imagePath} bulunamadı`);
    const imageStats = await stat(new URL(imagePath, projectRoot));
    assert.ok(imageStats.size > 1_024, `${imagePath} boş veya geçersiz görünüyor`);
    const uses = homeHtml.match(new RegExp(`src="${escapeRegExp(publicUrl)}"`, "g")) ?? [];
    assert.equal(uses.length, 1, `${imagePath} paket alanında bir kez kullanılmalı`);
  }

  for (const imageName of serviceMobileImages) {
    const imagePath = `${imageDirectory}${imageName}`;
    assert.ok(await projectFileExists(imagePath), `${imagePath} bulunamadı`);
    const imageStats = await stat(new URL(imagePath, projectRoot));
    assert.ok(imageStats.size > 1_024, `${imagePath} boş veya geçersiz görünüyor`);
    assert.ok(imageStats.size <= 100 * 1_024, `${imagePath} 100 KiB mobil kart bütçesini aşıyor`);
  }

  for (const imageName of [...serviceResponsiveImages, ...serviceAvifImages]) {
    const imagePath = `${imageDirectory}${imageName}`;
    assert.ok(await projectFileExists(imagePath), `${imagePath} bulunamadı`);
    const imageStats = await stat(new URL(imagePath, projectRoot));
    assert.ok(imageStats.size > 1_024, `${imagePath} boş veya geçersiz görünüyor`);
  }

  for (const imageName of serviceResponsiveImages) {
    const publicUrl = `${imageUrl}${imageName}`;
    const sourceTag = sourceTags.find((tag) => tag.includes(publicUrl));
    assert.ok(sourceTag, `${publicUrl} paket srcset kaynağında bulunamadı`);
    assert.match(sourceTag, /srcset="[^"]+\b480w(?:,|")/);
    assert.match(sourceTag, /\bsizes="[^"]+"/);

    const imageStats = await stat(new URL(`${imageDirectory}${imageName}`, projectRoot));
    assert.ok(
      imageStats.size <= 100 * 1_024,
      `${imageName} 100 KiB mobil kart bütçesini aşıyor`,
    );
  }

  for (const heroImage of heroFallbackImages) {
    const heroImagePath = `${imageDirectory}${heroImage}`;
    assert.ok(await projectFileExists(heroImagePath), `${heroImagePath} bulunamadı`);
    const heroImageStats = await stat(new URL(heroImagePath, projectRoot));
    assert.ok(heroImageStats.size > 1_024, `${heroImagePath} boş veya geçersiz görünüyor`);
  }

  for (const heroImage of heroResponsiveImages) {
    const heroImagePath = `${imageDirectory}${heroImage}`;
    const publicUrl = `${imageUrl}${heroImage}`;
    assert.ok(await projectFileExists(heroImagePath), `${heroImagePath} bulunamadı`);
    const heroImageStats = await stat(new URL(heroImagePath, projectRoot));
    assert.ok(heroImageStats.size > 1_024, `${heroImagePath} boş veya geçersiz görünüyor`);
    assert.match(homeHtml, new RegExp(`(?:href|src|srcset)="[^"]*${escapeRegExp(publicUrl)}`));
  }

  for (const width of [480, 768]) {
    for (const extension of ["avif", "webp"]) {
      const mobileHeroPath =
        `${imageDirectory}hero-still-life-mobile-v3-${width}w.${extension}`;
      const mobileHeroStats = await stat(new URL(mobileHeroPath, projectRoot));
      assert.ok(
        mobileHeroStats.size <= 500 * 1_024,
        `${mobileHeroPath} 500 KiB mobil hero bütçesini aşıyor`,
      );
    }
  }

  const faviconStats = await stat(new URL(`${imageDirectory}ui/favicon.svg`, projectRoot));
  assert.ok(faviconStats.size <= 10 * 1_024, "favicon.svg 10 KiB bütçesini aşıyor");
});

test("landing page altı ayrı paket detayına bağlanır ve iletişim aynı sayfada kalır", async () => {
  assert.equal(await projectFileExists("iletisim.html"), false);
  assert.doesNotMatch(homeHtml, /(?:href|src)=["'][^"']*iletisim\.html/i);

  assert.deepEqual([...packagePages.keys()], services.map(({ page }) => page));
  for (const service of services) {
    assert.equal(await projectFileExists(service.page), true, `${service.page} bulunamadı`);
    const detailHtml = packagePages.get(service.page);
    assert.match(
      detailHtml,
      new RegExp(`<h1[^>]*>${escapeRegExp(service.shortName)}<\\/h1>`),
    );
    assert.match(detailHtml, new RegExp(escapeRegExp(service.description)));
    assert.match(detailHtml, new RegExp(escapeRegExp(service.promise)));
    assert.match(detailHtml, new RegExp(`data-default-service="${escapeRegExp(service.name)}"`));
    assert.match(detailHtml, new RegExp(`data-quote-service="${escapeRegExp(service.name)}"`));
    assert.match(detailHtml, new RegExp(`src="${escapeRegExp(imageUrl + service.image)}"`));
    for (const item of service.contents) {
      assert.match(detailHtml, new RegExp(`<li>${escapeRegExp(item)}<\\/li>`));
    }
  }
});
