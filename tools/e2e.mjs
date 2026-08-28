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
const axeSource = await readFile(path.join(projectRoot, "node_modules", "axe-core", "axe.min.js"), "utf8");
const viewports = [
  { width: 320, height: 568, touch: true },
  { width: 375, height: 812, touch: true },
  { width: 390, height: 844, touch: true },
  { width: 430, height: 932, touch: true },
  { width: 812, height: 375, touch: true },
  { width: 768, height: 1024, touch: true },
  { width: 1440, height: 900, touch: false },
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

const vitalsObserverSource = `(() => {
  const state = {
    cls: 0,
    lcp: null,
    supported: {
      cls: PerformanceObserver.supportedEntryTypes.includes("layout-shift"),
      lcp: PerformanceObserver.supportedEntryTypes.includes("largest-contentful-paint"),
    },
  };
  globalThis.__e2eVitals = state;

  if (state.supported.cls) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) state.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  }

  if (state.supported.lcp) {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const latest = entries.at(-1);
      if (latest) state.lcp = latest.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  }
})();`;

const keyDefinitions = {
  Enter: { code: "Enter", key: "Enter", nativeVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 },
  Escape: { code: "Escape", key: "Escape", windowsVirtualKeyCode: 27 },
  Space: { code: "Space", key: " ", nativeVirtualKeyCode: 32, text: " ", unmodifiedText: " ", windowsVirtualKeyCode: 32 },
  Tab: { code: "Tab", key: "Tab", windowsVirtualKeyCode: 9 },
};

async function pressKey(cdp, sessionId, key, { shift = false } = {}) {
  const definition = keyDefinitions[key];
  assert(definition, `Desteklenmeyen E2E tuşu: ${key}`);
  const modifiers = shift ? 8 : 0;
  const params = { ...definition, modifiers };
  await cdp.send("Input.dispatchKeyEvent", { ...params, type: "keyDown" }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" }, sessionId);
  await delay(35);
  if (key === "Tab") {
    await waitUntil(
      cdp,
      sessionId,
      `(() => {
        const rect = document.activeElement?.getBoundingClientRect();
        return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth);
      })()`,
      "Gerçek Tab odağı smooth-scroll sonunda viewport'a ulaşmadı.",
      32,
    );
    await waitUntil(
      cdp,
      sessionId,
      `(() => {
        const element = document.activeElement;
        const dock = document.querySelector("[data-mobile-dock]");
        if (!element || !dock || dock.contains(element) || element.closest("dialog[open]")) return true;
        const style = getComputedStyle(dock);
        const dockRect = dock.getBoundingClientRect();
        const dockVisible = style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0 && dockRect.width > 0 && dockRect.height > 0;
        if (!dockVisible) return true;
        const rect = element.getBoundingClientRect();
        return rect.right <= dockRect.left + 0.5 || rect.left >= dockRect.right - 0.5 || rect.bottom <= dockRect.top + 0.5 || rect.top >= dockRect.bottom - 0.5;
      })()`,
      "Gerçek Tab odağı mobil dock'tan ayrılmadı.",
      32,
    );
  }
}

async function waitUntil(cdp, sessionId, expression, message, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(cdp, sessionId, expression)) return;
    await delay(25);
  }
  throw new Error(message);
}

async function focusedControlState(cdp, sessionId) {
  return evaluate(cdp, sessionId, `(() => {
    const element = document.activeElement;
    const rect = element?.getBoundingClientRect();
    const style = element ? getComputedStyle(element) : null;
    const dock = document.querySelector("[data-mobile-dock]");
    const dockRect = dock?.getBoundingClientRect();
    const dockStyle = dock ? getComputedStyle(dock) : null;
    const dockVisible = Boolean(
      dock &&
      dockStyle.display !== "none" &&
      dockStyle.visibility !== "hidden" &&
      Number.parseFloat(dockStyle.opacity) > 0 &&
      dockRect.width > 0 &&
      dockRect.height > 0
    );
    const overlapsDock = Boolean(
      dockVisible &&
      element &&
      !element.closest("dialog[open]") &&
      !dock.contains(element) &&
      rect.right > dockRect.left + 0.5 &&
      rect.left < dockRect.right - 0.5 &&
      rect.bottom > dockRect.top + 0.5 &&
      rect.top < dockRect.bottom - 0.5
    );
    const matchedOutlineRules = [];
    const visitRules = (rules, href) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          try {
            if (
              element?.matches(rule.selectorText)
              && ["outline", "outline-style", "outline-width", "outline-color"].some((property) => rule.style.getPropertyValue(property))
            ) {
              matchedOutlineRules.push({ href, selector: rule.selectorText, style: rule.style.cssText });
            }
          } catch {}
        } else if (rule.cssRules) {
          visitRules(rule.cssRules, href);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        visitRules(sheet.cssRules, sheet.href || "inline");
      } catch {}
    }
    return {
      appearance: style?.appearance ?? "",
      cssSupportsOutline: CSS.supports("outline", "3px solid rgb(0, 0, 0)"),
      descriptor: element
        ? [element.tagName.toLowerCase(), element.id ? "#" + element.id : "", element.className ? "." + String(element.className).trim().replaceAll(/\\s+/g, ".") : ""].join("")
        : "none",
      visibleInViewport: Boolean(
        rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0.5 &&
        rect.right > 0.5 &&
        rect.top < innerHeight - 0.5 &&
        rect.left < innerWidth - 0.5
      ),
      matchesQuoteTrigger: element?.matches("[data-quote-trigger]") ?? false,
      matchesFocus: element?.matches(":focus") ?? false,
      matchesFocusVisible: element?.matches(":focus-visible") ?? false,
      matchedOutlineRules: matchedOutlineRules.slice(-12),
      outlineColor: style?.outlineColor ?? "",
      outlineStyle: style?.outlineStyle ?? "none",
      outlineWidth: Number.parseFloat(style?.outlineWidth ?? "0"),
      runningAnimations: element?.getAnimations().map((animation) => animation.animationName || animation.constructor.name) ?? [],
      overlapsDock,
    };
  })()`);
}

function assertKeyboardFocus(state, context) {
  assert(state.visibleInViewport, `${context}: odaklanan kontrol viewport içinde görünür değil (${state.descriptor}).`);
  assert(!state.overlapsDock, `${context}: odaklanan kontrol mobil dock tarafından örtülüyor (${state.descriptor}).`);
  assert(
    state.outlineStyle !== "none" && state.outlineWidth >= 1,
    `${context}: gerçek outline odak göstergesi yok (${JSON.stringify(state)}).`,
  );
}

async function tabToQuoteTrigger(cdp, sessionId, context) {
  for (let index = 0; index < 50; index += 1) {
    await pressKey(cdp, sessionId, "Tab");
    const state = await focusedControlState(cdp, sessionId);
    assertKeyboardFocus(state, `${context}/Tab-${index + 1}`);
    if (state.matchesQuoteTrigger) {
      await evaluate(cdp, sessionId, "globalThis.__e2eQuoteOpener = document.activeElement");
      return;
    }
  }
  throw new Error(`${context}: 50 gerçek Tab adımında teklif tetikleyicisine ulaşılamadı.`);
}

async function contentLength(url, label) {
  const response = await fetch(url, { method: "HEAD" });
  assert(response.status === 200, `${label}: kaynak ${response.status} döndürdü (${url}).`);
  const length = Number(response.headers.get("content-length"));
  assert(Number.isFinite(length) && length > 0, `${label}: Content-Length okunamadı (${url}).`);
  return length;
}

