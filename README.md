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
- Fit Koç model yönlendirmesi basit sohbet, besin çıkarımı ve görsel okumada
  `gpt-4o`; kişisel program üretimi ve karmaşık haftalık değerlendirmede
  `gpt-5.1` kullanır. Model adları Worker ortamındaki `OPENAI_MODEL_*`
  değişkenleriyle değiştirilebilir.

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

## Manuel spor kaydı

Android uygulamasında Antrenman sekmesindeki “Antrenman Ekle” ve ana ekrandaki
kısayol; yürüyüş öncelikli 17 spor türünü spora özel süre, mesafe, tempo, eğim
veya alt türle kaydeder. Aktif kalori 2024 Compendium MET değerleri ve profil
kilosundan, 1 MET dinlenme enerjisi çıkarılarak deterministik hesaplanır; sonuç mevcut RLS korumalı antrenman geçmişine yazılır ve İlerleme
ekranında kalıcı olarak gösterilir. Yeni kayıt sınırları için
`20260829020000_secure_manual_activity_limits.sql` migration'ını uygula.
