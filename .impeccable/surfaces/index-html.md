---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["css/pages/home.css","css/responsive.css"]
---

# Konsept Gelsin ana yüzeyi

## Tek ana iş

Ziyaretçinin altı gerçek hizmeti hızla ayırt etmesi ve ilgilendiği hizmet adı hazır biçimde WhatsApp görüşmesi başlatması.

## Görsel tez

Kinetik anı albümü: fildişi kâğıt, mandalina turuncusu, adaçayı, sıcak sarı ve mürekkep rengiyle; pirinç pimler, katlı etiketler ve mekanik çevirme kolu hissi veren modern bir editoryal düzen.

## Bilgi mimarisi

Ana sayfada tam üç ana section bulunur: Hero, Hizmetler, İletişim. Hero içindeki altı hizmet 3×2 gerçek HTML panelidir; mobilde 2×3 düzene geçer. Hizmet alanında Excel'deki altı kayıt altı bağımsız HTML blok olarak sunulur. İletişim alanı form içermez; ziyaretçiyi doğrudan WhatsApp konuşmasına taşır. Ayrı iletişim sayfası yoktur.

## Kompozisyon

- Hero: solda yoğun, sola yaslı kondanse başlık ve iki eylem; sağda altı panelden oluşan kâğıt makinesi.
- Hizmetler: masaüstünde üç, tablette iki sütun; mobilde yatay ve kompakt altı bağımsız hizmet bloğu.
- İletişim: turuncu bir final alanında kısa karar desteği ve tek, güçlü WhatsApp eylemi.
- Mobil: daha küçük başlık, 2×3 hero panelleri ve kısa yatay hizmet bloklarıyla yeniden bestelenmiş görünüm.

## Gerçek içerik ve sınırlar

Kaynak `content/services.json` ve `MARKA.xlsx` içindeki altı hizmettir. Fiyat, müşteri sayısı, yorum, ödül, indirim, teslim süresi veya doğrulanmamış sosyal kanıt üretilmez. Birincil dönüşüm hattı +90 538 688 83 06; e-posta info@konseptgelsin.com.

## Varlık kararı

Kullanıcının açık talebi gereği onaylı kompozisyon tek bir raster hero olarak yayımlanmaz. Altı hizmet paneli ayrı HTML div'leri olarak kalır; her birinde ilgili hizmet için ImageGen ile üretilmiş, optimize WebP görsel kullanılır. Paket alanı aynı varlıkları yeniden kullanır. Kaynak eşlemesi `assets/images/provenance.json`, onaylı görsel referans `.impeccable/mocks/homepage-comp-01.png` dosyasındadır. WhatsApp işareti Meta'nın resmî marka varlığıdır.

## Yön sözleşmesi

Seed key: `1c4c224e`; sıralı yön listesi formu: 6. İlk ekran solda başlık/CTA, sağda 3×2 albüm olarak kalır. Son kontrol, sonuç kararı, `DESIGN.md` ve yayımlanan raster provenance kaydı olmadan iş bitmiş sayılmaz.