async function runAxeAudit(cdp, sessionId, context) {
  await evaluate(cdp, sessionId, axeSource);
  const violations = await evaluate(cdp, sessionId, `(async () => {
    if (!globalThis.axe?.run) throw new Error("axe-core CDP üzerinden yüklenemedi.");
    const results = await globalThis.axe.run(document, { resultTypes: ["violations"] });
    return results.violations
      .filter((violation) => ["critical", "serious", "moderate"].includes(violation.impact))
      .map((violation) => ({
        help: violation.help,
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.flatMap((node) => node.target).slice(0, 8),
      }));
  })()`);
  assert(violations.length === 0, `${context}: Axe ihlalleri ${JSON.stringify(violations)}.`);
}

function pageAuditExpression() {
  return `(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const nameOf = (element) => {
      const labelled = element.getAttribute("aria-label") || element.getAttribute("title");
      const labels = element.labels ? [...element.labels].map((label) => label.textContent).join(" ") : "";
      return (labelled || labels || element.textContent || element.value || "").trim();
    };
    const rectOf = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const controls = [...document.querySelectorAll("a[href], button, input, select, textarea, summary")]
      .filter((element) => !element.disabled && visible(element));
    const missingNames = controls.filter((element) => !nameOf(element)).map((element) => element.outerHTML.slice(0, 120));
    const smallTargets = controls
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => !element.matches("input[type='hidden']") && (rect.width < 43.5 || rect.height < 43.5))
      .map(({ element, rect }) => ({ tag: element.tagName, text: nameOf(element).slice(0, 45), width: Math.round(rect.width), height: Math.round(rect.height) }));
    const undersizedText = [...document.querySelectorAll("body *")]
      .filter(visible)
      .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
      .map((element) => ({
        className: element.className || "",
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        tag: element.tagName,
        text: element.textContent.trim().slice(0, 60),
      }))
      .filter(({ fontSize }) => fontSize < 13.99)
      .slice(0, 16);
    const root = document.documentElement;
    const body = document.body;
    const packageLayout = document.querySelector(".package-layout");
    const packageCards = [...document.querySelectorAll(".package-layout > a.package")].map((card) => {
      const heading = card.querySelector("h3");
      const image = card.querySelector("img");
      const summary = card.querySelector(".package__summary, p");
      const picture = image?.closest("picture");
      return {
        fontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
        href: card.getAttribute("href"),
        imageSource: image?.currentSrc || "",
        responsiveSources: [...(picture?.querySelectorAll("source") ?? [])].map((source) => ({
          sizes: source.getAttribute("sizes") || "",
          srcset: source.getAttribute("srcset") || "",
          type: source.getAttribute("type") || "",
        })),
        summaryVisible: Boolean(summary && visible(summary)),
        tagName: card.tagName,
        ...rectOf(card),
      };
    });
    const dock = document.querySelector("[data-mobile-dock]");
    const dockRect = dock?.getBoundingClientRect();
    const dockStyle = dock ? getComputedStyle(dock) : null;
    const heroImage = document.querySelector(".hero__background");
    const heroPicture = heroImage?.closest("picture");
    const overview = document.querySelector(".package-overview");
    const media = document.querySelector(".package-media");
    const gallery = document.querySelector(".package-photo-gallery");
    const galleryToggle = document.querySelector("[data-package-gallery-toggle]");
    const packageContactDetails = document.querySelector(".package-contact__details");
    const videoCards = [...document.querySelectorAll(".package-video-card")];
    const overflowing = [...document.querySelectorAll("body *")]
      .filter(visible)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < -0.5 || rect.right > innerWidth + 0.5)
      .map(({ element, rect }) => ({ selector: element.className || element.tagName, left: Math.round(rect.left), right: Math.round(rect.right) }))
      .slice(0, 12);
    return {
      badFontWeights: [...document.querySelectorAll("body *")]
        .filter(visible)
        .filter((element) => getComputedStyle(element).fontWeight === "750")
        .map((element) => element.className || element.tagName)
        .slice(0, 12),
      baseFontSize: Number.parseFloat(getComputedStyle(body).fontSize),
      bodyPaddingBottom: Number.parseFloat(getComputedStyle(body).paddingBottom),
      bodyScrollWidth: body.scrollWidth,
      brokenImages: [...document.images]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")),
      dialogCount: document.querySelectorAll("dialog[data-quote-dialog]").length,
      dialogIsNative: document.querySelector("[data-quote-dialog]") instanceof HTMLDialogElement,
      dialogStepCount: document.querySelectorAll("[data-quote-step]").length,
      emailLinkCount: document.querySelectorAll("a[href^='mailto:']").length,
      featuredBadgeCount: document.querySelectorAll(".package-layout > a.package .package__badge").length,
      formCount: document.querySelectorAll("form[data-quote-form]").length,
      gallery: gallery
        ? {
            cardCount: gallery.querySelectorAll(".package-photo-card").length,
            className: gallery.className,
            enhanced: gallery.classList.contains("is-enhanced"),
            toggleExpanded: galleryToggle?.getAttribute("aria-expanded") ?? null,
            toggleOutside: Boolean(galleryToggle && !gallery.contains(galleryToggle)),
            toggleVisible: Boolean(galleryToggle && visible(galleryToggle)),
          }
        : null,
      h1Count: document.querySelectorAll("h1").length,
      headerLinkCount: [...document.querySelectorAll(".desktop-nav a")].filter(visible).length,
      heroActionCount: [...document.querySelectorAll(".hero__actions :is(a[href], button)")].filter(visible).length,
      heroImageSource: heroImage?.currentSrc || "",
      heroResponsiveSources: [...(heroPicture?.querySelectorAll("source") ?? [])].map((source) => ({
        sizes: source.getAttribute("sizes") || "",
        srcset: source.getAttribute("srcset") || "",
        type: source.getAttribute("type") || "",
      })),
      pageKind: body.classList.contains("package-detail-page") ? "detail" : "home",
      lang: root.lang,
      mainCount: document.querySelectorAll("main").length,
      missingNames,
      mobileDock: {
        ariaHidden: dock?.getAttribute("aria-hidden") ?? null,
        bottom: dockRect?.bottom ?? -1,
        enhanced: dock?.classList.contains("is-enhanced") ?? false,
        height: dockRect?.height ?? 0,
        inert: dock?.inert ?? false,
        position: dockStyle?.position ?? "",
        visible: Boolean(dock && visible(dock)),
        visibleClass: dock?.classList.contains("is-visible") ?? false,
      },
      packageContact: packageContactDetails
        ? {
            display: getComputedStyle(packageContactDetails).display,
            gridColumns: getComputedStyle(packageContactDetails).gridTemplateColumns === "none"
              ? 0
              : getComputedStyle(packageContactDetails).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
            links: [...packageContactDetails.querySelectorAll("a[href^='tel:'], a[href^='mailto:']")].map((link) => ({
              href: link.getAttribute("href") || "",
              visible: visible(link),
              ...rectOf(link),
            })),
            visible: visible(packageContactDetails),
            ...rectOf(packageContactDetails),
          }
        : null,
      overviewBeforeMedia: Boolean(
        overview &&
        media &&
        overview.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      overflowing,
      packageCards,
      packageGridColumns: packageLayout && visible(packageLayout)
        ? getComputedStyle(packageLayout).gridTemplateColumns.split(/\\s+/).filter(Boolean).length
        : 0,
      phoneLinkCount: document.querySelectorAll("a[href^='tel:']").length,
      quoteTriggerCount: document.querySelectorAll("[data-quote-trigger]").length,
      ready: root.dataset.ready,
      rootScrollWidth: root.scrollWidth,
      smallTargets,
      touchPoints: navigator.maxTouchPoints,
      undersizedText,
      videoCardCount: videoCards.length,
      videoCaptions: videoCards.map((card) => card.querySelector("figcaption")?.textContent.trim() || ""),
      videoElementCount: document.querySelectorAll("video, iframe").length,
      videoPlayAffordanceCount: document.querySelectorAll(".package-video-card__play").length,
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
      whatsappFallbacks: [...document.querySelectorAll("[data-quote-trigger], [data-quote-whatsapp]")]
        .every((link) => link.href.startsWith("https://wa.me/905386888306?text=")),
    };
  })()`;
}

