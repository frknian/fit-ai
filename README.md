# Hedefit

Bu depo Hedefit mobil uygulamasının backend servislerini ve native Android
istemcisini içerir. Önceki web arayüzü ve Capacitor kabukları kaldırılmıştır.

## İçerik

- `app/api`: mobil istemcinin kullandığı HTTP API rotaları
- `worker`: Cloudflare Worker girişi ve Supabase proxy
- `lib`: API rotalarının kullandığı iş kuralları ve servisler
- `db`: Supabase şeması ve migrasyonlar
- `data`: egzersiz kataloğu
- `public/exercise-images`: mobil istemciye sunulan egzersiz görselleri
- `android`: Kotlin ve Jetpack Compose ile geliştirilen native Android uygulaması

## Geliştirme

```bash
npm install
npm run dev
```

Doğrulama için `npm run build`, `npm run lint` ve `npm test` kullanılabilir.

## Android

Android Studio ile `android` klasörünü aç veya terminalden:

```bash
cd android
./gradlew :app:assembleDebug
```

Android istemcisinin ayrıntılı çalıştırma ve mimari notları için
`android/README.md` dosyasına bak.
