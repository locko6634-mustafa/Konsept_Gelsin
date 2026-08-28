import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { services } from "./page-manifest.mjs";

const projectRoot = process.cwd();
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const resultDirectory = path.join(projectRoot, "test-results");
const viewports = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];
const pages = [
  { kind: "home", name: "home", pathname: "/" },
  ...services.map((service) => ({
    kind: "detail",
    name: service.page.replace(/\.html$/, ""),
    pathname: `/${service.page}`,
    serviceName: service.name,
  })),
];

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
        return;
      }

      for (const listener of this.listeners.get(message.method) ?? []) listener(message);
    });

    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("Chrome DevTools bağlantısı kapandı."));
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Chrome DevTools bağlantısı zaman aşımına uğradı.")), 10_000);
      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Chrome DevTools bağlantısı kurulamadı."));
      }, { once: true });
    });
    return new CdpConnection(socket);
  }

  send(method, params = {}, sessionId, timeoutMs = 15_000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} komutu zaman aşımına uğradı.`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  waitFor(method, sessionId, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const remove = this.on(method, (message) => {
        if (sessionId && message.sessionId !== sessionId) return;
        clearTimeout(timeout);
        remove();
        resolve(message.params ?? {});
      });
      const timeout = setTimeout(() => {
        remove();
        reject(new Error(`${method} olayı zaman aşımına uğradı.`));
      }, timeoutMs);
    });
  }

  close() {
    this.socket.close();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verticallySeparated(rects) {
  return rects.every((rect, index) => index === 0 || rect.top >= rects[index - 1].bottom - 0.5);
}

function nonOverlapping(rects) {
  return rects.every((rect, index) => rects.slice(index + 1).every((other) =>
    rect.right <= other.left + 0.5
    || other.right <= rect.left + 0.5
    || rect.bottom <= other.top + 0.5
    || other.bottom <= rect.top + 0.5));
}

async function waitForHttp(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Yerel sunucu erken kapandı (${child.exitCode}).`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Sunucu henüz dinlemiyor.
    }
    await delay(100);
  }
  throw new Error("Yerel sunucu zamanında başlamadı.");
}

async function availablePort() {
  const probe = createNetServer();
  await new Promise((resolve, reject) => {
    const fail = (error) => reject(error);
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      probe.off("error", fail);
      resolve();
    });
  });
  const address = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("Chrome için geçici debug portu ayrılamadı.");
  return address.port;
}

