# Phase 2 — Gerçek Cihaz Üstü LLM (Android · LiteRT-LM)

Phase 1'de yerel katman **deterministik bir şablon sağlayıcıydı** (gerçek ama
LLM değil). Phase 2, onun ÖNÜNE gerçek bir cihaz üstü sinir ağı çıkarımı
koyar ve şablon sağlayıcıyı üçüncü katman olarak yerinde bırakır.

## 1. Nihai zincir

```
Kullanıcı
   ↓
AI Coach Service  →  Intelligence Engine · Memory · Context Builder · Safety
   ↓
Model Router
   ↓
① on-device-litertlm        (Android, LiteRT-LM, ağsız, ücretsiz)
   ↓ hata / desteklenmiyor / zaman aşımı
② openai-compatible          (uzak sağlayıcı — Kimi vb.)
   ↓ hata
③ local-deterministic        (her koşulda güvenli yanıt)
```

**İPTAL bu zincirin dışındadır.** Kullanıcı "durdur"a bastığında zincir orada
biter; ② denenmez (bkz. `lib/ai/router.ts`, `LocalGenerationCancelledError`).

## 2. Phase 2 başlangıç durumu (baseline)

| Ölçüt | Değer |
|---|---|
| Testler | 539/539 geçer |
| Typecheck | temiz |
| Web/Cloudflare derlemesi | başarılı |
| **Android derlemesi** | **KIRIK** (aşağıya bakınız) |
| Fiziksel Android cihaz | **YOK** |
| JDK | Android Studio JBR 21 (sistemde ayrı JDK yok) |

Android derlemesinin kırık olduğu Phase 2 başında keşfedildi ve bu Phase 2'nin
getirdiği bir sorun DEĞİLDİ: `capacitor-health` eklentisi (commit `21d22c9`)
`androidx.health.connect` üzerinden `minSdk 26` dayatıyor, proje ise 24 ilan
ediyordu; manifest birleştirme hata veriyordu. Yani Android paketi o commit'ten
beri hiç üretilememiş. `minSdkVersion` 26'ya çıkarıldı — API 26 tabanı 2026
itibarıyla etkin cihazların neredeyse tamamını kapsar ve LiteRT-LM'in tabanı
(24) bundan düşüktür, dolayısıyla cihaz üstü AI bundan etkilenmez.

## 3. Seçilen çalışma zamanı: LiteRT-LM

**`com.google.ai.edge.litertlm:litertlm-android:0.16.1`** (sürüm SABİT).

Doğrulama şekli — dokümantasyona değil **artefaktın kendisine** bakıldı:

- Sürüm listesi Google Maven `maven-metadata.xml`'den okundu (0.16.1, 2026-08-18).
- AAR indirildi, `classes.jar` `javap` ile incelendi; kullanılan bütün sınıf ve
  imzalar (Engine, EngineConfig, Conversation, ConversationConfig, SamplerConfig,
  ThinkingConfig, BenchmarkInfo, Contents, Role) gerçek imzalardan yazıldı.
- AAR manifesti `minSdkVersion 24` ilan ediyor.
- AAR yalnız **arm64-v8a** ve **x86_64** native kitaplığı taşıyor → 32-bit ARM
  cihazlar desteklenmez; bu, yetenek algılamada sert bir eleme kuralıdır.

MediaPipe LLM Inference API (`com.google.mediapipe:tasks-genai`) **bilerek
kullanılmadı**; bakım moduna alınmış yol.

### Kotlin sürümü bir çalışma zamanı dayatmasıdır

LiteRT-LM 0.16.1 Kotlin **metadata 2.3.0** ile derlenmiş. Kotlin 2.1/2.2
derleyicisi bu sınıfları okuyamıyor ("incompatible metadata version"). Bu
yüzden proje Kotlin **2.3.21**'e sabitlendi. Bu bir tercih değil, zorunluluktur.

## 4. Native mimari

```
lib/ai/providers/on-device.ts     (TypeScript sağlayıcı)
        ↓
lib/ai/local-bridge.ts            (tek köprü noktası)
        ↓  Capacitor
android/.../localai/HedefitLocalAiPlugin.kt
        ├── LocalAiCapability.kt   ABI · RAM · depolama · düşük bellek
        ├── LocalAiModelCatalog.kt doğrulanmış model listesi
        ├── LocalAiModelStore.kt   indirme · SHA-256 · atomik kurulum
        └── LocalAiEngine.kt       LiteRT-LM Engine/Conversation yaşam döngüsü
```

