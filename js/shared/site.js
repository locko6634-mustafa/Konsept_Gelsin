import { hydrateWhatsAppLinks } from "./forms.js";

function setupMobileMenu(root) {
  const button = root.querySelector(".menu-button");
  const menu = root.querySelector(".mobile-menu");
  if (!button || !menu) return;

  const setOpen = (isOpen) => {
    button.setAttribute("aria-expanded", String(isOpen));
    button.setAttribute("aria-label", isOpen ? "Menüyü kapat" : "Menüyü aç");
    menu.dataset.open = String(isOpen);
  };

  button.addEventListener("click", () => {
    setOpen(button.getAttribute("aria-expanded") !== "true");
  });

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });

  const desktopQuery = window.matchMedia("(min-width: 48.0625rem)");
  desktopQuery.addEventListener("change", (event) => {
    if (event.matches) setOpen(false);
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || button.getAttribute("aria-expanded") !== "true") return;
    setOpen(false);
    button.focus();
  });
}

export function bootSite(root = document) {
  hydrateWhatsAppLinks(root);
  setupMobileMenu(root);

  root.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  window.requestAnimationFrame(() => {
    root.documentElement?.setAttribute("data-ready", "true");
  });
}
