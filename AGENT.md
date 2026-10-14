# Konsept Gelsin — Ajan Çalışma ve Geliştirme Yönergeleri

Bu dosya, Konsept Gelsin projesinde çalışan tüm otonom ajanlar için bağlayıcı proje ve geliştirme sözleşmesidir. Amaç; mevcut hafif, hızlı ve bağımsız mimariyi koruyarak, doğrulanmış, standartlara uygun ve güvenli teslimatlar üretmektir.

---

## 1. Proje Özeti ve Mimari İlkeler

- **Proje Amacı:** Konsept Gelsin; düğün ve etkinlikler için 6 adet hatıra hizmetini (Canlı Yayın, Misafir Röportajları, Polaroid Hatıra Köşesi, QR Kodlu Dijital Anı Albümü, Sesli Anı Telefonu, Video Booth) tanıtan ve ziyaretçiyi doğrudan WhatsApp hattına yönlendiren web sitesidir.
- **Frontend Mimarisi:** Saf (Vanilla) HTML5, modern CSS (Custom Properties, HSL renk paleti, Google Fonts) ve JavaScript ES Modules. Paket yöneticisi bağımlılığı veya frontend framework (React, Vue vb.) eklenmez.
- **İletişim ve Veri Akışı:** Ziyaretçiyi form doldurtmadan doğrudan resmi WhatsApp hattına (+90 538 688 83 06) yönlendirir. Varsayılan olarak form, üyelik, backend veya veritabanı içermez.
- **Genişletilebilirlik İlkesi:** Varsayılan statik yapı tavizsiz korunur; ancak kullanıcı açıkça talep etmedikçe backend veya harici form entegrasyonu yapılmaz. Talep geldiğinde modüler ve hafif entegrasyonlar tercih edilir.
- **Dil ve İletişim:** Kullanıcıyla iletişim daima **Türkçe** olmalıdır. Yanıtlar ve raporlar kısa, net ve doğrudan çözüme odaklı tutulmalıdır.

---

## 2. Klasör ve Dosya Haritası

```text
Konsept_Gelsin/
├── assets/                  # Yerel fontlar ve statik lisans varlıkları
├── content/                 # Hizmet verilerinin merkezi otoritesi (services.json)
├── css/                     # Modüler stiller (shared/, home/, package/, derlenmiş site.css ve package.css)
├── js/                      # Sayfa modülleri (home/bootstrap.js, home/app.js, package/detail-app.js, shared/)
├── storage/public-media/    # Sunucuda /media URL alanından sunulan görseller ve medyalar
├── tests/                   # Birim, entegrasyon ve içerik testleri (*.test.mjs)
├── tools/                   # Yerel sunucu, linter, içerik senkronizasyon ve E2E araçları
├── deploy/                  # Nginx, Docker ve Traefik üretim tanımları
├── *.html                   # index.html (landing) ve 6 adet paket detay sayfası
├── package.json             # NPM scriptleri ve Node.js gereksinimi (Node >= 22)
└── AGENT.md                 # Bu bağlayıcı geliştirme sözleşmesi
```

---

## 3. İçerik Otoritesi ve Senkronizasyon

- **Tek Doğruluk Kaynağı:** Hizmet başlıkları, açıklamaları, vaatleri, maddeleri ve medya eşlemelerinin otoritesi `content/services.json` dosyasıdır.
- **Senkronizasyon İşlemi:** Hizmet metinleri veya paket detayları güncellendiğinde önce `content/services.json` düzenlenmeli, ardından senkronizasyon komutu çalıştırılmalıdır:
  ```bash
  npm run content:sync
  ```
- **Esnek Şablon Kuralı:** Sayfa yapısı, yeni bir HTML bileşeni veya CSS düzenlemesi gerektiğinde ilgili `*.html` dosyaları doğrudan düzenlenebilir. Ancak hizmet içeriklerinin doğruluğu `npm run content:check` ile teyit edilmelidir.

---

## 4. Frontend & Tasarım Kuralları