`LocalAiEngine.kt`, LiteRT-LM tiplerini gören **tek** dosyadır. Çalışma zamanı
değişirse yalnız o dosya değişir.

### İş parçacığı
Model yükleme ve üretim `Dispatchers.IO` üzerinde koşar; ana iş parçacığı ve
WebView hiçbir zaman bloke edilmez. `initialize()` on saniyeye kadar sürebildiği
için bu zorunludur.

### Oturum yaşam döngüsü
Motor **yüklendikten sonra yeniden kullanılır** (her mesajda yeniden yüklemek
her yanıta saniyeler eklerdi). Konuşma oturumu ise her üretimde tazelenir:
Hedefit bağlamı zaten kendisi üretir, modelin ayrıca geçmiş biriktirmesi aynı
bilgiyi iki kez göndermek olurdu. Bellek baskısında (`TRIM_MEMORY_RUNNING_LOW`)
motor bırakılır — model belleğini korumak uğruna sürecin öldürülmesine izin
verilmez.

## 5. Model yönetimi

Katalog (`LocalAiModelCatalog.kt`) — boyut ve SHA-256 değerleri Hugging Face
API'sinden okunmuş **gerçek** değerlerdir:

| Kimlik | Dosya | Boyut | Min. RAM |
|---|---|---|---|
| `qwen3-0.6b-int4` | `qwen3_0_6b_mixed_int4.litertlm` | 0,50 GB | 3 GB |
| `qwen2.5-1.5b-q8` | `Qwen2.5-1.5B-Instruct_…_q8_ekv4096.litertlm` | 1,60 GB | 4 GB |
| `gemma-4-e2b` | `gemma-4-E2B-it.litertlm` | 2,59 GB | 6 GB |

Üçü de **Apache-2.0** ve HF'te **gate'siz** — indirme için hesap/lisans kabulü
gerekmez.

`Qwen2.5-0.5B` değerlendirme dışı bırakıldı: depoda yalnız `.task` dosyası var,
LiteRT-LM 0.16.1'in beklediği `.litertlm` yok. "Gemma 3 1B" yerine güncel
`gemma-4-E2B` alındı; litert-community deposu Gemma 4 ailesine geçmiş.

### İndirme güvenliği
1. **JS'ten URL alınmaz** — yalnız katalogdaki kimlik. WebView'a keyfi indirme
   yaptırma imkânı yok.
2. Dosyalar uygulamanın **özel** dizininde (`filesDir/hedefit-local-ai`).
3. İndirme `.part` uzantısıyla yapılır; **boyut + SHA-256 doğrulandıktan
   sonra** atomik olarak yerine taşınır. Yarım dosya asla "hazır" sayılmaz.
4. Doğrulama başarısızsa dosya silinir.
5. APK'ya model **gömülmez** (doğrulandı: APK 56 MB, içinde `.litertlm` yok).

## 6. Yetenek algılama

`Android = destekleniyor` **varsayılmaz**. Sırayla: SDK ≥ 26 → ABI ∈ {arm64-v8a,
x86_64} → `isLowRamDevice` → toplam RAM ≥ modelin eşiği → depolama → model kurulu mu.

Durumlar: `LOCAL_READY` · `LOCAL_MODEL_NOT_DOWNLOADED` · `LOCAL_NOT_SUPPORTED` ·
`LOCAL_LOW_MEMORY` · `LOCAL_INSUFFICIENT_STORAGE` · `LOCAL_ERROR` ·
`LOCAL_DISABLED` · `REMOTE_ONLY`.

## 7. Bağlam ve üretim bütçesi

`lib/ai/local-policy.ts` (ölçümle değişecek tek dosya):

