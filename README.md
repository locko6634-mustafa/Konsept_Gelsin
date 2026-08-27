# Konsept Gelsin

Konsept Gelsin; düğün ve etkinlikler için altı hatıra hizmetini tanıtan, ziyaretçiyi doğrudan WhatsApp görüşmesine yönlendiren tek sayfalık statik bir landing page'dir. Vanilla HTML5, CSS ve JavaScript ES Modules kullanır; form, ayrı iletişim sayfası, backend, üyelik ve ödeme sistemi içermez.

## Sayfa ve ana akış

- `index.html`: Landing page tam üç ana bölümden oluşur.
  1. **Hero:** Solda marka mesajını, sağda ImageGen ile üretilen çiçekli ve mum ışıklı düğün masası ile Polaroid çift kompozisyonunu kullanır.
  2. **Paketler:** Öne çıkan iki konsepti, altı büyük hizmet kartını ve üç adımlı çalışma akışını hem masaüstünde hem mobilde aynı içerik sırasıyla sunar.
  3. **WhatsApp iletişim:** Form göstermeden, ziyaretçiyi doğrudan Konsept Gelsin WhatsApp hattına taşır.

Hero metinleri görselin içine gömülü değildir; erişilebilir HTML olarak yönetilir. ImageGen masaüstü için yatay, mobil için dikey bir arka plan üretir; `picture/source` doğru varyantı seçerken metin ve CTA'lar her iki kırılımda da görselin üstünde kalır. Paket kartları logo kullanmaz ve yeni, sıcak düğün fotoğraflarını kare kompozisyonda gösterir. Mobilde yalnız hızlı işlem çubuğu cihaza özgüdür; ana sayfa yapısı ve görsel dili masaüstüyle ortaktır. Görseller temsili yaratıcı varlıklardır; gerçek müşteri işi veya etkinlik kaydı oldukları iddia edilmez.

## Çalıştırma

Gereksinim: **Node.js 22 veya üzeri**.

```powershell
npm start
```

Komut, yerel statik geliştirme sunucusunu başlatır. Terminalde gösterilen yerel adresi tarayıcıda açın.

## İçerik yönetimi

Altı hizmete ait ad, açıklama, vaat ve kapsam maddelerinin içerik otoritesi `content/services.json` dosyasıdır. Hizmet içeriği değiştirildiğinde önce bu dosya güncellenmeli; HTML ile içerik kaynağı arasındaki uyum yayın öncesi doğrulama kapısıyla kontrol edilmelidir.

## WhatsApp iletişimi

Sayfadaki WhatsApp bağlantıları `wa.me` üzerinden doğrudan **+90 538 688 83 06** numarasını açar. Hizmet CTA'ları ilgili hizmet adını içeren hazır bir mesajla görüşmeyi başlatabilir. Sitede kullanıcıdan bilgi toplanmaz ve veri saklanmaz.

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
index.html            Tek landing page
```

## Kalite ve testler

Hedeflenen görünüm genişlikleri **320, 375, 768 ve 1440 piksel**dir. Klavye erişimi, görünür odak durumları, azaltılmış hareket tercihi ve yatay taşma kontrolleri kalite kapısının parçasıdır.

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