function assertPageAudit(audit, page, viewport) {
  const context = `${page.name}/${viewport.width}x${viewport.height}`;
  assert(audit.lang === "tr", `${context}: html lang tr değil.`);
  assert(audit.h1Count === 1, `${context}: h1 sayısı ${audit.h1Count}.`);
  assert(audit.mainCount === 1, `${context}: main sayısı ${audit.mainCount}.`);
  assert(audit.ready === "true", `${context}: sayfa bootstrap tamamlanmadı.`);
  assert(audit.pageKind === page.kind, `${context}: sayfa türü ${audit.pageKind}.`);
  assert(audit.rootScrollWidth <= audit.viewportWidth, `${context}: kök yatay taşıyor (${audit.rootScrollWidth} > ${audit.viewportWidth}); ${JSON.stringify(audit.overflowing)}.`);
  assert(audit.bodyScrollWidth <= audit.viewportWidth, `${context}: body yatay taşıyor (${audit.bodyScrollWidth} > ${audit.viewportWidth}).`);
  assert(audit.missingNames.length === 0, `${context}: isimsiz kontroller ${JSON.stringify(audit.missingNames)}.`);
  assert(audit.smallTargets.length === 0, `${context}: 44px altı hedefler ${JSON.stringify(audit.smallTargets)}.`);
  assert(audit.brokenImages.length === 0, `${context}: yüklenemeyen görseller ${JSON.stringify(audit.brokenImages)}.`);
  assert(audit.badFontWeights.length === 0, `${context}: geçersiz 750 font ağırlığı ${JSON.stringify(audit.badFontWeights)}.`);
  assert(audit.dialogCount === 1 && audit.dialogIsNative, `${context}: tek native teklif dialogu bulunamadı.`);
  assert(audit.dialogStepCount === 3, `${context}: teklif adımı sayısı ${audit.dialogStepCount}.`);
  assert(audit.formCount === 1, `${context}: teklif formu sayısı ${audit.formCount}.`);
  assert(audit.quoteTriggerCount >= 2, `${context}: teklif tetikleyicileri eksik (${audit.quoteTriggerCount}).`);
  assert(audit.whatsappFallbacks, `${context}: WhatsApp JS/fallback bağlantı sözleşmesi bozuk.`);
  assert(audit.phoneLinkCount >= 1 && audit.emailLinkCount >= 1, `${context}: telefon/e-posta iletişim bağlantıları eksik.`);
  assert(audit.mobileDock.enhanced, `${context}: mobil dock geliştirilmiş moda geçmedi.`);
  assert(audit.touchPoints > 0 === viewport.touch, `${context}: dokunma emülasyonu beklenen durumda değil (${audit.touchPoints}).`);

  if (viewport.width < 768) {
    assert(audit.baseFontSize >= 16, `${context}: mobil gövde yazısı 16px altında (${audit.baseFontSize}px).`);
    assert(audit.undersizedText.length === 0, `${context}: mobilde 14px altı görünür metin var (${JSON.stringify(audit.undersizedText)}).`);
    assert(audit.headerLinkCount === 0, `${context}: mobil başlık logo dışında navigasyon gösteriyor.`);
    assert(!audit.mobileDock.visible, `${context}: dock hero üzerindeyken görünür.`);
    assert(audit.mobileDock.ariaHidden === "true" && audit.mobileDock.inert, `${context}: gizli dock erişilebilirlik ağacından çıkarılmadı.`);
  } else {
    assert(audit.headerLinkCount === 2, `${context}: masaüstü/tablet navigasyonu iki bağlantı içermiyor.`);
    assert(!audit.mobileDock.visible, `${context}: mobil dock 768px+ görünür.`);
  }

  if (page.kind === "home") {
    assert(audit.heroActionCount === 1, `${context}: hero tek CTA içermiyor (${audit.heroActionCount}).`);
    assert(audit.featuredBadgeCount === 2, `${context}: öne çıkan paket rozeti sayısı ${audit.featuredBadgeCount}.`);
    assert(audit.packageCards.length === 6, `${context}: birleşik paket gridinde ${audit.packageCards.length} kart var.`);
    assert(audit.packageCards.every((card) => card.tagName === "A" && card.href), `${context}: paket kartlarının tamamı bağlantı değil.`);
    assert(audit.packageCards.every((card) => card.fontSize >= 14), `${context}: 14px altı paket başlığı var (${JSON.stringify(audit.packageCards.map((card) => card.fontSize))}).`);
    assert(new Set(audit.packageCards.map((card) => card.imageSource)).size === 6, `${context}: paketler altı benzersiz seçilmiş görsel kullanmıyor.`);
    assert(
      audit.packageCards.every((card) =>
        card.responsiveSources.some((source) => source.type === "image/avif" && source.srcset && source.sizes)
        && card.responsiveSources.some((source) => source.type === "image/webp" && source.srcset && source.sizes)),
      `${context}: paket kartlarının responsive AVIF/WebP srcset-sizes sözleşmesi eksik.`,
    );
    assert(audit.packageGridColumns === (viewport.width < 768 ? 2 : 3), `${context}: paket grid sütunu ${audit.packageGridColumns}.`);
    assert(
      audit.packageCards.filter((card) => card.summaryVisible).length === (viewport.width < 768 ? 0 : 6),
      `${context}: mobil/masaüstü paket açıklaması görünürlüğü hatalı.`,
    );
    assert(
      audit.heroResponsiveSources.some((source) => source.type === "image/avif" && source.srcset)
      && audit.heroResponsiveSources.some((source) => source.type === "image/webp" && source.srcset),
      `${context}: hero responsive AVIF/WebP kaynakları eksik.`,
    );
  } else {
    assert(audit.packageContact?.visible, `${context}: final CTA iletişim kanalları görünür değil.`);
    assert(
      audit.packageContact?.links.length === 2
      && audit.packageContact.links.every((link) => link.visible)
      && audit.packageContact.links.some((link) => link.href.startsWith("tel:"))
      && audit.packageContact.links.some((link) => link.href.startsWith("mailto:")),
      `${context}: final CTA içinde görünür telefon/e-posta bağlantıları bulunamadı (${JSON.stringify(audit.packageContact)}).`,
    );
    if (viewport.width < 768) {
      assert(
        audit.packageContact.display === "grid"
        && audit.packageContact.gridColumns === 1
        && audit.packageContact.links.every((link) =>
          Math.abs(link.left - audit.packageContact.left) <= 1
          && Math.abs(link.right - audit.packageContact.right) <= 1),
        `${context}: mobil final CTA iletişim bağlantıları tek sütun/tam genişlik değil (${JSON.stringify(audit.packageContact)}).`,
      );
    }
    assert(audit.overviewBeforeMedia, `${context}: paket açıklaması ve kapsam galeri/video alanından önce değil.`);
    assert(audit.gallery?.cardCount === 8, `${context}: galeri sekiz görsel içermiyor (${audit.gallery?.cardCount}).`);
    assert(audit.gallery?.enhanced, `${context}: galeri JS geliştirmesi başlatılmadı.`);
    assert(audit.gallery?.toggleOutside, `${context}: galeri aç/kapat kontrolü galeri kapsayıcısının içinde.`);
    assert(audit.gallery?.toggleExpanded === "false", `${context}: galeri başlangıçta kapalı değil.`);
    assert(audit.gallery?.toggleVisible === (viewport.width < 768), `${context}: galeri kontrolü breakpoint görünürlüğü hatalı.`);
    assert(audit.videoCardCount === 2, `${context}: pasif video ön izlemesi sayısı ${audit.videoCardCount}.`);
    assert(audit.videoCaptions.every((caption) => caption === "Temsili video ön izlemesi"), `${context}: video ön izleme etiketi eksik.`);
    assert(audit.videoPlayAffordanceCount === 0, `${context}: yanıltıcı oynat ikonu bulundu.`);
    assert(audit.videoElementCount === 0, `${context}: pasif ön izlemede video/iframe bulundu.`);
  }
}

