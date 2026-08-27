import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { services } from "./page-manifest.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2] ?? "--check";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderScopeItems(contents) {
  return contents.map((item) => `                <li>${escapeHtml(item)}</li>`).join("\n");
}

export function renderPackagePage(service) {
  const name = escapeHtml(service.name);
  const shortName = escapeHtml(service.shortName);
  const summary = escapeHtml(service.summary);
  const description = escapeHtml(service.description);
  const promise = escapeHtml(service.promise);
  const image = escapeHtml(service.image);
  const mobileImage = escapeHtml(service.mobileImage);
  const imageAlt = escapeHtml(service.imageAlt);
  const page = escapeHtml(service.page);
  const canonical = `https://konseptgelsin.com/${page}`;
  const metaDescription = escapeHtml(`${service.summary} ${service.name} paketinin kapsamını ve örnek medya alanını inceleyin.`);

  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fff8ee">
    <meta name="description" content="${metaDescription}">
    <meta name="robots" content="index, follow">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="tr_TR">
    <meta property="og:title" content="${name} | Konsept Gelsin">
    <meta property="og:description" content="${summary}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="https://konseptgelsin.com/media/images/${image}">
    <link rel="canonical" href="${canonical}">
    <link rel="icon" href="/media/images/ui/favicon.svg" type="image/svg+xml">
    <link rel="preload" href="/media/images/${image}" as="image" type="image/webp" fetchpriority="high">
    <link rel="stylesheet" href="css/tokens.css">
    <link rel="stylesheet" href="css/base.css">
    <link rel="stylesheet" href="css/components.css">
    <link rel="stylesheet" href="css/pages/package-detail.css">
    <link rel="stylesheet" href="css/responsive.css">
    <link rel="stylesheet" href="css/motion.css">
    <title>${name} | Konsept Gelsin</title>
  </head>
  <body class="package-detail-page">
    <a class="skip-link" href="#main-content">Ana içeriğe geç</a>

    <header class="site-header">
      <div class="site-header__inner shell">
        <a class="brand" href="index.html" aria-label="Konsept Gelsin ana sayfa">
          <span class="brand__ink">Konsept</span>
          <span class="brand__accent">Gelsin</span>
          <svg class="brand__spark" aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-sparkle"></use></svg>
        </a>

        <nav class="desktop-nav" aria-label="Ana navigasyon">
          <a href="index.html#paketler">Paketler</a>
          <a href="index.html#iletisim">İletişim</a>
        </nav>
      </div>
    </header>

    <main id="main-content">
      <section class="package-detail-hero" aria-labelledby="package-title">
        <div class="package-detail-hero__inner shell">
          <div class="package-detail-hero__copy">
            <a class="package-detail__back" href="index.html#paketler">
              <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-chevron"></use></svg>
              Tüm paketlere dön
            </a>
            <p class="package-detail__eyebrow">Paket ${escapeHtml(service.number)} · ${shortName}</p>
            <h1 id="package-title">${name}</h1>
            <p class="package-detail__lead">${summary}</p>
            <div class="package-detail__actions">
              <a class="button button--whatsapp" href="https://wa.me/905386888306" data-whatsapp-service="${name}" target="_blank" rel="noopener noreferrer">
                <img src="/media/images/ui/whatsapp.svg" alt="" width="23" height="23">
                WhatsApp'tan Bilgi Al
              </a>
              <a class="text-link" href="#paket-kapsami">
                Paket kapsamını gör
                <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-arrow"></use></svg>
              </a>
            </div>
          </div>

          <figure class="package-detail-hero__media">
            <span class="package-detail-hero__number" aria-hidden="true">${escapeHtml(service.number)}</span>
            <picture>
              <source media="(max-width: 36rem)" srcset="/media/images/${mobileImage}" width="960" height="960">
              <img src="/media/images/${image}" alt="${imageAlt}" width="960" height="960" fetchpriority="high" decoding="async">
            </picture>
            <figcaption>Örnek görsel · Orijinal içerikle güncellenecek</figcaption>
          </figure>
        </div>
      </section>

      <section class="package-overview" id="paket-kapsami" aria-labelledby="overview-title">
        <div class="package-overview__grid shell">
          <div class="package-overview__copy">
            <p class="package-detail__eyebrow">Deneyimin özü</p>
            <h2 id="overview-title">${shortName} deneyimi nasıl çalışır?</h2>
            <p>${description}</p>
            <blockquote>
              <p>${promise}</p>
            </blockquote>
          </div>

          <div class="package-scope" aria-labelledby="scope-title">
            <p class="package-detail__eyebrow">Paket kapsamı</p>
            <h2 id="scope-title">Neler dahil?</h2>
            <ul>
${renderScopeItems(service.contents)}
            </ul>
          </div>
        </div>
      </section>

      <section class="package-media" aria-labelledby="media-title">
        <div class="shell">
          <div class="package-media__heading">
            <p class="package-detail__eyebrow">Geçici medya seçkisi</p>
            <h2 id="media-title">Paketi yakından görün</h2>
            <p>Bu örnek alanlarda şimdilik mevcut görselleri kullanıyoruz. Orijinal fotoğraf ve videolar hazır olduğunda aynı yerleşimde güncellenecek.</p>
          </div>

          <div class="package-media__grid">
            <figure class="package-media-card package-media-card--feature">
              <img src="/media/images/${image}" alt="" width="960" height="960" loading="lazy" decoding="async">
              <figcaption>Örnek detay görseli</figcaption>
            </figure>

            <figure class="package-media-card package-media-card--atmosphere">
              <picture>
                <source media="(max-width: 48rem)" srcset="/media/images/hero-still-life-mobile-v3.png" width="941" height="1672">
                <img src="/media/images/hero-still-life-v2.png" alt="Mum ışığında çiçekler ve Polaroid fotoğrafla hazırlanmış düğün masası" width="1672" height="941" loading="lazy" decoding="async">
              </picture>
              <figcaption>Örnek düğün atmosferi</figcaption>
            </figure>

            <figure class="package-media-card package-media-card--video">
              <div class="package-video-placeholder" role="img" aria-label="${name} için geçici video ön izleme alanı">
                <img src="/media/images/${image}" alt="" width="960" height="960" loading="lazy" decoding="async">
                <span class="package-video-placeholder__label">
                  <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-video"></use></svg>
                  <strong>Örnek video alanı</strong>
                  <small>Orijinal çekim eklenecek</small>
                </span>
              </div>
              <figcaption>Bu alan gerçek paket videosuyla güncellenecek.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section class="package-contact" id="iletisim" aria-labelledby="contact-title">
        <div class="package-contact__inner shell">
          <div>
            <p class="package-detail__eyebrow">Birlikte netleştirelim</p>
            <h2 id="contact-title">Bu paketi düğününüze uyarlayalım.</h2>
            <p>Tarih, mekan ve davetli planınıza göre kapsamı birlikte şekillendirelim.</p>
          </div>
          <a class="button button--ink" href="https://wa.me/905386888306" data-whatsapp-service="${name}" target="_blank" rel="noopener noreferrer">
            ${shortName} için bilgi al
            <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-arrow"></use></svg>
          </a>
        </div>
      </section>
    </main>

    <nav class="mobile-action-bar" aria-label="Mobil hızlı işlemler">
      <a class="mobile-action-bar__packages" href="index.html#paketler">
        <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-grid"></use></svg>
        Paketlere dön
      </a>
      <a class="mobile-action-bar__whatsapp" href="https://wa.me/905386888306" data-whatsapp-service="${name}" target="_blank" rel="noopener noreferrer">
        <img src="/media/images/ui/whatsapp.svg" alt="" width="28" height="28">
        WhatsApp
      </a>
    </nav>

    <footer class="site-footer">
      <div class="site-footer__inner shell">
        <a class="brand" href="index.html" aria-label="Konsept Gelsin ana sayfa"><span class="brand__ink">Konsept</span><span class="brand__accent">Gelsin</span></a>
        <p>Misafirlerinizin gözünden, sesinden ve sözünden daha fazla anı.</p>
        <p>© <span data-current-year></span> Konsept Gelsin</p>
      </div>
    </footer>

    <script type="module" src="js/package/app.js"></script>
  </body>
</html>
`;
}

async function readExisting(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

if (!new Set(["--check", "--write"]).has(mode)) {
  throw new Error("Kullanım: node tools/render-package-pages.mjs --check|--write");
}

const drift = [];
for (const service of services) {
  const target = path.join(projectRoot, service.page);
  const expected = renderPackagePage(service);

  if (mode === "--write") {
    await writeFile(target, expected, "utf8");
    continue;
  }

  const existing = await readExisting(target);
  if (existing !== expected) drift.push(service.page);
}

if (mode === "--write") {
  console.log(`${services.length} paket detay sayfası güncellendi.`);
} else if (drift.length > 0) {
  console.error(`Paket sayfası içerik sapması bulundu: ${drift.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Paket detay sayfaları içerik kaynağıyla eşleşiyor (${services.length} sayfa).`);
}
