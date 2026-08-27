export function bootPackageGallery(root = document) {
  const gallery = root.querySelector(".package-photo-gallery");
  const toggle = root.querySelector("[data-package-gallery-toggle]");
  const label = toggle?.querySelector("[data-package-gallery-label]");

  if (!gallery || !toggle || !label) return;

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    gallery.classList.toggle("is-expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    label.textContent = expanded ? "Daha az göster" : "Tümünü Gör";
  });
}