- **CSS & Tipografi:** Stiller `css/` altında ayrılmıştır. Renkler ve ölçüler `:root` CSS değişkenleri (token) üzerinden HSL formatında yönetilir. Google Fonts tipografisi korunmalıdır.
- **Responsive Tasarım:** Tasarım 320px, 375px, 768px ve 1440px genişliklerinde kusursuz çalışmalıdır. Yatay taşma (horizontal scroll), bozuk flex/grid düzenleri kabul edilmez.
- **Erişilebilirlik (A11y):** Form elemanı ve butonlarda görünür focus (`:focus-visible`) durumları, anlamsal (semantic) HTML etiketleri (`header`, `main`, `section`, `footer`) kullanılmalıdır.
- **JavaScript Disiplini:** Inline event handler (`onclick="..."`) kullanılmaz. Tüm olay dinleyicileri ES Modülleri içinde `addEventListener` ile tanımlanır. Güvenlik için dinamik metinler `textContent` ile atanmalı, `innerHTML` yalnızca güvenli/sabit şablonlarda kullanılmalıdır.

---

## 5. Medya ve Varlık (Assets) Standartları

- **URL Sözleşmesi:** Görseller `/media/...` kök yolu üzerinden çağrılır (sunucuda `storage/public-media/` dizinine eşlenir).
- **Responsive Görsel Kullanımı:** Hero ve paket alanlarında masaüstü yatay, mobil dikey kompozisyonlar için `<picture>` ve `<source>` etiketleri kullanılmalıdır.
- **Format ve Performans:** Görsellerde modern WebP tercih edilmeli, ilk ekran dışındaki tüm medya öğeleri `loading="lazy"` ile yüklenmelidir.
- **Alt Metin Zorunluluğu:** Bilgilendirici görsellere açıklayıcı `alt`, dekoratif arka planlara ise `alt=""` verilmelidir.
- **Video Şablonları:** Gerçek video çekimleri eklenene kadar detay sayfalarındaki mevcut video ön izleme şablonu ve etiketleri korunmalıdır.

---

## 6. Sunucu ve Yerel Çalıştırma

Projeyi test ederken oturum sonlandığında kapanmayacak bağımsız süreç kurallarına uyulmalıdır:

- **Linux / Geliştirme Ortamı:**
  ```bash
  ./run_server.sh
  # veya
  npm start
  ```
- **Windows Ortamı (Global Kural):**
  - Doğrudan `run_command` ile arka planda kalmayan sunucu başlatılmaz.
  - Hazır script varsa çalıştırılır:
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\sunucu_baslat.ps1
    ```
  - Script yoksa WMI ile bağımsız başlatılır:
    ```powershell
    Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "node tools/server.mjs"; CurrentDirectory = "<proje-dizini>" }
    ```

---

## 7. Kalite Kapıları ve Test Disiplini

Değişikliklerin doğrulanmasında kademeli yaklaşım uygulanır:

1. **Geliştirme Anında (Hedefli Testler):**
   - İlgili dosyalara özel linter ve testler çalıştırılır:
     ```bash
     npm run format:check
     npm run lint:js
     npm run lint:html-contract
     npm run build:css
     npm run test:targeted
     ```
2. **Teslim ve Commit Öncesinde (Tam Doğrulama Kapısı):**
   - Değişiklik teslim edilmeden önce tüm kalite zinciri çalıştırılmalı ve sıfır hata ile geçmelidir:
     ```bash
     npm run validate
     ```
   *(Bu komut format kontrolü, JS lint, HTML sözleşmesi, build kontrolü, hızlı kapsam testleri ve E2E testlerini zincirleme çalıştırır.)*

---

## 8. Git, Commit ve Teslimat Protokolü

Doğrulanmış işler için otomatik teslim akışı:

1. **Çalışmaya Başlarken:**
   - Mevcut dal ve durum kontrol edilir: `git status --short --branch`.
   - Kullanıcıya ait mevcut çalışma ağacı korunur, ilgisiz dosyalar değiştirilmez.
2. **Staging Disiplini:**
   - `git add .` veya `git add -A` **KESİNLİKLE YASAKTIR**.
   - Yalnızca düzenlenen spesifik dosyalar tek tek eklenir: `git add <dosya_yolu>`.
3. **Diff Kontrolü:**
   - Commit öncesi whitespace/hata kontrolü yapılır: `git diff --cached --check`.
4. **Commit ve Push:**
   - Kalite kapısı (`npm run validate`) başarıyla tamamlandıktan sonra, yapılan işi özetleyen net, geleneksel (Conventional Commits) bir mesaj ile commit oluşturulur ve mevcut çalışma dalına push edilir:
     ```bash
     git commit -m "feat/fix/chore: <kısa ve net açıklama>"
     git push origin <mevcut-dal>
     ```
   - `git push --force`, `git reset --hard` veya kullanıcı geçmişini ezen komutlar **YASAKTIR**.
