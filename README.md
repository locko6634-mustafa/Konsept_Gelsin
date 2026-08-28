# Konsept Gelsin

Konsept Gelsin; düğün ve nişanlar için altı hatıra hizmetini tanıtan, ziyaretçiyi tarih, şehir ve paket bilgileriyle hazırlanmış bir WhatsApp görüşmesine yönlendiren çok sayfalı statik bir web sitesidir. Vanilla HTML5, CSS ve JavaScript ES Modules kullanır; ayrı iletişim sayfası, backend, üyelik ve ödeme sistemi içermez. Teklif adımlarına girilen bilgiler yalnız tarayıcıda WhatsApp mesajına dönüştürülür; sunucuya gönderilmez ve saklanmaz.

## Sayfa ve ana akış

- `index.html`: Landing page tam üç ana bölümden oluşur.
  1. **Hero:** Marka mesajını, çiçekli ve mum ışıklı düğün masası ile modern Polaroid kompozisyonunu ve tek bir “Paketleri keşfet” aksiyonunu kullanır.
  2. **Paketler:** Altı hizmeti tek bir responsive gridde, iki öne çıkan rozeti ve üç adımlı çalışma akışıyla sunar.
  3. **Teklif iletişimi:** Tarih, şehir ve paket bilgisini üç kısa adımda alıp hazır WhatsApp mesajı üretir.
- Altı paket detay sayfası: Her hizmet için önce vaat ve kapsamı, ardından sekiz görsellik temsili galeri, açıkça pasif olarak etiketlenmiş video ön izlemeleri ve hizmete özel teklif CTA'sı sunar.

Hero metinleri görselin içine gömülü değildir; erişilebilir HTML olarak yönetilir. Responsive AVIF/WebP kaynakları cihaz genişliğine uygun hero ve kart görselini seçer. Mobilde paket kartları iki, tablet ve masaüstünde üç sütun kullanır. Hero geçildikten sonra görünen mobil hızlı işlem çubuğu paketlere ve teklif akışına erişim sağlar. Görseller temsili yaratıcı varlıklardır; gerçek müşteri işi veya etkinlik kaydı oldukları iddia edilmez.

## Çalıştırma

Gereksinim: **Node.js 22 veya üzeri**.

```powershell
npm start
```

Komut, yerel statik geliştirme sunucusunu başlatır. Terminalde gösterilen yerel adresi tarayıcıda açın.

## İçerik yönetimi

Altı hizmete ait ad, açıklama, vaat, medya eşlemesi ve kapsam maddelerinin içerik otoritesi `content/services.json` dosyasıdır. Hizmet içeriği değiştirildiğinde önce bu dosya güncellenmeli, ardından `npm run content:sync` çalıştırılmalıdır. `npm run content:check`, üretilen detay sayfalarıyla içerik kaynağı arasındaki sapmayı yayın öncesi engeller.

Depoda henüz gerçek paket videosu bulunmadığı için detay sayfalarında mevcut görsellerle açıkça “Temsili video ön izlemesi” olarak etiketlenmiş pasif alanlar kullanılır. Bu alanlar gerçek çekimler hazır olduğunda erişilebilir, kontrollü video bileşenleriyle değiştirilmelidir.

## WhatsApp iletişimi

Sayfadaki WhatsApp bağlantıları `wa.me` üzerinden doğrudan **+90 538 688 83 06** numarasını açar. JavaScript kullanılabildiğinde CTA'lar tarih, şehir ve paket adımlarını içeren erişilebilir teklif dialogunu açar; son bağlantı bu alanları hazır mesaja ekler. JavaScript kapalıysa CTA'ların geçerli genel WhatsApp bağlantısı çalışmaya devam eder. Bilgiler tarayıcıda tutulur ve yalnız kullanıcı son bağlantıyı açtığında WhatsApp'a aktarılır.

## Klasör yapısı

```text
assets/              Yerel fontlar ve lisans metinleri
content/             Hizmet içeriklerinin tek kaynağı
css/                 Token, temel, bileşen, sayfa, responsive ve motion stilleri
js/                  Sayfa girişi ile ortak WhatsApp modülleri
tests/               İçerik, iletişim ve tarayıcı doğrulamaları
tools/               Yerel sunucu ve kalite kontrol araçları
deploy/              Nginx, Docker ve Traefik üretim tanımları
storage/public-media Sunucuda /media URL alanından sunulan görseller
*.html                Landing page ve altı paket detay sayfası
```

## Kalite ve testler

Hedeflenen görünüm sınıfları **320×568, 375×812, 390×844, 430×932, 812×375, 768×1024 ve 1440×900** boyutlarını kapsar. Klavye erişimi, görünür odak durumları, Axe erişilebilirlik taraması, %200 metin büyütme, azaltılmış hareket tercihi, yatay taşma ve görsel performans bütçeleri kalite kapısının parçasıdır.

```powershell
npm run test:targeted
npm run test:quick
npm run test:e2e
npm run validate
```

- `test:targeted`: WhatsApp bağlantısı ve içerik sözleşmesinin hedefli testlerini çalıştırır.
- `test:quick`: JavaScript testlerini tanımlı kapsam eşikleriyle çalıştırır.
- `test:e2e`: Responsive görünüm, etkileşim ve erişilebilirlik kontrollerini çalıştırır.
- `validate`: Format, JavaScript, HTML sözleşmesi, build, hızlı test ve E2E kontrollerinin tamamını sırasıyla çalıştırır.

## Otomatik üretim dağıtımı

`.github/workflows/deploy.yml`, `main` dalına gelen ilk ve sonraki her push'ta önce `npm run validate` çalıştırır. Kapı başarılı olursa exact commit SHA ile sürümlü bir paket oluşturur, paketi SSH üzerinden `/home/locko-admin/apps/konsept-gelsin` altına aktarır ve mevcut `edge_proxy` ağına bağlı, yetkileri daraltılmış Nginx container'ını başlatır. `storage/public-media` görselleri container'a salt okunur bağlanır ve `/media/images/...` URL'lerinden sunulur. Yeni container healthcheck'i geçmezse önceki başarılı sürüm yeniden etkinleştirilir.

Workflow, GitHub'daki `production` environment'ında şu secret'ları bekler:

- `SERVER_HOST`: SSH sunucusunun adresi.
- `SERVER_HOST_FINGERPRINT`: Sunucunun doğrulanmış Ed25519 host key fingerprint değeri (`SHA256:...`).
- `SERVER_PORT`: SSH portu.
- `SERVER_SSH_KEY`: Yalnız bu repo için oluşturulmuş Ed25519 private key'in eksiksiz içeriği.
- `SERVER_USER`: Kısıtlı dağıtım kullanıcısı.

Dağıtıma yalnızca `npm run validate` başarıyla tamamlandıktan sonra geçilir. Başarısız veya çalıştırılmamış kontrol yayın kapısını geçmiş sayılmaz.

## Font lisansları

Projede yerel olarak barındırılan **Barlow Condensed** ve **Onest** fontları SIL Open Font License 1.1 ile lisanslanmıştır. Lisans metinleri sırasıyla `assets/fonts/BARLOW-CONDENSED-OFL.txt` ve `assets/fonts/ONEST-OFL.txt` dosyalarında korunur.
