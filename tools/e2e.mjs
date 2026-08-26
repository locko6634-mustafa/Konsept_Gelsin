import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const projectRoot = process.cwd();
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const resultDirectory = path.join(projectRoot, "test-results");
const viewports = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];
const pages = [{ name: "home", pathname: "/" }];

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
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error("Chrome için boş yerel port ayrılamadı."));
      });
    });
  });
}

async function devtoolsEndpoint(port, chrome, chromeFailure) {
  const endpointUrl = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (chromeFailure()) throw new Error(`Chrome başlatılamadı: ${chromeFailure().message}`);
    if (chrome.exitCode !== null) throw new Error(`Chrome erken kapandı (${chrome.exitCode}).`);
    try {
      const response = await fetch(endpointUrl);
      if (response.ok) {
        const version = await response.json();
        if (version.webSocketDebuggerUrl) return version.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome henüz DevTools HTTP uç noktasını açmadı.
    }
    await delay(100);
  }
  throw new Error(`Chrome DevTools uç noktası bulunamadı (${endpointUrl}).`);
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
    const mobilePackageCards = [...document.querySelectorAll(".package")].map((card) => {
      const visual = card.querySelector(".package__visual");
      const content = card.querySelector(".package__content");
      const cardRect = card.getBoundingClientRect();
      const visualRect = visual?.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      return {
        cardWidth: cardRect.width,
        visualWidth: visualRect?.width ?? 0,
        visualHeight: visualRect?.height ?? 0,
        visualBottom: visualRect?.bottom ?? 0,
        contentTop: contentRect?.top ?? 0,
      };
    });
    const overflowing = [...document.querySelectorAll("body *")]
      .filter(visible)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < -0.5 || rect.right > innerWidth + 0.5)
      .map(({ element, rect }) => ({ selector: element.className || element.tagName, left: Math.round(rect.left), right: Math.round(rect.right) }))
      .slice(0, 12);
    return {
      title: document.title,
      lang: root.lang,
      h1Count: document.querySelectorAll("h1").length,
      mainCount: document.querySelectorAll("main").length,
      sectionCount: document.querySelectorAll("main > section").length,
      retiredMemoryCount: document.querySelectorAll(".memory-machine, .memory-tile").length,
      packageCount: document.querySelectorAll(".package").length,
      heroImageCount: document.querySelectorAll(".hero__background").length,
      heroImageSource: document.querySelector(".hero__background")?.currentSrc || "",
      heroStageAlignment: getComputedStyle(document.querySelector(".hero__stage")).alignItems,
      heroActionsBottomGap: (() => {
        const stageRect = document.querySelector(".hero__stage")?.getBoundingClientRect();
        const actionsRect = document.querySelector(".hero__actions")?.getBoundingClientRect();
        return stageRect && actionsRect ? stageRect.bottom - actionsRect.bottom : -1;
      })(),
      packageImageCount: document.querySelectorAll(".package img[src^='assets/images/'][src$='.webp']").length,
      uniqueServiceImages: [...new Set([...document.querySelectorAll(".package img")].map((image) => image.getAttribute("src")))].sort(),
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute("src")),
      formCount: document.querySelectorAll("form, input, select, textarea").length,
      conceptLineCount: document.querySelectorAll(".concept-line").length,
      retiredContactLinks: [...document.querySelectorAll("a[href]")].filter((link) => /iletisim\\.html/i.test(link.getAttribute("href"))).length,
      directContactCta: document.querySelector("#iletisim [data-whatsapp-general]")?.href.startsWith("https://wa.me/905386888306?text=") ?? false,
      missingNames,
      smallTargets,
      rootScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      viewportWidth: innerWidth,
      mobilePackageCards,
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
      for (const image of document.querySelectorAll(".package img")) {
        image.scrollIntoView({ block: "center" });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }
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
    assert(audit.sectionCount === 3, `${page.name}/${viewport.width}: ana section sayısı ${audit.sectionCount}.`);
    assert(audit.retiredMemoryCount === 0, `${page.name}/${viewport.width}: kaldırılan memory-machine yapısı bulundu.`);
    assert(audit.packageCount === 6, `${page.name}/${viewport.width}: hizmet bloğu sayısı ${audit.packageCount}.`);
    assert(audit.heroImageCount === 1, `${page.name}/${viewport.width}: hero arka plan sayısı ${audit.heroImageCount}.`);
    const expectedHeroAlignment = viewport.width <= 1024 ? "flex-start" : "center";
    const expectedHeroActionsGap = viewport.width <= 768 ? 32 : 48;
    assert(audit.heroStageAlignment === expectedHeroAlignment, `${page.name}/${viewport.width}: hero yazıları eski hizasında değil (${audit.heroStageAlignment}).`);
    assert(Math.abs(audit.heroActionsBottomGap - expectedHeroActionsGap) <= 1, `${page.name}/${viewport.width}: hero butonları altta değil (${audit.heroActionsBottomGap}px).`);
    assert(audit.packageImageCount === 6, `${page.name}/${viewport.width}: paket WebP sayısı ${audit.packageImageCount}.`);
    assert(audit.uniqueServiceImages.length === 6, `${page.name}/${viewport.width}: benzersiz hizmet görseli sayısı ${audit.uniqueServiceImages.length}.`);
    assert(audit.brokenImages.length === 0, `${page.name}/${viewport.width}: yüklenemeyen görseller ${JSON.stringify(audit.brokenImages)}.`);
    assert(audit.formCount === 0, `${page.name}/${viewport.width}: landing page form alanı içeriyor.`);
    assert(audit.conceptLineCount === 0, `${page.name}/${viewport.width}: kaldırılan hizmet geçiş çizgisi hâlâ görünüyor.`);
    assert(audit.retiredContactLinks === 0, `${page.name}/${viewport.width}: ayrı iletişim sayfası bağlantısı kaldı.`);
    assert(audit.directContactCta, `${page.name}/${viewport.width}: iletişim alanında doğrudan WhatsApp CTA bulunamadı.`);

    if (viewport.width <= 576) {
      assert(
        audit.mobilePackageCards.every((card) => card.visualWidth >= card.cardWidth - 1),
        `${page.name}/${viewport.width}: mobil paket görseli kartı tam genişlikte doldurmuyor (${JSON.stringify(audit.mobilePackageCards)}).`,
      );
      assert(
        audit.mobilePackageCards.every((card) => {
          const aspectRatio = card.visualWidth / card.visualHeight;
          return aspectRatio >= 2.99 && aspectRatio <= 3.01;
        }),
        `${page.name}/${viewport.width}: mobil paket görseli 3:1 kompakt oranını korumuyor (${JSON.stringify(audit.mobilePackageCards)}).`,
      );
      assert(
        audit.mobilePackageCards.every((card) => Math.abs(card.contentTop - card.visualBottom) <= 1),
        `${page.name}/${viewport.width}: mobil paket görseli ile içerik arasında gereksiz boşluk var (${JSON.stringify(audit.mobilePackageCards)}).`,
      );
    }

    if (viewport.width <= 768) {
      assert(audit.heroImageSource.endsWith("/assets/images/hero-still-life-mobile-v3.png"), `${page.name}/${viewport.width}: mobil hero görseli yüklenmedi (${audit.heroImageSource}).`);
      const openedMenu = await evaluate(cdp, sessionId, `(() => {
        const button = document.querySelector(".menu-button");
        const menu = document.querySelector(".mobile-menu");
        button.click();
        return { expanded: button.getAttribute("aria-expanded"), open: menu.dataset.open };
      })()`);
      assert(openedMenu.expanded === "true" && openedMenu.open === "true", `${page.name}/${viewport.width}: mobil navigasyon açılmadı.`);

      const closedMenu = await evaluate(cdp, sessionId, `(() => {
        const button = document.querySelector(".menu-button");
        const menu = document.querySelector(".mobile-menu");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return { expanded: button.getAttribute("aria-expanded"), open: menu.dataset.open, focused: document.activeElement === button };
      })()`);
      assert(closedMenu.expanded === "false" && closedMenu.open === "false" && closedMenu.focused, `${page.name}/${viewport.width}: mobil navigasyon Escape ile kapanmadı.`);
    } else {
      assert(audit.heroImageSource.endsWith("/assets/images/hero-still-life-v2.png"), `${page.name}/${viewport.width}: masaüstü hero görseli yüklenmedi (${audit.heroImageSource}).`);
    }

    const focusState = await evaluate(cdp, sessionId, `(() => {
      const target = document.querySelector("main [data-whatsapp-general]");
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

    if (viewport.width === 375) {
      const reducedMotion = await evaluate(cdp, sessionId, `(() => {
        const heroCopy = document.querySelector(".hero__copy") || document.body;
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

try {
  await mkdir(resultDirectory, { recursive: true });
  server = spawn(process.execPath, ["tools/server.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(serverPort) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  await waitForHttp(`${origin}/`, server);
  const retiredContactResponse = await fetch(`${origin}/iletisim.html`);
  assert(retiredContactResponse.status === 404, `Kaldırılan iletişim sayfası ${retiredContactResponse.status} döndürdü.`);

  const chromePort = await availablePort();
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
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ];

  chrome = spawn(chromePath, chromeArgs, { stdio: "ignore", windowsHide: true });
  chrome.once("error", (error) => {
    chromeSpawnFailure = error;
  });

  cdp = await CdpConnection.connect(await devtoolsEndpoint(chromePort, chrome, () => chromeSpawnFailure));
  const results = [];
  for (const page of pages) {
    for (const viewport of viewports) {
      results.push(await auditPage({ cdp, origin, page, viewport }));
      console.log(`✓ ${page.name} ${viewport.width}×${viewport.height}`);
    }
  }

  assert(results.length === 4, "Dört responsive landing page senaryosu tamamlanmadı.");
  console.log(`E2E geçti: ${results.length} landing page senaryosu, 4 ekran görüntüsü, yatay taşma ve erişilebilirlik kontrolleri.`);
} finally {
  cdp?.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  if (server && server.exitCode === null) server.kill();
  await delay(180);
  await rm(profileDirectory, { recursive: true, force: true }).catch(() => {});
}
