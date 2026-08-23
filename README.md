# Hedefit Backend

Bu depo yalnızca Hedefit mobil uygulamasının backend servislerini içerir.
Web arayüzü, Capacitor kabukları ve önceki mobil arayüz kodları kaldırılmıştır.

## İçerik

- `app/api`: mobil istemcinin kullandığı HTTP API rotaları
- `worker`: Cloudflare Worker girişi ve Supabase proxy
- `lib`: API rotalarının kullandığı iş kuralları ve servisler
- `db`: Supabase şeması ve migrasyonlar
- `data`: egzersiz kataloğu
- `public/exercise-images`: mobil istemciye sunulan egzersiz görselleri

## Geliştirme

```bash
npm install
npm run dev
```

Doğrulama için `npm run build`, `npm run lint` ve `npm test` kullanılabilir.