async function testMobileDock(cdp, sessionId, page, viewport) {
  const context = `${page.name}/${viewport.width}x${viewport.height}/dock`;
  await evaluate(cdp, sessionId, `(() => {
    const hero = document.querySelector(".hero, .package-detail-hero");
    window.scrollTo(0, hero.offsetTop + hero.offsetHeight + 8);
  })()`);
  if (viewport.width < 768) {
    await waitUntil(
      cdp,
      sessionId,
      "document.querySelector('[data-mobile-dock]').classList.contains('is-visible')",
      `${context}: hero geçişi IntersectionObserver tarafından algılanmadı.`,
    );
    await delay(380);
  } else {
    await delay(180);
  }
  const state = await evaluate(cdp, sessionId, `(() => {
    const dock = document.querySelector("[data-mobile-dock]");
    const rect = dock.getBoundingClientRect();
    const style = getComputedStyle(dock);
    const visible = style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    return {
      ariaHidden: dock.getAttribute("aria-hidden"),
      bottom: rect.bottom,
      bodyPaddingBottom: Number.parseFloat(getComputedStyle(document.body).paddingBottom),
      height: rect.height,
      inert: dock.inert,
      position: style.position,
      visible,
      visibleClass: dock.classList.contains("is-visible"),
    };
  })()`);

  if (viewport.width < 768) {
    assert(state.visible && state.visibleClass, `${context}: hero geçildikten sonra dock görünür olmadı (${JSON.stringify(state)}).`);
    assert(state.ariaHidden === "false" && !state.inert, `${context}: görünür dock etkileşime açılmadı.`);
    assert(state.position === "fixed", `${context}: dock sabit konumda değil (${state.position}).`);
    assert(Math.abs(state.bottom - viewport.height) <= 1, `${context}: dock viewport altına oturmuyor (${state.bottom}).`);
    assert(state.bodyPaddingBottom >= state.height, `${context}: dock için içerik alt rezervi yetersiz (${state.bodyPaddingBottom} < ${state.height}).`);
  } else {
    assert(!state.visible, `${context}: dock 768px+ görünür.`);
  }

  await evaluate(cdp, sessionId, "window.scrollTo(0, 0)");
  if (viewport.width < 768) {
    await waitUntil(
      cdp,
      sessionId,
      "!document.querySelector('[data-mobile-dock]').classList.contains('is-visible')",
      `${context}: hero dönüşünde dock gizlenmedi.`,
    );
  }
}

async function tabWithinDialog(cdp, sessionId, selector, context, maxTabs = 8) {
  for (let index = 0; index < maxTabs; index += 1) {
    await pressKey(cdp, sessionId, "Tab");
    const matches = await evaluate(cdp, sessionId, `document.activeElement?.matches(${JSON.stringify(selector)}) ?? false`);
    const focusState = await focusedControlState(cdp, sessionId);
    assertKeyboardFocus(focusState, `${context}/Tab-${index + 1}`);
    if (matches) return;
  }
  throw new Error(`${context}: ${selector} kontrolüne gerçek Tab ile ulaşılamadı.`);
}