| Ayar | Değer | Gerekçe |
|---|---|---|
| İstem tavanı | 6.000 karakter | ≈2.000 token; modelin `maxNumTokens=2048` penceresine sığar |
| Çıkış tavanı | 320 token | Koçluk yanıtı kısadır; uzun üretim mobilde doğrudan bekleme |
| Sıcaklık | 0,3 | Tutarlılık > yaratıcılık; uydurma sayı riskini azaltır |
| Üretim zaman aşımı | 45 sn | Aşılırsa uzağa **bir kez** düşülür, yerel yeniden denenmez |
| Yükleme zaman aşımı | 120 sn | |
| Görünür akıl yürütme | **kapalı** | 140 kelimelik yanıt için yüzlerce token düşünmek yalnız gecikme |

Yerelde çalışan kategoriler: `conversation`, `simple_coaching`, `daily_summary`,
`activity_summary`, `goal_progress`, `motivation`, `nutrition_explanation`.
Dışarıda: `vision`, `complex_reasoning`, `structured_extraction`.
`LOCAL_AI_CATEGORIES` ile yeni sürüm beklemeden değiştirilebilir.

## 8. Gizlilik

- Yerel üretimde istem ve yanıt **cihazdan çıkmaz**.
- Telemetride yalnız teknik metadata: sağlayıcı, model, gecikme, TTFT,
  token/sn, sonuç. **İstem/yanıt metni asla yazılmaz.**
- Native katman uzak sağlayıcıyı **tanımaz**: Kimi/Moonshot'a erişimi yoktur,
  uzak çağrı yalnız mevcut sunucu mimarisi üzerinden gider.
- Native katmanda API anahtarı yoktur (testle doğrulanır).

## 9. Yapılandırma

