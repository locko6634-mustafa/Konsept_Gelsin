export const WHATSAPP_PHONE = "905386888306";
export const DISPLAY_PHONE = "+90 538 688 83 06";
export const CONTACT_EMAIL = "info@konseptgelsin.com";

const serviceLimit = 100;

export function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function cleanField(value, maxLength = 200) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function buildWhatsAppMessage(fields = {}) {
  const service = cleanField(fields.service, serviceLimit);

  const lines = ["Merhaba Konsept Gelsin,"];

  lines.push(
    service
      ? `${service} hakkında bilgi almak istiyorum.`
      : "Düğünüm için hizmetleriniz hakkında bilgi almak istiyorum.",
  );

  lines.push("Kapsamı ve uygunluğu birlikte netleştirebilir miyiz?");
  return lines.join("\n");
}

export function buildWhatsAppUrl(fields = {}) {
  const phone = normalizePhone(WHATSAPP_PHONE);
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(fields))}`;
}