async function testOpenDialogTextZoom(cdp, sessionId, page, viewport) {
  const context = `${page.name}/${viewport.width}x${viewport.height}/acik-dialog-yuzde-200-metin`;
  const audit = await evaluate(cdp, sessionId, `(async () => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    const dialog = document.querySelector("[data-quote-dialog]");
    const form = dialog.querySelector("[data-quote-form]");
    const date = dialog.querySelector("[data-quote-date]");
    root.style.fontSize = "200%";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const unreachableControls = [];
    const controlsWithoutScrollport = [];
    const touchedScrollports = new Map();
    const findScrollableAncestor = (element) => {
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== document.body) {
        const style = getComputedStyle(ancestor);
        if (["auto", "scroll"].includes(style.overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 1) {
          return ancestor;
        }
        if (ancestor === dialog) break;
        ancestor = ancestor.parentElement;
      }
      return null;
    };
    const viewportBounds = () => ({
      top: visualViewport?.offsetTop ?? 0,
      bottom: (visualViewport?.offsetTop ?? 0) + (visualViewport?.height ?? innerHeight),
    });
    const fullyVisibleWithin = (control, scrollport) => {
      const controlRect = control.getBoundingClientRect();
      const viewport = viewportBounds();
      const scrollportRect = scrollport?.getBoundingClientRect();
      const top = Math.max(viewport.top, scrollportRect?.top ?? viewport.top);
      const bottom = Math.min(viewport.bottom, scrollportRect?.bottom ?? viewport.bottom);
      return controlRect.top >= top - 0.5 && controlRect.bottom <= bottom + 0.5;
    };
    for (const control of dialog.querySelectorAll("[data-quote-step='date'] input, [data-quote-step='date'] button, [data-quote-step='date'] a[href]")) {
      const scrollport = findScrollableAncestor(control);
      if (scrollport) {
        if (!touchedScrollports.has(scrollport)) touchedScrollports.set(scrollport, scrollport.scrollTop);
        const scrollportRect = scrollport.getBoundingClientRect();
        const controlRect = control.getBoundingClientRect();
        scrollport.scrollTop += controlRect.top - scrollportRect.top - 8;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      } else if (!fullyVisibleWithin(control, null)) {
        controlsWithoutScrollport.push(control.matches("[data-quote-date]") ? "date" : control.outerHTML.slice(0, 80));
      }
      if (!fullyVisibleWithin(control, scrollport)) {
        unreachableControls.push(control.matches("[data-quote-date]") ? "date" : control.outerHTML.slice(0, 80));
      }
    }
    const viewportHeight = visualViewport?.height ?? innerHeight;
    const viewportWidth = visualViewport?.width ?? innerWidth;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const dialogRect = dialog.getBoundingClientRect();
    const formRect = form.getBoundingClientRect();
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const clipped = [...dialog.querySelectorAll("h2, p, legend, label, span, a, button")]
      .filter((element) => visible(element) && element.textContent.trim())
      .filter((element) => {
        const style = getComputedStyle(element);
        const clipsX = ["hidden", "clip"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
        const clipsY = ["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
        const rect = element.getBoundingClientRect();
        let ancestor = element.parentElement;
        let clippedByAncestor = false;
        while (ancestor && ancestor !== document.body) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (["auto", "scroll"].includes(ancestorStyle.overflowX) || ["auto", "scroll"].includes(ancestorStyle.overflowY)) break;
          if (["hidden", "clip"].includes(ancestorStyle.overflowX) || ["hidden", "clip"].includes(ancestorStyle.overflowY)) {
            const ancestorRect = ancestor.getBoundingClientRect();
            if (
              rect.left < ancestorRect.left - 0.5 ||
              rect.right > ancestorRect.right + 0.5 ||
              rect.top < ancestorRect.top - 0.5 ||
              rect.bottom > ancestorRect.bottom + 0.5
            ) {
              clippedByAncestor = true;
              break;
            }
          }
          ancestor = ancestor.parentElement;
        }
        return clipsX || clipsY || clippedByAncestor;
      })
      .map((element) => ({ className: element.className || element.tagName, text: element.textContent.trim().slice(0, 60) }))
      .slice(0, 12);
    const result = {
      clipped,
      controlsWithoutScrollport,
      dialogHorizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
      dialogInViewport: dialogRect.left >= viewportLeft - 1 && dialogRect.right <= viewportLeft + viewportWidth + 1 && dialogRect.top >= viewportTop - 1 && dialogRect.bottom <= viewportTop + viewportHeight + 1,
      formHeight: formRect.height,
      rootScrollWidth: root.scrollWidth,
      scrollableAncestorCount: touchedScrollports.size,
      unreachableControls,
      viewportWidth: innerWidth,
    };
    for (const [scrollport, scrollTop] of touchedScrollports) scrollport.scrollTop = scrollTop;
    root.style.fontSize = previous;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    date.focus();
    return result;
  })()`);
  assert(audit.dialogInViewport, `${context}: dialog viewport dışına taşıyor (${JSON.stringify(audit)}).`);
  assert(!audit.dialogHorizontalOverflow && audit.rootScrollWidth <= audit.viewportWidth, `${context}: yatay reflow bozuldu (${JSON.stringify(audit)}).`);
  assert(audit.formHeight >= 44 && audit.controlsWithoutScrollport.length === 0 && audit.unreachableControls.length === 0, `${context}: header sonrası form/aktif alan erişilebilir değil (${JSON.stringify(audit)}).`);
  assert(audit.clipped.length === 0, `${context}: dialog metni kırpılıyor (${JSON.stringify(audit.clipped)}).`);
}

async function testKeyboardAndQuote(cdp, sessionId, page, viewport) {
  const context = `${page.name}/${viewport.width}x${viewport.height}`;
  await evaluate(cdp, sessionId, `(() => {
    history.replaceState(null, "", location.pathname);
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  })()`);
  await pressKey(cdp, sessionId, "Tab");
  await delay(220);
  const skipState = await evaluate(cdp, sessionId, `(() => ({
    isSkipLink: document.activeElement?.matches(".skip-link") ?? false,
    state: null,
  }))()`);
  assert(skipState.isSkipLink, `${context}: ilk gerçek Tab odağı skip-link değil.`);
  assertKeyboardFocus(await focusedControlState(cdp, sessionId), `${context}/skip-link`);
  await pressKey(cdp, sessionId, "Enter");
  const skipResult = await evaluate(cdp, sessionId, `(() => ({
    activeId: document.activeElement?.id || "",
    hash: location.hash,
  }))()`);
  assert(skipResult.hash === "#main-content" && skipResult.activeId === "main-content", `${context}: skip-link ana içeriğe odak taşımadı (${JSON.stringify(skipResult)}).`);

  await evaluate(cdp, sessionId, `(() => {
    history.replaceState(null, "", location.pathname);
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  })()`);
  await tabToQuoteTrigger(cdp, sessionId, `${context}/teklif-tetikleyici`);
  await pressKey(cdp, sessionId, "Enter");
  await waitUntil(cdp, sessionId, "document.querySelector('[data-quote-dialog]')?.open === true", `${context}: teklif dialogu Enter ile açılmadı.`);
  await delay(50);

  const openState = await evaluate(cdp, sessionId, `(() => {
    const dialog = document.querySelector("[data-quote-dialog]");
    const rect = dialog.getBoundingClientRect();
    const activeStep = dialog.querySelector("[data-quote-step][data-active]:not([hidden])");
    const visible = (element) => {
      const style = getComputedStyle(element);
      const elementRect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && elementRect.width > 0 && elementRect.height > 0;
    };
    return {
      activeStep: activeStep?.dataset.quoteStep || "",
      bottomGap: innerHeight - rect.bottom,
      dateFocused: document.activeElement?.matches("[data-quote-date]") ?? false,
      height: rect.height,
      isModal: dialog.matches(":modal"),
      leftGap: rect.left,
      rightGap: innerWidth - rect.right,
      selectedService: dialog.querySelector("[data-quote-service]")?.value || "",
      undersizedText: [...dialog.querySelectorAll("*")]
        .filter(visible)
        .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
        .map((element) => ({
          className: element.className || "",
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
          tag: element.tagName,
          text: element.textContent.trim().slice(0, 60),
        }))
        .filter(({ fontSize }) => fontSize < 13.99)
        .slice(0, 16),
      width: rect.width,
    };
  })()`);
  assert(openState.isModal && openState.activeStep === "date" && openState.dateFocused, `${context}: native modal ilk adım/fokus sözleşmesi bozuk (${JSON.stringify(openState)}).`);
  assert(openState.selectedService === (page.serviceName || "Kararsızım"), `${context}: paket ön seçimi hatalı (${openState.selectedService}).`);
  if (viewport.width < 768) {
    assert(Math.abs(openState.bottomGap) <= 1 && openState.width >= viewport.width - 1, `${context}: mobil teklif akışı alt sayfa değil (${JSON.stringify(openState)}).`);
    assert(openState.undersizedText.length === 0, `${context}: mobil teklif akışında 14px altı görünür metin var (${JSON.stringify(openState.undersizedText)}).`);
  } else {
    assert(openState.leftGap >= 16 && openState.rightGap >= 16 && Math.abs(openState.leftGap - openState.rightGap) <= 2, `${context}: masaüstü teklif akışı ortalanmış modal değil (${JSON.stringify(openState)}).`);
  }

  await testOpenDialogTextZoom(cdp, sessionId, page, viewport);

  await tabWithinDialog(cdp, sessionId, "[data-quote-next]", `${context}/tarih-doğrulama`);
  await pressKey(cdp, sessionId, "Enter");
  const invalidDate = await evaluate(cdp, sessionId, `(() => ({
    activeStep: document.querySelector("[data-quote-step][data-active]")?.dataset.quoteStep || "",
    errorVisible: [...document.querySelectorAll("[data-quote-step='date'] [data-quote-error]")].some((error) => !error.hidden && error.textContent.trim()),
    invalid: document.querySelector("[data-quote-date]")?.getAttribute("aria-invalid"),
    refocused: document.activeElement?.matches("[data-quote-date]") ?? false,
  }))()`);
  assert(invalidDate.activeStep === "date" && invalidDate.errorVisible && invalidDate.invalid === "true" && invalidDate.refocused, `${context}: tarih doğrulaması fail-closed çalışmıyor (${JSON.stringify(invalidDate)}).`);

  await tabWithinDialog(cdp, sessionId, "[data-quote-date-unknown]", `${context}/tarih-belirsiz`);
  await pressKey(cdp, sessionId, "Space");
  const unknownDate = await evaluate(cdp, sessionId, `(() => ({
    checked: document.querySelector("[data-quote-date-unknown]")?.checked ?? false,
    dateDisabled: document.querySelector("[data-quote-date]")?.disabled ?? false,
  }))()`);
  assert(unknownDate.checked && unknownDate.dateDisabled, `${context}: tarih Henüz net değil seçimi Space ile çalışmadı.`);
  await tabWithinDialog(cdp, sessionId, "[data-quote-next]", `${context}/tarih-devam`);
  await pressKey(cdp, sessionId, "Enter");
  await waitUntil(cdp, sessionId, "document.querySelector(\"[data-quote-step='city']\")?.hasAttribute('data-active')", `${context}: şehir adımına geçilemedi.`);

  await tabWithinDialog(cdp, sessionId, "[data-quote-city-unknown]", `${context}/sehir-belirsiz`);
  await pressKey(cdp, sessionId, "Space");
  await tabWithinDialog(cdp, sessionId, "[data-quote-next]", `${context}/sehir-devam`);
  await pressKey(cdp, sessionId, "Enter");
  await waitUntil(cdp, sessionId, "document.querySelector(\"[data-quote-step='package']\")?.hasAttribute('data-active')", `${context}: paket adımına geçilemedi.`);
  await tabWithinDialog(cdp, sessionId, "[data-quote-whatsapp]", `${context}/whatsapp-sonuc`);

  const finalState = await evaluate(cdp, sessionId, `(() => {
    const link = document.querySelector("[data-quote-whatsapp]");
    const url = new URL(link.href);
    return {
      host: url.host,
      message: url.searchParams.get("text") || "",
      pathname: url.pathname,
      service: document.querySelector("[data-quote-service]")?.value || "",
    };
  })()`);
  assert(finalState.host === "wa.me" && finalState.pathname === "/905386888306", `${context}: final WhatsApp URL hedefi hatalı (${JSON.stringify(finalState)}).`);
  assert(finalState.message.includes("Etkinlik tarihi: Henüz net değil"), `${context}: WhatsApp mesajında tarih seçimi yok.`);
  assert(finalState.message.includes("Şehir: Henüz net değil"), `${context}: WhatsApp mesajında şehir seçimi yok.`);
  assert(finalState.message.includes(finalState.service), `${context}: WhatsApp mesajında paket seçimi yok.`);

  await pressKey(cdp, sessionId, "Escape");
  await waitUntil(cdp, sessionId, "document.querySelector('[data-quote-dialog]')?.open === false", `${context}: dialog Escape ile kapanmadı.`);
  const returnedFocus = await evaluate(cdp, sessionId, "document.activeElement === globalThis.__e2eQuoteOpener");
  assert(returnedFocus, `${context}: dialog kapanınca odak tetikleyiciye dönmedi.`);
}

