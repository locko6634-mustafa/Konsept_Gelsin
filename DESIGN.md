---
name: "Konsept Gelsin"
description: "Altı düğün hatırası deneyimini sıcak kâğıt mekaniğiyle WhatsApp görüşmesine taşıyan editoryal sistem."
colors:
  paper: "hsl(39 100% 97%)"
  paper-deep: "hsl(37 54% 91%)"
  paper-muted: "hsl(35 35% 95%)"
  ink: "hsl(17 32% 11%)"
  ink-soft: "hsl(20 21% 29%)"
  mandarin: "hsl(16 100% 56%)"
  mandarin-deep: "hsl(15 88% 43%)"
  warm-yellow: "hsl(41 100% 65%)"
  sage: "hsl(98 33% 86%)"
  white: "hsl(0 0% 100%)"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(4.6rem, 7.2vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.84
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(3rem, 6vw, 5.6rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2rem, 4vw, 3.4rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Onest, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Onest, Segoe UI, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 750
    lineHeight: 1.2
rounded:
  sm: "0.5rem"
  md: "0.875rem"
  lg: "1rem"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "7": "3rem"
  "8": "4rem"
  "9": "6rem"
  "10": "8rem"
components:
  header-brand:
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    height: "2.75rem"
  header-brand-accent:
    textColor: "{colors.mandarin}"
    typography: "{typography.title}"
  button-whatsapp:
    backgroundColor: "{colors.mandarin}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.85rem 1.15rem"
    height: "3.25rem"
  button-whatsapp-hover:
    backgroundColor: "{colors.mandarin-deep}"
    textColor: "{colors.white}"
  button-light:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.85rem 1.15rem"
    height: "3.25rem"
  button-light-hover:
    backgroundColor: "{colors.warm-yellow}"
    textColor: "{colors.ink}"
  memory-tile:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "0.72rem"
    padding: "1.25rem 0.8rem 0.8rem"
  package-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "clamp(1rem, 1.7vw, 1.4rem)"
  contact-card:
    backgroundColor: "{colors.mandarin}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "clamp(1.4rem, 3vw, 2.6rem)"
---

# Design System: Konsept Gelsin

## Overview

**Creative North Star: "Kinetik Anı Albümü"**

Konsept Gelsin, altı hizmeti soğuk bir katalog yerine çevrilebilir bir anı albümünün ayrı kâğıt parçaları gibi gösterir. Fildişi yüzeyler, mandalina kabuk, adaçayı ve sıcak sarı; pirinç pim, katlı etiket ve krank ayrıntılarıyla canlı fakat premium bir editoryal dünya kurar.

Güçlü kondanse başlıklar hızlı karar vermeyi sağlar; Onest gövde metni kapsamı sakin biçimde açıklar. ImageGen varlıkları temsili hizmet görselleridir ve gerçek müşteri işi veya sosyal kanıt gibi sunulmaz. Dönüşüm form yerine resmî WhatsApp işareti ve doğrudan bağlantılarla gerçekleşir.

**Key Characteristics:**

- Sıcak, dokunsal kâğıt yüzeyler ve belirgin mürekkep kontrastı
- Altı ayrı HTML hizmet panelinden oluşan mekanik albüm imzası
- Büyük, sıkışık kondanse başlıklar ile sakin ve okunaklı gövde metni
- Kontrollü yükselti, kısa fiziksel hareketler ve doğrudan WhatsApp eylemi

## Colors

Palet, sıcak fildişi nötrleri üzerinde mandalina enerjisini; adaçayı ve sarı ile dengeler.

### Primary

- **Mandalina Enerjisi:** Birincil eylemler, marka vurgusu, başlık noktaları, albüm kabuğu ve seçili imza yüzeyleri.
- **Kavrulmuş Mandalina:** Birincil eylemlerin hover durumu ve albümün mekanik derinliği.

### Secondary

- **Adaçayı Kâğıdı:** Daha sakin hizmet yüzeyleri ve görsel zeminler.

### Tertiary

- **Sıcak Sarı:** Pim, seçim, odak halkası ve tekil vurgu yüzeyleri.

### Neutral

- **Fildişi Kâğıt:** Ana sayfa zemini ve açık bileşenler.
- **Katlı Kâğıt:** Sayfa katmanları, footer ve ikincil yüzeyler.
- **Sessiz Kâğıt:** Hizmetler bölümünün ayrıştırıcı zemini.
- **Koyu Mürekkep:** Ana metin, koyu bölüm ve en güçlü kontrast.
- **Yumuşak Mürekkep:** İkincil açıklamalar ve daha düşük öncelikli metin.
- **Saf Beyaz:** Mandalina üzerindeki eylem metni.

**The Controlled Accent Rule.** Mandalina ana eylem, vurgu noktaları ve birkaç imza yüzeyi için kullanılır; metin gövdesi veya genel arka plan rengine dönüşmez.

## Typography

**Display Font:** Barlow Condensed (Arial Narrow ve sans-serif fallback)

**Body Font:** Onest (Segoe UI ve sans-serif fallback)

**Character:** Barlow Condensed, albüm etiketlerinin sıkı ve enerjik sesidir; Onest uzun açıklamalarda sıcak, modern ve güvenilir bir ritim kurar. Her iki aile de yerel WOFF2 olarak sunulur.

### Hierarchy

- **Display** (900, `clamp(4.6rem, 7.2vw, 6rem)`, 0.84): Hero başlığı; büyük harf ve sıkı satır aralığı.
- **Headline** (900, `clamp(3rem, 6vw, 5.6rem)`, 0.95): Bölüm başlıkları.
- **Title** (900, `clamp(2rem, 4vw, 3.4rem)`, 0.95): Hizmet ve kart başlıkları.
- **Body** (400, `1rem`, 1.65): Açıklamalar; satır uzunluğu en çok 70ch.
- **Label** (750, `0.9rem`, 1.2): CTA, sayı, kicker ve kısa kontrol metinleri.

**The Condensed Impact Rule.** Barlow Condensed yalnız marka, başlık ve hizmet etiketlerinde kullanılır; uzun okuma Onest ile kalır.

## Layout

Sayfa 90rem kabuk içinde üç ana bölümden oluşur: hero, hizmetler ve formsuz iletişim. Masaüstü hero solda metin, sağda 3×2 albüm; hizmetler üç sütundur. 64rem altında hero tek eksene iner, 56rem altında hizmetler iki sütuna, 48rem altında albüm 2×3 düzene geçer. 36rem altında hizmetler tek sütunda, 7.25rem görsel ve kalan içerikten oluşan yatay bloklara dönüşür. Kabuk yan boşluğu masaüstünde 3rem, mobilde 2rem, en dar görünümde 1.5rem'dir.

Aralıklar 0.25rem ile 8rem arasındaki ortak ölçekten gelir. 320px alt sınırında yatay taşma oluşmaz; etkileşim hedefleri en az 2.75rem, birincil düğmeler en az 3.25rem yüksekliğindedir.

## Elevation & Depth

Derinlik, cam veya gradyan yerine üst üste binmiş kâğıtlarla kurulur. Albüm kabuğu ve iletişim kartı güçlü ambient kâğıt gölgesini (`0 1.2rem 2.8rem hsl(18 40% 12% / 0.16)`), hizmet kartları daha kısa yükseltiyi (`0 0.7rem 1.8rem hsl(18 40% 12% / 0.13)`), yapışkan header ise hafif ayrımı (`0 0.35rem 1.2rem hsl(18 40% 12% / 0.08)`) kullanır.

**The Paper Stack Rule.** Gölge yalnız kâğıt katmanı ve etkileşim yükseltisini anlatır; yarı saydam cam yüzey üretmez.

## Shapes

Temel köşe ölçeği 0.5rem, 0.875rem ve 1rem'dir. Kartlar yumuşak fakat kompakt köşelidir; albüm parçalarında 0.72rem gibi mekanik ara değerler bulunur. Pirinç pimler, dairesel WhatsApp hedefleri, albüm krankı ve hafif döndürülmüş kâğıt katmanları kare ızgarayı kırar. İnce sıcak kenarlıklar kâğıt tabakalarını ayırır; kapsül biçimi yalnız mekanik kol ayrıntısında kullanılır.

## Components

### Navigation

Yapışkan header, fildişi zeminde iki parçalı kondanse marka işareti ve sağda 44×44px resmî WhatsApp hedefi taşır. “Gelsin” mandalina rengindedir; ikon yeniden çizilmez veya alternatif bir sohbet işaretiyle değiştirilmez.

### Buttons

- **Shape:** Kompakt yuvarlatılmış dikdörtgen (0.5rem), en az 3.25rem yükseklik.
- **Primary:** Mandalina zemin, beyaz metin ve resmî WhatsApp işareti; kısa ambient gölge.
- **Light:** Fildişi zemin ve mürekkep metin; koyu iletişim kompozisyonunda kullanılır.
- **Hover / Focus:** Hover 0.12rem yükselir; renk mandalina koyusuna veya sıcak sarıya döner. Klavye odağı sarı ve mürekkep çift halkadır.

### Kinetic Memory Tiles

Hero içinde altı bağımsız HTML paneli bulunur. Her panelde pirinç pim, ImageGen WebP görseli ve katlı kâğıt etiketi vardır; masaüstünde 3×2, mobilde 2×3 düzenlenir. Hover kısa bir yükselme ve hafif doygunluk artışı verir; başlangıç hareketi 620ms ve 55ms kademelidir.

### Service Cards

Altı hizmet kartı aynı iskeleti paylaşır fakat kâğıt, adaçayı, sarı, mandalina ve mürekkep yüzeyleriyle ayrı karakter taşır. Görsel alan 16:10, kart köşesi 1rem ve iç boşluk akışkan ölçektedir. Numara, kondanse başlık, somut açıklama, alıntı, yerel `details` kapsamı ve hizmet adıyla WhatsApp'a giden altı çizili CTA sırası korunur.

### Contact Card

Mandalina yüzey, dairesel resmî WhatsApp işareti, güçlü kondanse başlık, tam genişlikte açık düğme ve telefon/e-posta ikincil kanallarını taşır. Form, input veya ayrı iletişim sayfası bu bileşenin parçası değildir.

## Do's and Don'ts

### Do:

- **Do** fildişi, mandalina, adaçayı, sıcak sarı ve mürekkep paletini sıcak kâğıt malzemesi olarak kullan.
- **Do** altı hero hizmetini altı ayrı HTML paneli ve provenance kaydı bulunan 960×960 ImageGen WebP varlıklarıyla koru.
- **Do** WhatsApp eylemlerinde Meta'nın resmî işaretini ve güvenli, hazır mesajlı doğrudan bağlantıyı kullan.
- **Do** görünür çift odak halkasını, en az 44×44px hedefleri ve `prefers-reduced-motion` davranışını koru.

### Don't:

- **Don't** altı parçalı hero albümünü tek bir raster hero görseline veya jenerik aynı kartların tekrarına dönüştür.
- **Don't** gradyan, glassmorphism, soğuk mavi-mor palet veya sahte dashboard estetiği ekle.
- **Don't** ImageGen görsellerini gerçek müşteri işi, etkinlik kanıtı veya sosyal kanıt gibi sun.
- **Don't** WhatsApp işaretini yeniden çiz, yeniden renklendir veya resmî olmayan bir benzeriyle değiştir.
- **Don't** iletişim formu, fiyat, indirim, kıtlık veya doğrulanmamış başarı iddiası ekle.
