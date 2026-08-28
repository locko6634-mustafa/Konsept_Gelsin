import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { services } from "./page-manifest.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2] ?? "--check";
const whatsappPhone = "905386888306";
const homeGridStartMarker = "          <!-- services-grid:start -->";
const homeGridEndMarker = "          <!-- services-grid:end -->";
const homeQuoteStartMarker = "    <!-- quote-dialog:start -->";
const homeQuoteEndMarker = "    <!-- quote-dialog:end -->";

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

function buildWhatsAppFallback(serviceName) {
  const request = serviceName
    ? `${serviceName} için fiyat ve uygunluk bilgisi almak istiyorum.`
    : "Düğün veya nişan etkinliğim için fiyat ve uygunluk bilgisi almak istiyorum.";
  const message = `Merhaba Konsept Gelsin, ${request}`;
  return `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
}

function renderPackageOptions(selectedServiceName) {
  const options = services.map(({ name }) => {
    const escapedName = escapeHtml(name);
    const selected = name === selectedServiceName ? " selected" : "";
    return `                  <option value="${escapedName}"${selected}>${escapedName}</option>`;
  });

  const undecidedSelected = selectedServiceName ? "" : " selected";
  options.push(
    `                  <option value="Kararsızım"${undecidedSelected}>Kararsızım</option>`,
  );
  return options.join("\n");
}

function serviceImageStem(image) {
  return image.replace(/\.webp$/i, "");
}

function renderHomePackageGrid() {
  const cards = services.map((service) => {
    const id = escapeHtml(service.id);
    const page = escapeHtml(service.page);
    const name = escapeHtml(service.name);
    const shortName = escapeHtml(service.shortName);
    const summary = escapeHtml(service.summary);
    const image = escapeHtml(service.image);
    const imageStem = escapeHtml(serviceImageStem(service.image));
    const imageAlt = escapeHtml(service.imageAlt);
    const badge = service.featured
      ? '\n                <span class="package__badge">Öne çıkan</span>'
      : "";

    return `            <a class="package" id="${id}" href="${page}" aria-label="${name} detaylarını inceleyin">
              <div class="package__visual">
                <picture>
                  <source type="image/avif" srcset="/media/images/${imageStem}-480w.avif 480w, /media/images/${imageStem}.avif 960w" sizes="(max-width: 47.99rem) calc((100vw - 3rem) / 2), (max-width: 74rem) calc((100vw - 4rem) / 3), 22rem">
                  <source type="image/webp" srcset="/media/images/${imageStem}-480w.webp 480w, /media/images/${image} 960w" sizes="(max-width: 47.99rem) calc((100vw - 3rem) / 2), (max-width: 74rem) calc((100vw - 4rem) / 3), 22rem">
                  <img src="/media/images/${image}" alt="${imageAlt}" width="960" height="960" loading="lazy" decoding="async">
                </picture>${badge}
              </div>
              <div class="package__content">
                <h3><span class="package__title--short">${shortName}</span><span class="package__title--full">${name}</span></h3>
                <p class="package__summary">${summary}</p>
                <span class="package__arrow" aria-hidden="true"><svg><use href="/media/images/ui/icons.svg#icon-chevron"></use></svg></span>
              </div>
            </a>`;
  });

  return `          <div class="package-layout">
${cards.join("\n\n")}
          </div>`;
}

function renderQuoteDialog(defaultServiceName = "") {
  const defaultService = escapeHtml(defaultServiceName);
  const whatsappFallback = buildWhatsAppFallback(defaultServiceName);

  return `    <dialog class="quote-dialog" id="quote-dialog" data-quote-dialog data-default-service="${defaultService}" aria-labelledby="quote-dialog-title" aria-describedby="quote-dialog-description">
      <div class="quote-dialog__header">
        <div>
          <p class="quote-dialog__eyebrow">Kısa teklif formu</p>
          <h2 id="quote-dialog-title">Fiyat ve uygunluğu birlikte netleştirelim.</h2>
          <p id="quote-dialog-description">Üç kısa bilgiyle WhatsApp mesajınızı hazırlayalım.</p>
        </div>
        <button class="quote-dialog__close" type="button" data-quote-close aria-label="Teklif formunu kapat">Kapat</button>
      </div>

      <form class="quote-dialog__form" data-quote-form novalidate>
        <p class="quote-dialog__progress-label" aria-live="polite">Adım <span data-quote-progress-label>1 / 3</span></p>
        <progress class="quote-dialog__progress" data-quote-progress max="3" value="1" aria-label="Teklif adımı">1 / 3</progress>

        <fieldset class="quote-dialog__step" data-quote-step="date">
          <legend>Etkinlik tarihiniz ne zaman?</legend>
          <p class="quote-dialog__hint" id="quote-date-hint">Tarihi biliyorsanız seçin; henüz netleşmediyse bunu belirtin.</p>
          <p class="quote-dialog__error" id="quote-date-error" data-quote-error role="alert" hidden></p>
          <label class="quote-dialog__field" for="quote-event-date">
            <span>Etkinlik tarihi</span>
            <input id="quote-event-date" name="eventDate" type="date" aria-describedby="quote-date-hint quote-date-error" data-quote-date>
          </label>
          <label class="quote-dialog__choice" for="quote-event-date-unknown">
            <input id="quote-event-date-unknown" name="eventDateUnknown" type="checkbox" value="true" data-quote-date-unknown>
            <span>Henüz net değil</span>
          </label>
          <div class="quote-dialog__actions quote-dialog__actions--end">
            <button class="button button--orange" type="button" data-quote-next>Devam et</button>
          </div>
        </fieldset>

        <fieldset class="quote-dialog__step" data-quote-step="city" hidden>
          <legend>Etkinlik hangi şehirde?</legend>
          <p class="quote-dialog__hint" id="quote-city-hint">Kurulum uygunluğunu şehir bilgisine göre teyit ediyoruz.</p>
          <p class="quote-dialog__error" id="quote-city-error" data-quote-error role="alert" hidden></p>
          <label class="quote-dialog__field" for="quote-city">
            <span>Şehir</span>
            <input id="quote-city" name="city" type="text" maxlength="80" autocomplete="address-level2" aria-describedby="quote-city-hint quote-city-error" data-quote-city>
          </label>
          <label class="quote-dialog__choice" for="quote-city-unknown">
            <input id="quote-city-unknown" name="cityUnknown" type="checkbox" value="true" data-quote-city-unknown>
            <span>Henüz net değil</span>
          </label>
          <div class="quote-dialog__actions">
            <button class="button button--paper" type="button" data-quote-back>Geri</button>
            <button class="button button--orange" type="button" data-quote-next>Devam et</button>
          </div>
        </fieldset>

        <fieldset class="quote-dialog__step" data-quote-step="package" hidden>
          <legend>Hangi paketle ilgileniyorsunuz?</legend>
          <p class="quote-dialog__error" id="quote-service-error" data-quote-error role="alert" hidden></p>
          <label class="quote-dialog__field" for="quote-service">
            <span>Paket</span>
            <select id="quote-service" name="service" aria-describedby="quote-service-error" data-quote-service>
${renderPackageOptions(defaultServiceName)}
            </select>
          </label>
          <div class="quote-dialog__actions">
            <button class="button button--paper" type="button" data-quote-back>Geri</button>
            <a class="button button--whatsapp quote-dialog__whatsapp" href="${whatsappFallback}" data-quote-whatsapp target="_blank" rel="noopener noreferrer">WhatsApp'ta devam et</a>
          </div>
        </fieldset>
      </form>
    </dialog>`;
}

function replaceGeneratedBlock(source, startMarker, endMarker, content) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`Üretilen içerik işaretleri bulunamadı: ${startMarker} ... ${endMarker}`);
  }

  const contentStart = startIndex + startMarker.length;
  return `${source.slice(0, contentStart)}\n${content}\n${source.slice(endIndex)}`;
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
  const whatsappFallback = buildWhatsAppFallback(service.name);
  const canonical = `https://konseptgelsin.com/${page}`;
  const metaDescription = escapeHtml(`${service.summary} ${service.name} paketinin kapsamını ve detaylarını inceleyin.`);

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
    <link rel="stylesheet" href="css/tokens.css">
    <link rel="stylesheet" href="css/base.css">
    <link rel="stylesheet" href="css/components.css">
    <link rel="stylesheet" href="css/pages/package-detail.css">
    <link rel="stylesheet" href="css/pages/package-media.css">
    <link rel="stylesheet" href="css/responsive.css">
    <link rel="stylesheet" href="css/pages/package-detail-responsive.css">
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

    <main id="main-content" tabindex="-1">
      <section class="package-detail-hero" aria-labelledby="package-title">
        <div class="package-detail-hero__inner shell">
          <div class="package-detail-hero__copy">
            <a class="package-detail__back" href="index.html#paketler">
              <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-chevron"></use></svg>
              Tüm paketlere dön
            </a>
            <p class="package-detail__eyebrow">Düğün ve nişan anı deneyimi</p>
            <h1 id="package-title">${shortName}</h1>
            <p class="package-detail__lead">${summary}</p>
            <p class="package-detail__promise">${promise}</p>
            <div class="package-detail__actions">
              <a class="button button--orange" href="${whatsappFallback}" data-quote-trigger data-quote-service="${name}" target="_blank" rel="noopener noreferrer">
                Fiyat ve uygunluk sor
                <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-arrow"></use></svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section class="package-overview" id="paket-kapsami" aria-labelledby="overview-title">
        <div class="package-overview__grid shell">
          <div class="package-overview__copy">
            <p class="package-detail__eyebrow">Paket ayrıntıları</p>
            <h2 id="overview-title">Anınız için nasıl çalışır?</h2>
            <p>${description}</p>
          </div>
          <div class="package-scope" aria-labelledby="scope-title">
            <h2 id="scope-title">Neler dahil?</h2>
            <ul>
${renderScopeItems(service.contents)}
            </ul>
          </div>
        </div>
      </section>

      <section class="package-media" aria-labelledby="media-title">
        <div class="package-media__inner shell">
          <div class="package-media__group">
            <h2 id="media-title">Fotoğraflar</h2>
            <div class="package-media__gallery-region" data-package-gallery-region>
              <div class="package-photo-gallery" id="package-photo-gallery">
                <figure class="package-photo-card"><img src="/media/images/${mobileImage}" alt="${imageAlt}" width="480" height="480" loading="lazy" decoding="async"></figure>
                <figure class="package-photo-card"><img src="/media/images/${image}" alt="" width="960" height="960" loading="lazy" decoding="async"></figure>
                <figure class="package-photo-card"><img src="/media/images/hero-still-life-mobile-v3.png" alt="Mum ışığında hazırlanmış düğün masası" width="941" height="1672" loading="lazy" decoding="async"></figure>
                <figure class="package-photo-card"><img src="/media/images/${image}" alt="" width="960" height="960" loading="lazy" decoding="async"></figure>
                <figure class="package-photo-card"><img src="/media/images/${mobileImage}" alt="" width="480" height="480" loading="lazy" decoding="async"></figure>
                <figure class="package-photo-card"><img src="/media/images/hero-still-life-v2.png" alt="" width="1672" height="941" loading="lazy" decoding="async"></figure>
                <figure class="package-photo-card"><img src="/media/images/${image}" alt="" width="960" height="960" loading="lazy" decoding="async"></figure>
                <figure class="package-photo-card"><img src="/media/images/${mobileImage}" alt="" width="480" height="480" loading="lazy" decoding="async"></figure>
              </div>
              <button class="package-gallery-toggle" type="button" aria-expanded="false" aria-controls="package-photo-gallery" data-package-gallery-toggle hidden>
                <span data-package-gallery-label>Tümünü Gör</span>
                <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-chevron"></use></svg>
              </button>
            </div>
          </div>

          <div class="package-media__group">
            <h2 id="video-title">Videolar</h2>
            <div class="package-video-grid">
              <figure class="package-video-card">
                <img src="/media/images/${image}" alt="" width="960" height="960" loading="lazy" decoding="async">
                <figcaption>Temsili video ön izlemesi</figcaption>
              </figure>
              <figure class="package-video-card">
                <img src="/media/images/${mobileImage}" alt="" width="480" height="480" loading="lazy" decoding="async">
                <figcaption>Temsili video ön izlemesi</figcaption>
              </figure>
            </div>
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
          <a class="button button--orange" href="${whatsappFallback}" data-quote-trigger data-quote-service="${name}" target="_blank" rel="noopener noreferrer">
            Fiyat ve uygunluk sor
            <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-arrow"></use></svg>
          </a>
          <address class="package-contact__details" aria-label="Diğer iletişim kanalları">
            <a href="tel:+905386888306">
              <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-phone-call"></use></svg>
              <span><small>Telefon</small>+90 538 688 83 06</span>
            </a>
            <a href="mailto:info@konseptgelsin.com">
              <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-mail"></use></svg>
              <span><small>E-posta</small>info@konseptgelsin.com</span>
            </a>
          </address>
        </div>
      </section>
    </main>

    <nav class="mobile-action-bar" aria-label="Mobil hızlı işlemler" data-mobile-dock>
      <a class="mobile-action-bar__packages" href="index.html#paketler">
        <svg aria-hidden="true"><use href="/media/images/ui/icons.svg#icon-grid"></use></svg>
        Paketler
      </a>
      <a class="mobile-action-bar__whatsapp" href="${whatsappFallback}" data-quote-trigger data-quote-service="${name}" target="_blank" rel="noopener noreferrer">
        Fiyat ve uygunluk sor
      </a>
    </nav>

${renderQuoteDialog(service.name)}

    <footer class="site-footer">
      <div class="site-footer__inner shell">
        <a class="brand" href="index.html" aria-label="Konsept Gelsin ana sayfa"><span class="brand__ink">Konsept</span><span class="brand__accent">Gelsin</span></a>
        <p>Misafirlerinizin gözünden, sesinden ve sözünden daha fazla anı.</p>
        <p>© <span data-current-year></span> Konsept Gelsin</p>
      </div>
    </footer>

    <script type="module" src="js/package/detail-app.js"></script>
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

const homeTarget = path.join(projectRoot, "index.html");
const existingHome = await readExisting(homeTarget);

if (existingHome === null) {
  throw new Error("Ana sayfa bulunamadı: index.html");
}

let expectedHome = replaceGeneratedBlock(
  existingHome,
  homeGridStartMarker,
  homeGridEndMarker,
  renderHomePackageGrid(),
);
expectedHome = replaceGeneratedBlock(
  expectedHome,
  homeQuoteStartMarker,
  homeQuoteEndMarker,
  renderQuoteDialog(),
);

if (mode === "--write") {
  if (existingHome !== expectedHome) await writeFile(homeTarget, expectedHome, "utf8");
} else if (existingHome !== expectedHome) {
  drift.push("index.html");
}

if (mode === "--write") {
  console.log(`Ana sayfa ve ${services.length} paket detay sayfası güncellendi.`);
} else if (drift.length > 0) {
  console.error(`Üretilen içerik sapması bulundu: ${drift.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Ana sayfa ve paket detayları içerik kaynağıyla eşleşiyor (${services.length} paket).`);
}
