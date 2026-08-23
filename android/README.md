# Hedefit Android

Hedefit'in Kotlin ve Jetpack Compose ile geliştirilen native Android
istemcisidir. Tasarım siyah yüzeyler, lime vurgu rengi ve yüksek kontrastlı
fitness metrikleri üzerine kuruludur.

## Ekranlar

- Ana sayfa ve günlük sağlık özeti
- Haftalık antrenman planı
- Etkileşimli aktif antrenman
- Beslenme günlüğü ve öğün ekleme
- İlerleme grafikleri ve ölçümler
- Fit Koç sohbeti
- Profil, vücut ölçüleri ve 15 soruluk kişiselleştirme testi
- Hedef kilo ve tahmini süre grafiği
- Bildirim takvimi, açık/koyu tema ve dil ayarı
- Veri kontrolü, hesap dondurma/etkinleştirme ve hesap silme
- Hedefit Rota: koşu/yürüyüş/bisiklet GPS kaydı, arka plan foreground servisi,
  yeşil rota çizimi ve paylaşılabilir bitiş kartı
- Doğrulanmış yerel + USDA besin araması, favori öğünler ve tekrar ekleme
- Lif, şeker, sodyum, potasyum, kalsiyum, demir ve C vitamini takibi
- Hızlı su ekleme ve Health Connect aktif kalorisine göre dinamik hedef
- Set bazlı ağırlık/tekrar/RPE/not kaydı, geçmiş performans, PR uyarısı,
  dinlenme sayacı, ses/titreşim, set türleri ve plaka hesaplayıcı
- Egzersiz kütüphanesi, özel hareket ve antrenman takvimi

Tasarım referansları `design/` klasöründedir.

## Adaptive düzen

- Kompakt telefonlarda alt navigasyon ve tek sütun
- 700dp ve üzerindeki tablet/katlanabilir ekranlarda navigation rail
- Geniş ekranlarda dashboard ve içerik ekranlarında iki/üç sütun
- Küçük telefonlarda kalori ve makro kartları otomatik olarak dikey düzene geçer
- Yatay ekran yönü kısıtlanmaz

Uygulamanın minimum sürümü Android 8.0 (API 26), hedef sürümü Android 16
(API 36) olarak ayarlanmıştır.

## Çalıştırma

Proje kökündeki `.env` dosyasında aşağıdaki public istemci ayarlarının
bulunduğundan emin ol:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
# İsteğe bağlı: farklı Supabase/Google projesi kullanılırsa override et
GOOGLE_WEB_CLIENT_ID=your-web-oauth-client-id.apps.googleusercontent.com
```

Uygulama API için varsayılan olarak canlı Hedefit Worker adresini kullanır.
Farklı bir backend kullanmak için `HEDEFIT_API_BASE_URL` ortam değişkenini
veya aynı isimli Gradle property'yi tanımlayabilirsin.

Mevcut production Supabase projesinin public Google Web Client ID değeri
derlemede varsayılan olarak tanımlıdır. Farklı bir proje kullanırsan Google
Auth Platform'da bir **Web application** OAuth istemcisi oluştur, Supabase
Dashboard → Authentication → Providers → Google bölümünde aynı istemciyi
etkinleştir ve Web Client ID değerini `GOOGLE_WEB_CLIENT_ID` olarak ekle.
Android paket adı `com.hedefit.app` için
ayrıca Android OAuth istemcisi ve yayınlanacak imzaların SHA-1/SHA-256
parmak izlerini Google Auth Platform'a kaydet.

Debug APK ile denemek için parmak izlerini şununla alabilirsin:

```bash
./gradlew :app:signingReport
```

Google hesap seçicisi açılmadan kapanıyorsa Google Auth Platform'da **Android**
türünde bir OAuth client oluşturulduğunu; paket adının `com.hedefit.app` ve
debug/release SHA-1 imzalarının doğru eklendiğini kontrol et. Web Client ID,
Supabase Google provider'daki değerle aynı kalmalıdır.

Android Studio'da bu klasörü proje olarak açıp `app` konfigürasyonunu çalıştır.
Komut satırından debug APK üretmek için:

```bash
./gradlew :app:assembleDebug
```

Oluşan APK:

```text
app/build/outputs/apk/debug/app-debug.apk
```

Lint ve test:

```bash
./gradlew :app:lintDebug :app:testDebugUnitTest
```

## Backend entegrasyonu

- E-posta/şifre ile Supabase kayıt ve giriş
- Android Credential Manager ile Google hesabı seçimi ve Supabase native ID-token girişi
- Android Keystore ile şifrelenmiş kalıcı oturum ve otomatik token yenileme
- RLS korumalı Supabase profil, program ve ilerleme verileri
- Bearer token ile Hedefit beslenme, AI program ve koç API'leri
- Gerçek antrenman tamamlama, öğün ekleme ve dashboard yenileme akışları
- Profil güncelleme ve 15 soruluk testi yeniden yanıtlama
- Yerel haftalık bildirim planlama ve kalıcı görünüm tercihleri
- Health Connect adım, uyku, kilo ve aktif kalori eşitlemesi
- WorkManager ile çevrimdışı antrenman ve öğün kuyruğu
- GPS rotalarının RLS korumalı `route_activities` tablosuna kaydı
- İlerleme sıfırlama, hesap dondurma ve geri alınamaz hesap silme API akışları

Mobil pakete yalnızca public anon key eklenir. Supabase service-role/secret key
istemci uygulamasına kesinlikle eklenmemelidir.
