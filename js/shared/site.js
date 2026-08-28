import { hydrateWhatsAppLinks } from "./forms.js";
import { bootMobileDock } from "./mobile-dock.js";
import { bootQuoteDialog } from "./quote-dialog.js";

export function bootSite(root = document) {
  hydrateWhatsAppLinks(root);
  bootQuoteDialog(root);
  bootMobileDock(root);

  root.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  window.requestAnimationFrame(() => {
    root.documentElement?.setAttribute("data-ready", "true");
  });
}