async function devtoolsEndpoint(port, chrome, chromeFailure, chromeDiagnostics) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (chromeFailure()) throw new Error(`Chrome başlatılamadı: ${chromeFailure().message}`);
    try {
      const response = await fetch(versionUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        const version = await response.json();
        if (version.webSocketDebuggerUrl) return version.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome henüz DevTools HTTP yüzeyini açmadı.
    }
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome erken kapandı (${chrome.exitCode}). ${chromeDiagnostics().trim()}`.trim());
    }
    await delay(100);
  }
  throw new Error(`Chrome DevTools yüzeyi zamanında açılmadı (${versionUrl}). ${chromeDiagnostics().trim()}`.trim());
}

async function evaluate(cdp, sessionId, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, sessionId);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Sayfa değerlendirmesi başarısız.");
  }
  return response.result?.value;
}

function pageAuditExpression() {
  return `(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const nameOf = (element) => {
      const labelled = element.getAttribute("aria-label") || element.getAttribute("title");
      const labels = element.labels ? [...element.labels].map((label) => label.textContent).join(" ") : "";
      return (labelled || labels || element.textContent || element.value || "").trim();
    };
    const controls = [...document.querySelectorAll("a[href], button, input, select, textarea, summary")].filter(visible);
    const missingNames = controls.filter((element) => !nameOf(element)).map((element) => element.outerHTML.slice(0, 120));
    const smallTargets = controls
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => !element.matches("input[type='hidden']") && (rect.width < 43.5 || rect.height < 43.5))
      .map(({ element, rect }) => ({ tag: element.tagName, text: nameOf(element).slice(0, 45), width: Math.round(rect.width), height: Math.round(rect.height) }));
    const root = document.documentElement;
    const body = document.body;
    const packageCards = [...document.querySelectorAll(".package")].filter(visible).map((card) => {
      const visual = card.querySelector(".package__visual");
      const content = card.querySelector(".package__content");
      const link = card.querySelector(".package__link");
      const cardRect = card.getBoundingClientRect();
      const visualRect = visual?.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      const linkRect = link?.getBoundingClientRect();
      return {
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        visualWidth: visualRect?.width ?? 0,
        visualHeight: visualRect?.height ?? 0,
        contentWidth: contentRect?.width ?? 0,
        linkWidth: linkRect?.width ?? 0,
        linkHeight: linkRect?.height ?? 0,
      };
    });
    const visibleRects = (selector) => [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        };
      });
    const mobileActionBar = document.querySelector(".mobile-action-bar");
    const mobileActionBarRect = mobileActionBar?.getBoundingClientRect();
    const mobileActionBarStyle = mobileActionBar ? getComputedStyle(mobileActionBar) : null;
    const heroStage = document.querySelector(".hero__stage");
    const heroActions = document.querySelector(".hero__actions");
    const detailHeroGrid = document.querySelector(".package-detail-hero__inner");
    const detailPhotoGallery = document.querySelector(".package-photo-gallery");
    const detailVideoGrid = document.querySelector(".package-video-grid");
    const overflowing = [...document.querySelectorAll("body *")]
      .filter(visible)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < -0.5 || rect.right > innerWidth + 0.5)
      .map(({ element, rect }) => ({ selector: element.className || element.tagName, left: Math.round(rect.left), right: Math.round(rect.right) }))
      .slice(0, 12);
    return {
      title: document.title,
      pageKind: body.classList.contains("package-detail-page") ? "detail" : "home",
      lang: root.lang,
      h1Count: document.querySelectorAll("h1").length,
      mainCount: document.querySelectorAll("main").length,
      sectionCount: document.querySelectorAll("main > section").length,
      retiredMemoryCount: document.querySelectorAll(".memory-machine, .memory-tile").length,
      packageCount: document.querySelectorAll(".package").length,
      heroImageCount: document.querySelectorAll(".hero__background").length,
      heroImageSource: document.querySelector(".hero__background")?.currentSrc || "",
      heroStageAlignment: heroStage ? getComputedStyle(heroStage).alignItems : "",
      heroActionsPosition: heroActions ? getComputedStyle(heroActions).position : "",
      heroActionsBottomGap: (() => {
        const stageRect = heroStage?.getBoundingClientRect();
        const actionsRect = heroActions?.getBoundingClientRect();
        return stageRect && actionsRect ? stageRect.bottom - actionsRect.bottom : -1;
      })(),
      packageImageCount: document.querySelectorAll(".package img[src^='/media/images/'][src$='.webp']").length,
      uniqueServiceImages: [...new Set([...document.querySelectorAll(".package img")].map((image) => image.getAttribute("src")))].sort(),
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute("src")),
      formCount: document.querySelectorAll("form, input, select, textarea").length,
      conceptLineCount: document.querySelectorAll(".concept-line").length,
      retiredContactLinks: [...document.querySelectorAll("a[href]")].filter((link) => /iletisim\\.html/i.test(link.getAttribute("href"))).length,
      directContactCta: document.querySelector("#iletisim [data-whatsapp-general], #iletisim [data-whatsapp-service]")?.href.startsWith("https://wa.me/905386888306?text=") ?? false,
      detailHeroCount: document.querySelectorAll(".package-detail-hero").length,
      detailHeroImageSource: document.querySelector(".package-detail-hero__media img")?.currentSrc || "",
      detailHeroGridColumns: detailHeroGrid && visible(detailHeroGrid) ? getComputedStyle(detailHeroGrid).gridTemplateColumns.split(" ").length : 0,
      detailPhotoGalleryColumns: detailPhotoGallery && visible(detailPhotoGallery) ? getComputedStyle(detailPhotoGallery).gridTemplateColumns.split(" ").length : 0,
      detailVideoGridColumns: detailVideoGrid && visible(detailVideoGrid) ? getComputedStyle(detailVideoGrid).gridTemplateColumns.split(" ").length : 0,
      detailHeroItems: visibleRects(".package-detail-hero__inner > *"),
      detailOverviewItems: visibleRects(".package-overview__grid > *"),
      detailMediaGroups: visibleRects(".package-media__group"),
      detailPhotoCards: visibleRects(".package-photo-card"),
      detailVideoCards: visibleRects(".package-video-card"),
      detailGalleryToggleVisible: Boolean(document.querySelector(".package-gallery-toggle") && visible(document.querySelector(".package-gallery-toggle"))),
      detailScopeItems: document.querySelectorAll(".package-scope li").length,
      detailServiceCtas: document.querySelectorAll("[data-whatsapp-service]").length,
      videoElementCount: document.querySelectorAll("video, iframe").length,
      missingNames,
      smallTargets,
      rootScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      packageCards,
      featuredCards: visibleRects(".featured-card"),
      processSteps: visibleRects(".process-step"),
      processMarkers: [...document.querySelectorAll(".process-step__top")].map((top) => {
        const index = top.querySelector(".process-step__index")?.getBoundingClientRect();
        const icon = top.querySelector(".process-step__icon")?.getBoundingClientRect();
        return index && icon
          ? {
              index: { top: index.top, right: index.right, bottom: index.bottom, left: index.left },
              icon: { top: icon.top, right: icon.right, bottom: icon.bottom, left: icon.left },
            }
          : null;
      }),
      packageLinks: visibleRects(".package__link"),
      visibleHeaderLinks: visibleRects(".desktop-nav a"),
      featuredGridColumns: (() => {
        const grid = document.querySelector(".featured-grid");
        return grid && visible(grid) ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0;
      })(),
      packageGridColumns: (() => {
        const grid = document.querySelector(".package-layout");
        return grid && visible(grid) ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0;
      })(),
      contactBannerVisible: Boolean(document.querySelector(".contact-banner") && visible(document.querySelector(".contact-banner"))),
      mobileActionBar: {
        visible: Boolean(mobileActionBar && visible(mobileActionBar)),
        position: mobileActionBarStyle?.position ?? "",
        bottom: mobileActionBarRect?.bottom ?? -1,
        height: mobileActionBarRect?.height ?? 0,
      },
      bodyPaddingBottom: Number.parseFloat(getComputedStyle(body).paddingBottom),
      overflowing,
      ready: root.dataset.ready,
      whatsappLinks: [...document.querySelectorAll("[data-whatsapp-general], [data-whatsapp-service]")].every((link) => link.href.startsWith("https://wa.me/905386888306?text=")),
    };
  })()`;
}

async function auditPage({ cdp, origin, page, viewport }) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const failures = [];
  const requestUrls = new Map();

  const removeListeners = [
    cdp.on("Runtime.consoleAPICalled", (message) => {
      if (message.sessionId !== sessionId || message.params.type !== "error") return;
      failures.push(`console.error: ${message.params.args?.map((argument) => argument.value ?? argument.description).join(" ")}`);
    }),
    cdp.on("Runtime.exceptionThrown", (message) => {
      if (message.sessionId !== sessionId) return;
      failures.push(`pageerror: ${message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text}`);
    }),
    cdp.on("Log.entryAdded", (message) => {
      if (message.sessionId !== sessionId || message.params.entry?.level !== "error") return;
      failures.push(`log.error: ${message.params.entry.text}`);
    }),
    cdp.on("Network.requestWillBeSent", (message) => {
      if (message.sessionId === sessionId) requestUrls.set(message.params.requestId, message.params.request.url);
    }),
    cdp.on("Network.loadingFailed", (message) => {
      if (message.sessionId !== sessionId) return;
      const url = requestUrls.get(message.params.requestId) || "bilinmeyen istek";
      if (url.startsWith(origin)) failures.push(`requestfailed: ${url} (${message.params.errorText})`);
    }),
    cdp.on("Network.responseReceived", (message) => {
      if (message.sessionId !== sessionId) return;
      const { response } = message.params;
      if (response.url.startsWith(origin) && response.status >= 400) failures.push(`HTTP ${response.status}: ${response.url}`);
    }),
  ];

  try {
    await Promise.all([
      cdp.send("Page.enable", {}, sessionId),
      cdp.send("Runtime.enable", {}, sessionId),
      cdp.send("Network.enable", {}, sessionId),
      cdp.send("Log.enable", {}, sessionId),
      cdp.send("Accessibility.enable", {}, sessionId),
    ]);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width <= 768,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    }, sessionId);

    if (viewport.width === 375) {
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      }, sessionId);
    }

    const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
    const navigation = await cdp.send("Page.navigate", { url: `${origin}${page.pathname}` }, sessionId);
    assert(!navigation.errorText, `${page.name} yönlendirme hatası: ${navigation.errorText}`);
    await loaded;
    await evaluate(cdp, sessionId, "document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    await evaluate(cdp, sessionId, `(async () => {
      for (const image of document.querySelectorAll("img[loading='lazy']")) {
        image.scrollIntoView({ block: "center" });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }
        if (typeof image.decode === "function") await image.decode().catch(() => {});
      }
    })()`);
    await evaluate(cdp, sessionId, "window.scrollTo(0, 0)");
    await delay(800);

    const audit = await evaluate(cdp, sessionId, pageAuditExpression());
    assert(audit.lang === "tr", `${page.name}/${viewport.width}: html lang tr değil.`);
    assert(audit.h1Count === 1, `${page.name}/${viewport.width}: görünür h1 sayısı ${audit.h1Count}.`);
    assert(audit.mainCount === 1, `${page.name}/${viewport.width}: main sayısı ${audit.mainCount}.`);
    assert(audit.rootScrollWidth <= audit.viewportWidth, `${page.name}/${viewport.width}: kök yatay taşıyor (${audit.rootScrollWidth} > ${audit.viewportWidth}); ${JSON.stringify(audit.overflowing)}.`);
    assert(audit.bodyScrollWidth <= audit.viewportWidth, `${page.name}/${viewport.width}: body yatay taşıyor (${audit.bodyScrollWidth} > ${audit.viewportWidth}).`);
    assert(audit.missingNames.length === 0, `${page.name}/${viewport.width}: isimsiz kontroller ${JSON.stringify(audit.missingNames)}.`);
    assert(audit.smallTargets.length === 0, `${page.name}/${viewport.width}: 44px altı hedefler ${JSON.stringify(audit.smallTargets)}.`);
    assert(audit.whatsappLinks, `${page.name}/${viewport.width}: WhatsApp bağlantıları hydrate edilmedi.`);
    assert(audit.ready === "true", `${page.name}/${viewport.width}: sayfa bootstrap tamamlanmadı.`);
    assert(audit.pageKind === page.kind, `${page.name}/${viewport.width}: sayfa türü ${audit.pageKind}.`);
    assert(audit.retiredMemoryCount === 0, `${page.name}/${viewport.width}: kaldırılan memory-machine yapısı bulundu.`);
    assert(audit.brokenImages.length === 0, `${page.name}/${viewport.width}: yüklenemeyen görseller ${JSON.stringify(audit.brokenImages)}.`);
    assert(audit.formCount === 0, `${page.name}/${viewport.width}: sayfa form alanı içeriyor.`);
    assert(audit.conceptLineCount === 0, `${page.name}/${viewport.width}: kaldırılan hizmet geçiş çizgisi hâlâ görünüyor.`);
    assert(audit.retiredContactLinks === 0, `${page.name}/${viewport.width}: ayrı iletişim sayfası bağlantısı kaldı.`);
    assert(audit.directContactCta, `${page.name}/${viewport.width}: iletişim alanında doğrudan WhatsApp CTA bulunamadı.`);
    assert(audit.visibleHeaderLinks.length === 2, `${page.name}/${viewport.width}: Paketler ve İletişim başlıkta birlikte görünmüyor.`);

    if (page.kind === "home") {
      assert(audit.sectionCount === 3, `${page.name}/${viewport.width}: ana section sayısı ${audit.sectionCount}.`);
      assert(audit.packageCount === 6, `${page.name}/${viewport.width}: hizmet bloğu sayısı ${audit.packageCount}.`);
      assert(audit.heroImageCount === 1, `${page.name}/${viewport.width}: hero arka plan sayısı ${audit.heroImageCount}.`);
      const expectedHeroAlignment = viewport.width <= 768 ? "flex-start" : "center";
      assert(audit.heroStageAlignment === expectedHeroAlignment, `${page.name}/${viewport.width}: hero yazıları eski hizasında değil (${audit.heroStageAlignment}).`);
      assert(audit.packageImageCount === 6, `${page.name}/${viewport.width}: paket WebP sayısı ${audit.packageImageCount}.`);
      assert(audit.uniqueServiceImages.length === 6, `${page.name}/${viewport.width}: benzersiz hizmet görseli sayısı ${audit.uniqueServiceImages.length}.`);
      assert(audit.heroActionsPosition === "absolute", `${page.name}/${viewport.width}: hero aksiyonları alanın altına sabitlenmedi (${audit.heroActionsPosition}).`);
      assert(
        audit.heroActionsBottomGap >= 23 && audit.heroActionsBottomGap <= 65,
        `${page.name}/${viewport.width}: hero aksiyonlarının alt boşluğu beklenen aralıkta değil (${audit.heroActionsBottomGap}px).`,
      );
      assert(audit.featuredCards.length === 2, `${page.name}/${viewport.width}: iki öne çıkan kart görünmüyor.`);
      assert(audit.processSteps.length === 3, `${page.name}/${viewport.width}: üç süreç adımı görünmüyor.`);
      if (viewport.width <= 576) {
        assert(
          audit.processSteps.every((step, index, steps) => index === 0 || step.top > steps[index - 1].top),
          `${page.name}/${viewport.width}: süreç adımları mobilde dikey sıralanmadı (${JSON.stringify(audit.processSteps)}).`,
        );
      } else {
        assert(
          audit.processSteps.every((step) => Math.abs(step.top - audit.processSteps[0].top) <= 1),
          `${page.name}/${viewport.width}: süreç adımları geniş ekranda yatay hizalanmadı (${JSON.stringify(audit.processSteps)}).`,
        );
        assert(
          audit.processMarkers.every(
            (marker) =>
              marker &&
              marker.index.right > marker.icon.left &&
              marker.index.left < marker.icon.right &&
              marker.index.bottom > marker.icon.top &&
              marker.index.top < marker.icon.bottom &&
              marker.index.left + marker.index.right < marker.icon.left + marker.icon.right,
          ),
          `${page.name}/${viewport.width}: süreç numaraları ikonların sol üst kenarına hizalanmadı (${JSON.stringify(audit.processMarkers)}).`,
        );
      }
      assert(audit.packageLinks.length === 6, `${page.name}/${viewport.width}: altı paket bağlantısı görünmüyor.`);
      assert(audit.featuredGridColumns === 2, `${page.name}/${viewport.width}: öne çıkan kartlar iki sütun değil.`);
      assert(audit.packageGridColumns === 2, `${page.name}/${viewport.width}: paketler iki sütun değil.`);
      assert(audit.contactBannerVisible, `${page.name}/${viewport.width}: iletişim bannerı görünmüyor.`);
      assert(
        audit.packageCards.every((card) => card.cardHeight >= 80),
        `${page.name}/${viewport.width}: paket kartları yeterince büyük değil (${JSON.stringify(audit.packageCards)}).`,
      );
      assert(
        audit.packageCards.every((card) => Math.abs(card.visualWidth - card.visualHeight) <= 1),
        `${page.name}/${viewport.width}: paket görselleri kare değil (${JSON.stringify(audit.packageCards)}).`,
      );
      assert(
        audit.packageCards.every((card) => card.contentWidth > 0),
        `${page.name}/${viewport.width}: paket metni için alan kalmadı (${JSON.stringify(audit.packageCards)}).`,
      );
      assert(
        audit.packageCards.every((card) => Math.abs(card.linkWidth - card.cardWidth) <= 2.1 && Math.abs(card.linkHeight - card.cardHeight) <= 2.1),
        `${page.name}/${viewport.width}: paket bağlantısı kartın tamamını kaplamıyor (${JSON.stringify(audit.packageCards)}).`,
      );
    } else {
      assert(audit.sectionCount === 4, `${page.name}/${viewport.width}: detay section sayısı ${audit.sectionCount}.`);
      assert(audit.packageCount === 0, `${page.name}/${viewport.width}: ana sayfa paket kartları detay sayfasına taşındı.`);
      assert(audit.detailHeroCount === 1, `${page.name}/${viewport.width}: paket hero alanı bulunamadı.`);
      assert(audit.detailHeroImageSource === "", `${page.name}/${viewport.width}: kaldırılan hero görseli hâlâ görünüyor.`);
      assert(audit.detailHeroGridColumns === 1, `${page.name}/${viewport.width}: hero sütun sayısı ${audit.detailHeroGridColumns}.`);
      assert(audit.detailHeroItems.length === 1, `${page.name}/${viewport.width}: hero öğe sayısı hatalı.`);
      assert(audit.detailPhotoGalleryColumns === 2, `${page.name}/${viewport.width}: fotoğraf mozaiği iki sütun değil (${audit.detailPhotoGalleryColumns}).`);
      assert(audit.detailVideoGridColumns === 2, `${page.name}/${viewport.width}: video kapakları iki sütun değil (${audit.detailVideoGridColumns}).`);
      assert(audit.detailPhotoCards.length === 8, `${page.name}/${viewport.width}: görünür fotoğraf kartı sayısı ${audit.detailPhotoCards.length}.`);
      assert(audit.detailVideoCards.length === 2, `${page.name}/${viewport.width}: görünür video kapağı sayısı ${audit.detailVideoCards.length}.`);
      assert(nonOverlapping(audit.detailPhotoCards), `${page.name}/${viewport.width}: fotoğraf kartları üst üste biniyor.`);
      assert(nonOverlapping(audit.detailVideoCards), `${page.name}/${viewport.width}: video kapakları üst üste biniyor.`);
      assert(audit.detailPhotoCards.every((card) => card.width >= 120), `${page.name}/${viewport.width}: fotoğraf kartı kullanılamayacak kadar dar.`);
      assert(audit.detailVideoCards.every((card) => card.width >= 120), `${page.name}/${viewport.width}: video kapağı kullanılamayacak kadar dar.`);
      assert(audit.detailScopeItems >= 5, `${page.name}/${viewport.width}: paket kapsamı eksik (${audit.detailScopeItems}).`);
      assert(audit.detailServiceCtas === 2, `${page.name}/${viewport.width}: hizmete özel CTA sayısı ${audit.detailServiceCtas}.`);
      assert(audit.videoElementCount === 0, `${page.name}/${viewport.width}: kaynaksız video/iframe bulunuyor.`);
      if (viewport.width <= 768) {
        const minimumDetailItemWidth = Math.min(280, viewport.width - 32);
        assert(audit.detailOverviewItems.length === 1, `${page.name}/${viewport.width}: paket kapsamı öğesi eksik (${JSON.stringify(audit.detailOverviewItems)}).`);
        assert(audit.detailMediaGroups.length === 2, `${page.name}/${viewport.width}: fotoğraf veya video grubu eksik.`);
        assert(audit.detailHeroItems.every((item) => item.width >= minimumDetailItemWidth), `${page.name}/${viewport.width}: hero öğesi kullanılamayacak kadar dar.`);
        assert(audit.detailOverviewItems.every((item) => item.width >= minimumDetailItemWidth), `${page.name}/${viewport.width}: overview öğesi kullanılamayacak kadar dar.`);
        assert(verticallySeparated(audit.detailMediaGroups), `${page.name}/${viewport.width}: fotoğraf ve video grupları üst üste biniyor.`);
        assert(audit.detailGalleryToggleVisible, `${page.name}/${viewport.width}: Tümünü Gör kontrolü görünmüyor.`);
      } else {
        assert(!audit.detailGalleryToggleVisible, `${page.name}/${viewport.width}: mobil galeri kontrolü masaüstünde görünür.`);
      }
    }

    if (viewport.width <= 768) {
      assert(audit.mobileActionBar.visible, `${page.name}/${viewport.width}: mobil hızlı işlem çubuğu görünmüyor.`);
      assert(audit.mobileActionBar.position === "fixed", `${page.name}/${viewport.width}: mobil hızlı işlem çubuğu sabit değil.`);
      assert(
        Math.abs(audit.mobileActionBar.bottom - audit.viewportHeight) <= 1,
        `${page.name}/${viewport.width}: mobil hızlı işlem çubuğu viewport altına oturmuyor (${audit.mobileActionBar.bottom}/${audit.viewportHeight}).`,
      );
      assert(audit.bodyPaddingBottom >= audit.mobileActionBar.height, `${page.name}/${viewport.width}: alt çubuk için içerik rezervi yetersiz (${audit.bodyPaddingBottom} < ${audit.mobileActionBar.height}).`);
      if (page.kind === "home") {
        assert(audit.heroImageSource.endsWith("/media/images/hero-still-life-mobile-v3.png"), `${page.name}/${viewport.width}: mobil hero görseli yüklenmedi (${audit.heroImageSource}).`);
      }
    } else {
      assert(!audit.mobileActionBar.visible, `${page.name}/${viewport.width}: mobil hızlı işlem çubuğu masaüstünde görünür.`);
      if (page.kind === "home") {
        assert(audit.heroImageSource.endsWith("/media/images/hero-still-life-v2.png"), `${page.name}/${viewport.width}: masaüstü hero görseli yüklenmedi (${audit.heroImageSource}).`);
      }
    }

    const focusState = await evaluate(cdp, sessionId, `(() => {
      const target = document.querySelector("main [data-whatsapp-general], main [data-whatsapp-service]");
      target.focus();
      const style = getComputedStyle(target);
      return {
        focused: document.activeElement === target,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        shadow: style.boxShadow,
      };
    })()`);
    const focusVisible = focusState.outlineStyle !== "none"
      && focusState.outlineWidth !== "0px"
      || focusState.shadow !== "none";
    assert(focusState.focused && focusVisible, `${page.name}/${viewport.width}: klavye odağı görünür değil.`);
    await evaluate(cdp, sessionId, "document.activeElement?.blur()");

    if (viewport.width === 375) {
      if (page.kind === "detail") {
        const galleryToggleState = await evaluate(cdp, sessionId, `(() => {
          const gallery = document.querySelector(".package-photo-gallery");
          const button = document.querySelector("[data-package-gallery-toggle]");
          const label = button?.querySelector("[data-package-gallery-label]");
          const before = { expanded: button?.getAttribute("aria-expanded"), label: label?.textContent.trim() };
          button?.click();
          const opened = { expanded: button?.getAttribute("aria-expanded"), label: label?.textContent.trim(), className: gallery?.className };
          button?.click();
          const closed = { expanded: button?.getAttribute("aria-expanded"), label: label?.textContent.trim(), className: gallery?.className };
          return { before, opened, closed };
        })()`);
        assert(galleryToggleState.before.expanded === "false" && galleryToggleState.before.label === "Tümünü Gör", `${page.name}/375: galeri başlangıç durumu hatalı.`);
        assert(galleryToggleState.opened.expanded === "true" && galleryToggleState.opened.label === "Daha az göster" && galleryToggleState.opened.className.includes("is-expanded"), `${page.name}/375: galeri açılmıyor.`);
        assert(galleryToggleState.closed.expanded === "false" && galleryToggleState.closed.label === "Tümünü Gör" && !galleryToggleState.closed.className.includes("is-expanded"), `${page.name}/375: galeri kapanmıyor.`);
      }

      const reducedMotion = await evaluate(cdp, sessionId, `(() => {
        const heroCopy = document.querySelector(".hero__copy, .package-detail-hero__copy") || document.body;
        return { media: matchMedia("(prefers-reduced-motion: reduce)").matches, duration: getComputedStyle(heroCopy).animationDuration };
      })()`);
      assert(reducedMotion.media, `${page.name}/375: reduced-motion emülasyonu çalışmadı.`);
      assert(["0s", "0.00001s", "1e-05s"].includes(reducedMotion.duration), `${page.name}/375: animasyon süresi azaltılmadı (${reducedMotion.duration}).`);
    }

    const axTree = await cdp.send("Accessibility.getFullAXTree", {}, sessionId);
    const unnamedInteractive = axTree.nodes.filter((node) =>
      ["button", "link", "textbox", "combobox"].includes(node.role?.value)
      && !node.ignored
      && !String(node.name?.value || "").trim(),
    );
    assert(unnamedInteractive.length === 0, `${page.name}/${viewport.width}: erişilebilirlik ağacında isimsiz etkileşim var.`);

    await delay(120);
    assert(failures.length === 0, `${page.name}/${viewport.width}: ${failures.join(" | ")}`);

    const metrics = await cdp.send("Page.getLayoutMetrics", {}, sessionId);
    const content = metrics.cssContentSize || metrics.contentSize;
    const screenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: Math.ceil(Math.max(content.width, viewport.width)),
        height: Math.ceil(Math.max(content.height, viewport.height)),
        scale: 1,
      },
    }, sessionId);
    const screenshotPath = path.join(resultDirectory, `${page.name}-${viewport.width}.png`);
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    return { audit, screenshotPath };
  } finally {
    for (const remove of removeListeners) remove();
    await cdp.send("Target.closeTarget", { targetId: target.targetId }).catch(() => {});
  }
}

const serverPort = 42_000 + Math.floor(Math.random() * 4_000);
const origin = `http://127.0.0.1:${serverPort}`;
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "konsept-gelsin-chrome-"));
let server;
let chrome;
let cdp;
let chromeSpawnFailure;
let chromeDiagnostics = "";