| Değişken | Anlam |
|---|---|
| `LOCAL_AI_ENABLED=0` | Yerel yolu tamamen kapatır (sürüm yayınlamadan) |
| `LOCAL_AI_CATEGORIES` | Yerelde çalışacak kategoriler (virgüllü) |
| `AI_ROUTING_MODE` | `auto` · `local` · `remote` (Phase 1'den) |

## 10. Bilinen sınırlamalar

1. **Fiziksel cihaz ölçümü yapılamadı** → `docs/LOCAL_AI_BENCHMARK.md`.
2. **GPU arka ucu kapalı.** `Backend.CPU()` kullanılıyor; başarısız GPU
   delegate başlatması bazı cihazlarda süreci çökertebiliyor. GPU, cihaz
   sınıfına göre ölçüldükten sonra açılacak bir sonraki adımdır.
3. **Akış (streaming) native tarafta hazır ama arayüze bağlanmadı.** Eklenti
   `localAiToken` olayı yayar; sohbet arayüzü şu an tam yanıtı bekliyor.
4. **Varsayılan model ölçümle seçilmedi** — bugünkü varsayılan en küçük model
   (en düşük başarısızlık riski), nihai seçim ölçümden sonra.
5. **iOS'ta cihaz üstü AI yok**; köprü yalnız Android'de.

---

## 2026-08-21 güncellemesi

### Şemaya bağlı yerel üretim eklendi
- `LocalAiEngine.kt`: `generateStream(..., jsonSchema)` → `ResponseFormat.json(schema)`
- `HedefitLocalAiPlugin.kt`: `generate()` artık `jsonSchema` parametresi kabul ediyor (verilirse akış kapanır — kısmi JSON göstermenin anlamı yok)
- `lib/ai/providers/on-device.ts`: `generateObject<T>()` eklendi; `asSchema(schema).jsonSchema` ile şema JSON'a çevrilip native'e geçiriliyor, dönen metin ayrıştırılıp doğrulanıyor
- `lib/ai/local-policy.ts`: `localObjectCapableCategories()` — düz metinden AYRI, daha dar bir liste (`goal_progress`, `complex_reasoning`, `plan_generation`)
- Yeni kategori: `plan_generation` (antrenman programı), `complex_reasoning`'den ayrıldı çünkü generate-plan rotasında şablon yedek yok — route artık yerel sonucu semantik doğrulayıp geçersizse **uzağa bir kez yeniden deniyor**.

### Premium'da AI kullanım sınırı kaldırıldı
`db/migrations/20260821_premium_unlimited_ai_usage.sql` — gerekçe: maliyetin
büyük kısmı artık cihaz üstü çıkarımla karşılanıyor. Ücretsiz plan
DEĞİŞMEDİ. SQL fonksiyonu NULL limiti "sınır kontrolü yok" olarak yorumluyor
(gerçek `Infinity` değeri JSON'da `null`'a döner ve entegre edilmeden önce bu
açıkça ele alınmadı — üç değerli SQL mantığına bağımlı kalmamak için fonksiyon
NULL'ı açıkça işliyor).

**Önemli sınırlama:** bu, TÜM AI çağrılarının ücretsiz olduğu anlamına
GELMEZ — yalnız Android'de ve yerel model kuruluyken çıkarım cihazda çalışır.
iOS, web ve yerel modeli olmayan/başarısız olan istekler hâlâ uzak sağlayıcıya
(ücretli) gider. Bu bilinçli bir ürün kararıdır.

### Arayüz
FitKoç paneli açıkken sağ alttaki başlatıcı düğmesi artık render edilmiyor
(`components/AiCoachChat.tsx`); kapatınca geri geliyor.

### Yeni test kapsamı
`tests/local-ai.test.mjs`: şemaya bağlı üretimin başarı/başarısızlık/kategori
kısıtlaması davranışları. `tests/usage-limits.test.mjs`: premium sınırsızlık.
Tam paket: 634/634 geçer (önceki: 568).

---

## 2026-08-21 — KRİTİK DÜZELTME: yerel model ürün akışına bağlandı

### Bulunan hata

Cihaz üstü model, Phase 2 boyunca **üretim akışında hiç çalışmıyordu.**

Sebep mimariydi: tüm AI rotaları `runtime = "edge"` ile Cloudflare Worker'da
çalışıyor; yönlendirici (`lib/ai/router.ts`) ve `onDeviceProvider` da orada.
Ama `localAiPlugin()` `globalThis.HedefitLocalAI` okuyor ve bu değişken
yalnızca Capacitor **WebView'ına** enjekte ediliyor. Worker'da hep `undefined`
→ `isAvailable()` her zaman `false` → yerel sağlayıcı hiç seçilemiyordu.

Yani cihaz üstü model bugüne kadar SADECE instrumentation benchmark testinde
(LocalAiEngine doğrudan çağrılarak) çalıştı; gerçek kullanıcı trafiğinin
tamamı uzak sağlayıcıya gidiyordu. Benchmark sonuçları geçerli — model
cihazda gerçekten çalışıyor — ama ürüne bağlı değildi.

### Çözüm: `lib/ai/local-first.ts`

Aynı boru hattı artık İSTEMCİDE de çalışabiliyor:

```
sanitizeCoachSignals → analyze → evaluateSafety → buildCoachContext
→ contextToSystemPrompt → HedefitLocalAI köprüsü (cihazdaki model)
```

İkinci bir koç mantığı YAZILMADI — bu modüllerin hepsi zaten saf
(sunucu bağımlılığı sıfır), doğrudan yeniden kullanıldı. Yalnız hafıza
sunucudan okunuyor (`/api/ai/memory` GET), çünkü Supabase erişimi istemcide yok.

`AiCoachChat.tsx` artık önce bunu deniyor; `null` dönerse (köprü yok, model
kurulu değil, üretim başarısız/boş) mevcut `/api/chat` rotasına düşüyor.

### Kazanımlar
- **Gizlilik:** yerel yol seçildiğinde istem ve yanıt cihazdan hiç çıkmaz —
  ne uzak sağlayıcıya ne Hedefit sunucusuna.
- **Maliyet:** o istekler için uzak çağrı yok, kullanım hakkı harcanmaz.
- **Çevrimdışı:** ağ olmadan çalışır (yalnız hafıza okuması ağ ister ve
  başarısız olursa yanıt yine üretilir).
- **Web bozulmaz:** köprü yok → sessizce sunucuya düşer.

### Test kapsamı
`tests/local-ai.test.mjs` içinde 6 yeni test: köprü yokken null dönmesi,
model kurulu değilken null, cihazda üretimde `/api/chat`'e İSTEK GİTMEMESİ,
güvenlik katmanının modelden önce çalışması, boş/hatalı üretimde sunucuya
düşülmesi, hafıza okunamasa bile yanıt üretilmesi.

### Doğrulanmamış
Bu yol **gerçek cihazda henüz çalıştırılmadı** (cihaz bağlantısı koptu).
Birim testleri sahte köprüyle davranışı doğruluyor; uçtan uca cihaz
doğrulaması yapılmalı.
