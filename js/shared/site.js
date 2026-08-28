import { hydrateWhatsAppLinks } from "./forms.js";

export function bootSite(root = document) {
  hydrateWhatsAppLinks(root);

  root.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  window.requestAnimationFrame(() => {
    root.documentElement?.setAttribute("data-ready", "true");
  });
}
