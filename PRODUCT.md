# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vanilla HTML5, CSS ve JavaScript ES Modules. Bu aşama form, backend, üyelik ve ödeme sistemi içermeyen tek sayfalık statik bir landing page olarak teslim edilir.

## Users

Birincil kullanıcılar, düğünlerinde misafir katılımını artırmak ve geceden kişisel anılar biriktirmek isteyen evlilik hazırlığındaki çiftlerdir. Kullanıcılar çoğunlukla telefondan hızlıca hizmetleri karşılaştırır, kendi etkinliklerine uygun seçeneği anlamaya çalışır ve detayları WhatsApp üzerinden netleştirir.

## Product Purpose

Konsept Gelsin, altı etkinlik hizmetini anlaşılır biçimde tanıtır ve ziyaretçiyi baskısız fakat görünür bir WhatsApp görüşmesine taşır. Başarı, ziyaretçinin hangi hizmetin kendi düğününe ne kattığını kısa sürede anlayıp doğru hizmet adıyla iletişime geçmesidir.

## Positioning

Konsept Gelsin, klasik fotoğraf-video çekimini tekrar sunmak yerine misafirleri gecenin aktif anı üreticisine dönüştüren dijital ve fiziksel deneyimleri tek seçkide bir araya getirir.

## Operating Context

Hizmetler düğün öncesinde değerlendirilir, etkinlik alanında kurulur veya paylaşılır ve içerikler düğün sonrasında çifte teslim edilir. Ziyaretçi tek landing page içindeki hizmet seçkisinden detayları inceler; seçtiği hizmetin adı önceden yazılmış bir WhatsApp mesajıyla görüşmeye başlar. Ayrı bir iletişim sayfasına veya form adımına yönlendirilmez.

## Capabilities and Constraints

- Yalnız `index.html` tabanlı tek landing page oluşturulur; ayrı iletişim sayfası bulunmaz.
- Sayfa üç ana bölümden oluşur: hero, paketler ve doğrudan WhatsApp iletişim alanı.
- Hero, onaylanan kompozisyona mümkün olduğunca sadık kalır: güçlü sol tipografi ve sağda anı albümü düzeninde altı gerçek, ayrı HTML hizmet kutusu kullanılır.
- Hero altındaki ayrı hizmet çizgisi/zaman çizelgesi kaldırılır.
- Paket bölümündeki altı hizmet için ImageGen ile üretilmiş özgün, temsili görseller kullanılır; bunlar gerçek müşteri işi veya etkinlik kanıtı gibi sunulmaz.
- Katalog için tek içerik otoritesi `C:\Users\Mustafa\Downloads\MARKA.xlsx` dosyasındaki altı hizmettir.
- Referans görseldeki sekiz kart ve fiyatlar gerçek katalog verisi değildir; siteye taşınmaz.
- Gerçek fiyat verisi bulunmadığı için fiyat uydurulmaz; teklif WhatsApp üzerinden alınır.
- Birincil aksiyon WhatsApp; ikincil iletişim kanalları telefon ve e-postadır.
- Form veya kullanıcı girdisi bulunmaz; CTA bağlantıları güvenli, URL-kodlu hazır mesajlarla doğrudan WhatsApp'ı açar.
- Ödeme, üyelik, hesap, yönetim paneli ve kalıcı veri kaydı bu aşamanın dışındadır.

## Brand Commitments

- Marka adı: Konsept Gelsin.
- Temel his: güvenilir; karakter: canlı, modern, sıcak, satış odaklı ve ucuz görünmeyen.
- Bağlayıcı renk yönü: sıcak turuncu ve doğal açık tonlar.
- Güçlü tipografi ve kontrollü hareket kullanılmalı; hazır tema, klasik yapay zekâ landing page dili, gereksiz gradient, glassmorphism, sahte dashboard ve aynı kartın tekrarı görünümünden kaçınılmalı.
- Metinler Türkçe, somut ve markaya özgü olmalı; jenerik pazarlama kalıpları kullanılmamalı.

## Evidence on Hand

- Hizmet kataloğu: `C:\Users\Mustafa\Downloads\MARKA.xlsx`.
- Ürün sunumu ve satış akışı için referans: `C:\Users\Mustafa\Downloads\WhatsApp Image 2026-08-25 at 19.31.48.jpeg`.
- Onaylanan hero kompozisyonu: `.impeccable/mocks/homepage-comp-01.png`.
- İletişim bilgileri: +90 538 688 83 06 ve info@konseptgelsin.com.
- Gerçek müşteri yorumları, müşteri logoları, kullanım istatistikleri, fiyatlar ve üretim fotoğrafları sağlanmadı; bunlar üretilmemeli veya varmış gibi sunulmamalı. ImageGen görselleri yalnız hizmeti anlatan temsili yaratıcı varlıklardır.

## Product Principles

1. Hizmetleri özellik listesi olarak değil, çift için bıraktığı somut hatıra üzerinden anlat.
2. Her ana karar noktasında seçilen hizmeti WhatsApp mesajına taşıyan net bir yol sun.
3. Gerçek olmayan fiyat, kıtlık, sosyal kanıt veya başarı iddiası üretme.
4. Altı hizmeti hızlı karşılaştırılabilir tutarken her birinin farklı deneyimini görünür kıl.
5. Mobilde de masaüstündeki kadar güçlü ve eksiksiz bir satış anlatısı koru.

## Accessibility & Inclusion

Semantik HTML, klavye erişimi, görünür odak durumları, en az 44×44 piksel etkileşim hedefleri, yeterli renk kontrastı ve `prefers-reduced-motion` desteği zorunludur. Sayfalar 320, 375, 768 ve 1440 piksel genişliklerde yatay taşma olmadan çalışmalıdır.
