function setDockVisibility(dock, visible) {
  dock.classList.toggle("is-visible", visible);
  dock.setAttribute("aria-hidden", String(!visible));

  if ("inert" in dock) dock.inert = !visible;
}

function keepFocusAboveDock(root, dock, view, target = root.activeElement) {
  if (
    !dock.classList.contains("is-visible") ||
    !target?.getBoundingClientRect ||
    dock.contains(target) ||
    target.closest?.("dialog[open]")
  ) {
    return;
  }

  const targetRect = target.getBoundingClientRect();
  const dockTop = view.innerHeight - dock.offsetHeight;
  const breathingRoom = 12;
  const overlap = targetRect.bottom - dockTop + breathingRoom;

  if (overlap > 0 && targetRect.top < dockTop) {
    view.scrollBy({ behavior: "auto", top: overlap });
  }
}

export function bootMobileDock(root = document) {
  const dock = root.querySelector("[data-mobile-dock]");

  if (!dock || dock.dataset.mobileDockEnhanced === "true") return;

  dock.dataset.mobileDockEnhanced = "true";
  dock.classList.add("is-enhanced");

  const hero = root.querySelector(
    "[data-mobile-dock-sentinel], [data-dock-sentinel], .hero, .package-detail-hero",
  );
  const view = root.defaultView ?? globalThis.window;

  root.addEventListener("focusin", (event) => {
    view.requestAnimationFrame(() => keepFocusAboveDock(root, dock, view, event.target));
  });

  if (!hero || typeof view?.IntersectionObserver !== "function") {
    setDockVisibility(dock, true);
    return;
  }

  setDockVisibility(dock, false);

  const observer = new view.IntersectionObserver(
    ([entry]) => {
      if (!entry) return;
      const visible = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
      setDockVisibility(dock, visible);
      if (visible) {
        view.requestAnimationFrame(() => keepFocusAboveDock(root, dock, view));
      }
    },
    { threshold: 0 },
  );

  observer.observe(hero);
}
