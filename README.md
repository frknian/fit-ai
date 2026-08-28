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

## Canlı ortam

Backend Cloudflare Workers üzerinde yayınlanır:

- Production API: `https://hedefit.frknian.workers.dev`
- Fit Koç, plan türüne göre günlük kullanım kotası uygular. Görevlerden kazanılan
  XP, ücretsiz hesapların günlük soru hakkını artırır: 300 XP'de +1, 500 XP'de
  +2 ve sonrasında her 250 XP'de bir ek hak (en çok +5). Kötüye kullanım
  koruması olarak kullanıcı başına kısa süreli istek sınırı korunur.

Canlı dağıtım:

```bash
npm run deploy
```

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

## Görevler, başarımlar ve beslenme hedefleri

Android uygulamasındaki Görevler ekranı; uyku, adım, antrenman, rota ve
beslenme kayıtlarından gün bazlı değişen görevler üretir. Günlük görev toplamı
100 XP, 24 başarımın her biri ise 100 XP'dir. Kalıcı XP ve Fit Koç ödülleri için
`supabase/migrations/20260828180000_tasks_rewards.sql` migration'ını uygula.

Beslenmede günlük kalori ve makro hedefleri, profil verisiyle deterministik
olarak hesaplanır; OpenAI yalnız girilen bir porsiyonun besin değerini tahmin
eder. Bu ayrım, genelleştirilmiş ve gereğinden yüksek protein hedeflerini
önler.
