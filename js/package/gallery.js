export function bootPackageGallery(root = document) {
  const gallery = root.querySelector(".package-photo-gallery");
  const toggle = root.querySelector("[data-package-gallery-toggle]");
  const label = toggle?.querySelector("[data-package-gallery-label]");

  if (!gallery || !toggle || !label || gallery.classList.contains("is-enhanced")) return;

  const collapsedLabel = label.textContent.trim() || "Tümünü göster";
  const expandedLabel = toggle.dataset.expandedLabel || "Daha az göster";

  gallery.classList.add("is-enhanced", "is-collapsed");
  gallery.classList.remove("is-expanded");
  toggle.hidden = false;
  toggle.setAttribute("aria-expanded", "false");

  function keepToggleVisible() {
    const rect = toggle.getBoundingClientRect();
    const view = root.defaultView ?? globalThis.window;
    const visible = rect.top >= 0 && rect.bottom <= view.innerHeight;

    if (visible) return;

    const reduceMotion = view.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    toggle.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    gallery.classList.toggle("is-collapsed", !expanded);
    gallery.classList.toggle("is-expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    label.textContent = expanded ? expandedLabel : collapsedLabel;

    if (!expanded) viewRequestAnimationFrame(root, keepToggleVisible);
  });
}

function viewRequestAnimationFrame(root, callback) {
  const view = root.defaultView ?? globalThis.window;

  if (typeof view?.requestAnimationFrame === "function") {
    view.requestAnimationFrame(callback);
    return;
  }

  callback();
}