async function testGalleryKeyboard(cdp, sessionId, page, viewport) {
  if (page.kind !== "detail" || viewport.width >= 768) return;
  const context = `${page.name}/${viewport.width}x${viewport.height}/galeri`;
  await evaluate(cdp, sessionId, `(async () => {
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    const toggle = document.querySelector("[data-package-gallery-toggle]");
    root.style.scrollBehavior = "auto";
    toggle.focus();
    toggle.scrollIntoView({ block: "center", behavior: "auto" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    root.style.scrollBehavior = previousScrollBehavior;
  })()`);
  const toggleVisibleExpression = `(() => {
    const toggle = document.querySelector("[data-package-gallery-toggle]");
    const rect = toggle.getBoundingClientRect();
    const dock = document.querySelector("[data-mobile-dock]");
    const dockStyle = dock ? getComputedStyle(dock) : null;
    const dockRect = dock?.getBoundingClientRect();
    const dockVisible = Boolean(dock && dockStyle.display !== "none" && dockStyle.visibility !== "hidden" && Number.parseFloat(dockStyle.opacity) > 0 && dockRect.width > 0 && dockRect.height > 0);
    const viewportBottom = dockVisible ? Math.min(innerHeight, dockRect.top) : innerHeight;
    return document.activeElement === toggle && rect.top >= 0 && rect.bottom <= viewportBottom;
  })()`;
  await waitUntil(cdp, sessionId, toggleVisibleExpression, `${context}: galeri kontrolü dock dışında görünür konuma yerleşmedi.`);
  assertKeyboardFocus(await focusedControlState(cdp, sessionId), `${context}/kapali`);
  await pressKey(cdp, sessionId, "Space");
  const expanded = await evaluate(cdp, sessionId, `(() => {
    const gallery = document.querySelector(".package-photo-gallery");
    const toggle = document.querySelector("[data-package-gallery-toggle]");
    return {
      allCardsVisible: [...gallery.querySelectorAll(".package-photo-card")].every((card) => {
        const style = getComputedStyle(card);
        const rect = card.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }),
      expanded: toggle.getAttribute("aria-expanded"),
      isExpanded: gallery.classList.contains("is-expanded") && !gallery.classList.contains("is-collapsed"),
      label: toggle.textContent.trim(),
    };
  })()`);
  assert(expanded.expanded === "true" && expanded.isExpanded && expanded.allCardsVisible && /Daha az/i.test(expanded.label), `${context}: Space ile galeri açılmadı (${JSON.stringify(expanded)}).`);
  await pressKey(cdp, sessionId, "Space");
  await waitUntil(
    cdp,
    sessionId,
    `(() => {
      const gallery = document.querySelector(".package-photo-gallery");
      const toggle = document.querySelector("[data-package-gallery-toggle]");
      return gallery.classList.contains("is-collapsed") && !gallery.classList.contains("is-expanded") && toggle.getAttribute("aria-expanded") === "false";
    })()`,
    `${context}: galeri kapanma durumu tamamlanmadı.`,
  );
  await waitUntil(cdp, sessionId, toggleVisibleExpression, `${context}: galeri kapanınca odak dock dışında görünür kalmadı.`);
  const collapsed = await evaluate(cdp, sessionId, `(() => {
    const gallery = document.querySelector(".package-photo-gallery");
    const toggle = document.querySelector("[data-package-gallery-toggle]");
    return {
      expanded: toggle.getAttribute("aria-expanded"),
      focused: document.activeElement === toggle,
      isCollapsed: gallery.classList.contains("is-collapsed") && !gallery.classList.contains("is-expanded"),
      label: toggle.textContent.trim(),
    };
  })()`);
  assert(collapsed.expanded === "false" && collapsed.isCollapsed && collapsed.focused && /Tümünü/i.test(collapsed.label), `${context}: galeri kapanınca durum/odak korunmadı (${JSON.stringify(collapsed)}).`);
  assertKeyboardFocus(await focusedControlState(cdp, sessionId), `${context}/yeniden-kapali`);
}

