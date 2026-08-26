import { buildWhatsAppUrl } from "./contact.js";

export function hydrateWhatsAppLinks(root = document) {
  root.querySelectorAll("[data-whatsapp-service]").forEach((link) => {
    link.href = buildWhatsAppUrl({ service: link.dataset.whatsappService });
  });

  root.querySelectorAll("[data-whatsapp-general]").forEach((link) => {
    link.href = buildWhatsAppUrl();
  });
}
