import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTACT_EMAIL,
  DISPLAY_PHONE,
  WHATSAPP_PHONE,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  cleanField,
  normalizePhone,
} from "../js/shared/contact.js";

test("iletişim sabitleri gerçek marka bilgilerini taşır", () => {
  assert.equal(WHATSAPP_PHONE, "905386888306");
  assert.equal(DISPLAY_PHONE, "+90 538 688 83 06");
  assert.equal(CONTACT_EMAIL, "info@konseptgelsin.com");
});

test("telefon numarasını WhatsApp biçimine normalleştirir", () => {
  assert.equal(normalizePhone("+90 (538) 688 83 06"), "905386888306");
  assert.equal(normalizePhone(905386888306), "905386888306");
  assert.equal(normalizePhone(), "");
});

test("WhatsApp mesaj verisini kontrol karakterlerinden ve fazla boşluklardan arındırır", () => {
  assert.equal(cleanField("  Video\n\t Booth  "), "Video Booth");
  assert.equal(cleanField("\u0000abcdef\u007f", 4), "abcd");
  assert.equal(cleanField(null), "");
});

test("genel CTA kısa ve markaya özgü bir görüşme mesajı üretir", () => {
  const expected = [
    "Merhaba Konsept Gelsin,",
    "Düğünüm için hizmetleriniz hakkında bilgi almak istiyorum.",
    "Kapsamı ve uygunluğu birlikte netleştirebilir miyiz?",
  ].join("\n");

  assert.equal(buildWhatsAppMessage(), expected);
  assert.equal(buildWhatsAppMessage({ service: " \n\t " }), expected);
});

test("paket CTA'sı seçilen hizmeti güvenli biçimde mesaja taşır", () => {
  const service = `  Video\n Booth ${"x".repeat(120)}  `;
  const message = buildWhatsAppMessage({ service });

  assert.match(message, /^Merhaba Konsept Gelsin,/);
  assert.match(message, /Video Booth x+ hakkında bilgi almak istiyorum\./);
  assert.doesNotMatch(message, /x{101}/);
  assert.match(message, /Kapsamı ve uygunluğu birlikte netleştirebilir miyiz\?$/);
});

test("WhatsApp adresi doğru numarayı ve URL kodlu hizmet mesajını içerir", () => {
  const fields = { service: "Sesli Anı Telefonu" };
  const url = new URL(buildWhatsAppUrl(fields));

  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "wa.me");
  assert.equal(url.pathname, `/${WHATSAPP_PHONE}`);
  assert.equal(url.searchParams.get("text"), buildWhatsAppMessage(fields));
});