async function testTextZoom(cdp, sessionId, page, viewport) {
  const context = `${page.name}/${viewport.width}x${viewport.height}/yuzde-200-metin`;
  const audit = await evaluate(cdp, sessionId, `(async () => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = "200%";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const clipped = [...document.querySelectorAll("h1, h2, h3, p, li, a, button, label, legend, figcaption, .package__badge, .package__title--short, .package__title--full")]
      .filter((element) => visible(element) && element.textContent.trim())
      .filter((element) => {
        const style = getComputedStyle(element);
        const clipsX = ["hidden", "clip"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
        const clipsY = ["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
        const rect = element.getBoundingClientRect();
        let ancestor = element.parentElement;
        let clippedByAncestor = false;
        while (ancestor && ancestor !== document.body) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (["auto", "scroll"].includes(ancestorStyle.overflowX) || ["auto", "scroll"].includes(ancestorStyle.overflowY)) break;
          if (["hidden", "clip"].includes(ancestorStyle.overflowX) || ["hidden", "clip"].includes(ancestorStyle.overflowY)) {
            const ancestorRect = ancestor.getBoundingClientRect();
            if (
              rect.left < ancestorRect.left - 0.5 ||
              rect.right > ancestorRect.right + 0.5 ||
              rect.top < ancestorRect.top - 0.5 ||
              rect.bottom > ancestorRect.bottom + 0.5
            ) {
              clippedByAncestor = true;
              break;
            }
          }
          ancestor = ancestor.parentElement;
        }
        return clipsX || clipsY || clippedByAncestor;
      })
      .map((element) => ({ className: element.className || element.tagName, text: element.textContent.trim().slice(0, 60) }))
      .slice(0, 12);
    const result = {
      bodyScrollWidth: document.body.scrollWidth,
      clipped,
      overlappingPackageText: [...document.querySelectorAll(".package")]
        .map((card) => {
          const badge = card.querySelector(".package__badge");
          const heading = card.querySelector("h3");
          if (!badge || !heading || !visible(badge) || !visible(heading)) return null;
          const badgeRect = badge.getBoundingClientRect();
          const cardRect = card.getBoundingClientRect();
          const headingRect = heading.getBoundingClientRect();
          const overlaps = badgeRect.right > headingRect.left + 0.5
            && badgeRect.left < headingRect.right - 0.5
            && badgeRect.bottom > headingRect.top + 0.5
            && badgeRect.top < headingRect.bottom - 0.5;
          const outsideCard = badgeRect.left < cardRect.left - 0.5
            || badgeRect.right > cardRect.right + 0.5
            || badgeRect.top < cardRect.top - 0.5
            || badgeRect.bottom > cardRect.bottom + 0.5;
          const clippedBadgeText = badge.scrollWidth > badge.clientWidth + 1 || badge.scrollHeight > badge.clientHeight + 1;
          return overlaps || outsideCard || clippedBadgeText ? card.id || card.getAttribute("href") : null;
        })
        .filter(Boolean),
      rootScrollWidth: root.scrollWidth,
      viewportWidth: innerWidth,
    };
    root.style.fontSize = previous;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return result;
  })()`);
  assert(audit.rootScrollWidth <= audit.viewportWidth && audit.bodyScrollWidth <= audit.viewportWidth, `${context}: yatay reflow bozuldu (${JSON.stringify(audit)}).`);
  assert(audit.clipped.length === 0, `${context}: büyütülmüş metin kırpılıyor (${JSON.stringify(audit.clipped)}).`);
  assert(audit.overlappingPackageText.length === 0, `${context}: öne çıkan rozet paket başlığıyla çakışıyor (${JSON.stringify(audit.overlappingPackageText)}).`);
}

async function resetForScreenshot(cdp, sessionId, page, viewport) {
  await evaluate(cdp, sessionId, `(() => {
    const dialog = document.querySelector("dialog[open]");
    if (dialog) dialog.close();
    document.activeElement?.blur();
    history.replaceState(null, "", location.pathname);
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    document.documentElement.style.scrollBehavior = previousScrollBehavior;
  })()`);
  if (viewport.width < 768) {
    await waitUntil(
      cdp,
      sessionId,
      `(() => {
        const dock = document.querySelector("[data-mobile-dock]");
        return scrollY === 0 && !dock.classList.contains("is-visible") && dock.getAttribute("aria-hidden") === "true" && dock.inert;
      })()`,
      `${page.name}/${viewport.width}x${viewport.height}: ekran görüntüsü öncesi dock deterministik gizlenmedi.`,
    );
    await delay(380);
  } else {
    await delay(120);
  }
}