try {
  await mkdir(resultDirectory, { recursive: true });
  server = spawn(process.execPath, ["tools/server.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(serverPort) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  await waitForHttp(`${origin}/`, server);
  for (const page of pages) {
    const response = await fetch(`${origin}${page.pathname}`);
    assert(response.status === 200, `${page.pathname} ${response.status} döndürdü.`);
  }
  const retiredContactResponse = await fetch(`${origin}/iletisim.html`);
  assert(retiredContactResponse.status === 404, `Kaldırılan iletişim sayfası ${retiredContactResponse.status} döndürdü.`);

  const devtoolsPort = await availablePort();
  const chromeArgs = [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    ...(process.platform === "linux" ? ["--disable-dev-shm-usage", "--no-sandbox"] : []),
    "--hide-scrollbars",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${devtoolsPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ];

  chrome = spawn(chromePath, chromeArgs, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  chrome.stderr?.setEncoding("utf8");
  chrome.stderr?.on("data", (chunk) => {
    chromeDiagnostics = `${chromeDiagnostics}${chunk}`.slice(-8_000);
  });
  chrome.once("error", (error) => {
    chromeSpawnFailure = error;
  });

  cdp = await CdpConnection.connect(
    await devtoolsEndpoint(devtoolsPort, chrome, () => chromeSpawnFailure, () => chromeDiagnostics),
  );
  const results = [];
  for (const page of pages) {
    for (const viewport of viewports) {
      results.push(await auditPage({ cdp, origin, page, viewport }));
      console.log(`✓ ${page.name} ${viewport.width}×${viewport.height}`);
    }
  }

  const expectedScenarioCount = pages.length * viewports.length;
  assert(results.length === expectedScenarioCount, `${expectedScenarioCount} responsive sayfa senaryosu tamamlanmadı.`);
  console.log(`E2E geçti: ${results.length} sayfa senaryosu, ${results.length} ekran görüntüsü, yatay taşma ve erişilebilirlik kontrolleri.`);
} finally {
  cdp?.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  if (server && server.exitCode === null) server.kill();
  await delay(180);
  await rm(profileDirectory, { recursive: true, force: true }).catch(() => {});
}
