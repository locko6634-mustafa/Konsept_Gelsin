export const WHATSAPP_PHONE = "905386888306";
export const DISPLAY_PHONE = "+90 538 688 83 06";
export const CONTACT_EMAIL = "info@konseptgelsin.com";

const serviceLimit = 100;
const cityLimit = 100;
const dateLimit = 40;

function formatEventDate(value) {
  const cleanedValue = cleanField(value, dateLimit);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanedValue);

  if (!match) return cleanedValue;

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return cleanedValue;
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

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
  const eventDate = formatEventDate(fields.eventDate);
  const city = cleanField(fields.city, cityLimit);

  const lines = ["Merhaba Konsept Gelsin,"];

  lines.push(
    service
      ? `${service} hakkında bilgi almak istiyorum.`
      : "Düğünüm için hizmetleriniz hakkında bilgi almak istiyorum.",
  );

  if (eventDate) lines.push(`Etkinlik tarihi: ${eventDate}`);
  if (city) lines.push(`Şehir: ${city}`);

  lines.push("Kapsamı ve uygunluğu birlikte netleştirebilir miyiz?");
  return lines.join("\n");
}

export function buildWhatsAppUrl(fields = {}) {
  const phone = normalizePhone(WHATSAPP_PHONE);
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(fields))}`;
}