async function auditPage({ cdp, origin, page, viewport }) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const context = `${page.name}/${viewport.width}x${viewport.height}`;
  const failures = [];
  const pendingRequests = new Map();

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
      if (message.sessionId !== sessionId) return;
      const url = message.params.request.url;
      if (url.startsWith(origin)) pendingRequests.set(message.params.requestId, url);
    }),
    cdp.on("Network.loadingFinished", (message) => {
      if (message.sessionId === sessionId) pendingRequests.delete(message.params.requestId);
    }),
    cdp.on("Network.loadingFailed", (message) => {
      if (message.sessionId !== sessionId) return;
      const url = pendingRequests.get(message.params.requestId);
      pendingRequests.delete(message.params.requestId);
      if (url) failures.push(`requestfailed: ${url} (${message.params.errorText})`);
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
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: vitalsObserverSource }, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: viewport.height,
      mobile: viewport.touch,
      screenHeight: viewport.height,
      screenOrientation: viewport.width > viewport.height
        ? { angle: 90, type: "landscapePrimary" }
        : { angle: 0, type: "portraitPrimary" },
      screenWidth: viewport.width,
      width: viewport.width,
    }, sessionId);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: viewport.touch,
      maxTouchPoints: viewport.touch ? 5 : 1,
    }, sessionId);

    if (viewport.width === 375) {
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      }, sessionId);
    }

    const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
    const navigation = await cdp.send("Page.navigate", { url: `${origin}${page.pathname}` }, sessionId);
    assert(!navigation.errorText, `${context}: yönlendirme hatası ${navigation.errorText}.`);
    await loaded;
    await evaluate(cdp, sessionId, "document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    await delay(900);

    const vitals = await evaluate(cdp, sessionId, `(() => ({
      cls: globalThis.__e2eVitals?.cls ?? null,
      lcp: globalThis.__e2eVitals?.lcp ?? null,
      supported: globalThis.__e2eVitals?.supported ?? null,
    }))()`);
    assert(vitals.supported?.cls && vitals.supported?.lcp, `${context}: LCP/CLS PerformanceObserver desteği yok; sahte geçiş yapılmadı.`);
    assert(Number.isFinite(vitals.lcp) && vitals.lcp > 0, `${context}: LCP güvenilir biçimde ölçülemedi (${vitals.lcp}).`);
    assert(vitals.lcp <= 2_500, `${context}: LCP bütçesi aşıldı (${Math.round(vitals.lcp)}ms > 2500ms).`);
    assert(Number.isFinite(vitals.cls) && vitals.cls <= 0.1, `${context}: CLS bütçesi aşıldı (${vitals.cls} > 0.1).`);

    await evaluate(cdp, sessionId, `(async () => {
      const images = [...document.images];
      images.forEach((image) => { image.loading = "eager"; });
      const unfinished = images.filter((image) => !image.complete);
      if (unfinished.length > 0) {
        await Promise.race([
          Promise.all(unfinished.map((image) => new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          }))),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Görsel yükleme zaman aşımı.")), 10_000)),
        ]);
      }
      await Promise.all(images.map((image) => typeof image.decode === "function" ? image.decode().catch(() => {}) : undefined));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`);
    await evaluate(cdp, sessionId, "window.scrollTo(0, 0)");
    await delay(180);

    const audit = await evaluate(cdp, sessionId, pageAuditExpression());
    assertPageAudit(audit, page, viewport);

    if (page.kind === "home" && viewport.width === 375) {
      assert(/\.(?:avif|webp)$/i.test(new URL(audit.heroImageSource).pathname), `${context}: seçilen hero kaynağı AVIF/WebP değil (${audit.heroImageSource}).`);
      const heroBytes = await contentLength(audit.heroImageSource, `${context}/hero`);
      assert(heroBytes <= 500 * 1024, `${context}: seçilen hero ${heroBytes} bayt; 500 KiB bütçesini aşıyor.`);
      for (const [index, card] of audit.packageCards.entries()) {
        assert(/\.(?:avif|webp)$/i.test(new URL(card.imageSource).pathname), `${context}: ${index + 1}. kart AVIF/WebP seçmedi (${card.imageSource}).`);
        const bytes = await contentLength(card.imageSource, `${context}/${index + 1}. kart`);
        assert(bytes <= 100 * 1024, `${context}: ${index + 1}. kart ${bytes} bayt; 100 KiB bütçesini aşıyor.`);
      }
    }

    await runAxeAudit(cdp, sessionId, context);

    if (viewport.width === 375) {
      const reducedMotion = await evaluate(cdp, sessionId, `(() => {
        const target = document.querySelector(".hero__copy, .package-detail-hero__copy") || document.body;
        const durations = getComputedStyle(target).animationDuration
          .split(",")
          .map((value) => Number.parseFloat(value) * (value.includes("ms") ? 0.001 : 1));
        return { durations, matches: matchMedia("(prefers-reduced-motion: reduce)").matches };
      })()`);
      assert(reducedMotion.matches, `${context}: reduced-motion emülasyonu çalışmadı.`);
      assert(reducedMotion.durations.every((duration) => duration <= 0.01), `${context}: hero animasyonu reduced-motion altında sürüyor (${reducedMotion.durations}).`);
    }

    await testMobileDock(cdp, sessionId, page, viewport);
    await testKeyboardAndQuote(cdp, sessionId, page, viewport);
    await testGalleryKeyboard(cdp, sessionId, page, viewport);
    await testTextZoom(cdp, sessionId, page, viewport);

    const axTree = await cdp.send("Accessibility.getFullAXTree", {}, sessionId);
    const unnamedInteractive = axTree.nodes.filter((node) =>
      ["button", "link", "textbox", "combobox"].includes(node.role?.value)
      && !node.ignored
      && !String(node.name?.value || "").trim());
    assert(unnamedInteractive.length === 0, `${context}: erişilebilirlik ağacında isimsiz etkileşim var.`);

    await delay(180);
    if (pendingRequests.size > 0) failures.push(`tamamlanmamış istekler: ${JSON.stringify([...pendingRequests.values()])}`);
    assert(failures.length === 0, `${context}: ${failures.join(" | ")}`);

    await resetForScreenshot(cdp, sessionId, page, viewport);
    const screenshot = await cdp.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    }, sessionId);
    const screenshotPath = path.join(resultDirectory, `${page.name}-${viewport.width}x${viewport.height}.png`);
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    return { audit, screenshotPath, vitals };
  } finally {
    for (const remove of removeListeners) remove();
    await cdp.send("Target.closeTarget", { targetId: target.targetId }).catch(() => {});
  }
}

async function auditNoJsFallback({ cdp, origin, page }) {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const context = `${page.name}/no-js`;

  try {
    await Promise.all([
      cdp.send("Page.enable", {}, sessionId),
      cdp.send("Runtime.enable", {}, sessionId),
      cdp.send("Network.enable", {}, sessionId),
    ]);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 812,
      mobile: true,
      screenHeight: 812,
      screenOrientation: { angle: 0, type: "portraitPrimary" },
      screenWidth: 375,
      width: 375,
    }, sessionId);
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: true }, sessionId);
    const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
    const navigation = await cdp.send("Page.navigate", { url: `${origin}${page.pathname}` }, sessionId);
    assert(!navigation.errorText, `${context}: yönlendirme hatası ${navigation.errorText}.`);
    await loaded;
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: false }, sessionId);

    const audit = await evaluate(cdp, sessionId, `(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const gallery = document.querySelector(".package-photo-gallery");
      const galleryRect = gallery?.getBoundingClientRect();
      const cards = [...document.querySelectorAll(".package-photo-card")];
      const toggle = document.querySelector("[data-package-gallery-toggle]");
      return {
        galleryCardsAccessible: gallery
          ? cards.every((card) => {
              const rect = card.getBoundingClientRect();
              return visible(card) && rect.top >= galleryRect.top - 1 && rect.bottom <= galleryRect.bottom + 1;
            })
          : null,
        galleryCount: cards.length,
        galleryEnhanced: gallery?.classList.contains("is-enhanced") ?? false,
        packageCount: document.querySelectorAll(".package-layout > a.package").length,
        ready: document.documentElement.dataset.ready || "",
        toggleHidden: toggle?.hidden ?? null,
        whatsappFallbacks: [...document.querySelectorAll("[data-quote-trigger]")].every((link) =>
          link.href.startsWith("https://wa.me/905386888306?text=")),
        whatsappTriggerCount: document.querySelectorAll("[data-quote-trigger]").length,
      };
    })()`);
    assert(audit.ready !== "true", `${context}: sayfa script çalıştırılmadan bootstrap olmuş görünüyor.`);
    assert(audit.whatsappTriggerCount >= 2 && audit.whatsappFallbacks, `${context}: WhatsApp fallback bağlantısı eksik.`);
    if (page.kind === "home") {
      assert(audit.packageCount === 6, `${context}: birleşik paket gridinde altı kart yok.`);
    } else {
      assert(audit.galleryCount === 8 && audit.galleryCardsAccessible, `${context}: sekiz galeri görselinin tamamı JS olmadan erişilebilir değil.`);
      assert(!audit.galleryEnhanced && audit.toggleHidden, `${context}: no-JS galeri yanlışlıkla daraltılmış.`);
    }
  } finally {
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
  const faviconBytes = await contentLength(`${origin}/media/images/ui/favicon.svg`, "favicon");
  assert(faviconBytes <= 10 * 1024, `Favicon ${faviconBytes} bayt; 10 KiB bütçesini aşıyor.`);
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

  for (const page of pages) {
    await auditNoJsFallback({ cdp, origin, page });
    console.log(`✓ ${page.name} no-JS fallback`);
  }

  const expectedScenarioCount = pages.length * viewports.length;
  assert(results.length === expectedScenarioCount, `${expectedScenarioCount} responsive sayfa senaryosu tamamlanmadı.`);
  console.log(`E2E geçti: ${results.length} responsive senaryo, ${pages.length} no-JS senaryosu, ${results.length} viewport ekran görüntüsü, Axe ve LCP/CLS kapıları.`);
} finally {
  cdp?.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  if (server && server.exitCode === null) server.kill();
  await delay(180);
  await rm(profileDirectory, { recursive: true, force: true }).catch(() => {});
}
