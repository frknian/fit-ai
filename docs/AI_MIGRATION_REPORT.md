# Hedefit AI Migration Report

Tarih: 2026-08-19 · Temel: `91e95d6`

## Previous Architecture

```
AiCoachChat.tsx  (istemci `context` dizesini kendisi üretir, BMI dahil)
      ↓
app/api/chat/route.ts        auth · rate limit · kullanım hakkı · sistem promptu
      ↓
lib/ai-provider.ts           createOpenAICompatible() — tek uç nokta
      ↓
https://api.moonshot.ai/v1
      ↓
hata → lib/ai-coach.ts localCoachReply()  (anahtar kelime tabanlı)
```

Aynı zincir `generate-plan`, `weekly-review`, `goal-plan`, `nutrition/advice`
ve `nutrition/estimate` rotalarında tekrarlanıyordu.

Doğru tespit: `lib/ai-provider.ts` **zaten** bir soyutlamaydı — sağlayıcı
`AI_BASE_URL`/`AI_MODEL` ile değiştirilebiliyor ve API anahtarı istemciye
sızmıyordu. Göç sıfırdan soyutlama kurmadı; var olanı çok sağlayıcılı,
yönlendirmeli, yedeklemeli ve deterministik hale getirdi.

## New Architecture

```
rota / bileşen
      ↓
lib/ai/coach.ts                      AI Coach Service — tek giriş kapısı
      ├── lib/ai/intelligence.ts     deterministik motor (sayıların kaynağı)
      └── lib/ai/memory.ts           yapılandırılmış kalıcı hafıza
      ↓
lib/ai/context-builder.ts            UserCoachContext + bağlam bütçesi
      ↓
lib/ai/safety.ts                     prompttan bağımsız güvenlik
      ↓
lib/ai/router.ts                     yönlendirme + yedekleme zinciri
      ↓
  local-deterministic  →  openai-compatible  →  (gelecek sağlayıcılar)
```

## Files Added

| Dosya | Rol |
|---|---|
| `lib/ai/types.ts` | `AIProvider` arayüzü, istek/yanıt tipleri, kategori kümesi |
| `lib/ai/errors.ts` | `AiUnsupportedRequestError`, `AiAllProvidersFailedError` |
| `lib/ai/providers/openai-compatible.ts` | Uzak sağlayıcı (Kimi/OpenRouter/vLLM…) + sağlayıcıya özgü tuhaflıklar |
| `lib/ai/providers/deterministic-local.ts` | Ağsız, cihazda çalışan yerel sağlayıcı |
| `lib/ai/providers/registry.ts` | Kayıt; yerel sağlayıcılar önce |
| `lib/ai/router.ts` | Yönlendirme politikası, yedekleme, son çare sırası |
| `lib/ai/coach.ts` | Coach Service + hafıza çıkarımı |
| `lib/ai/intelligence.ts` | Deterministik fitness motoru |
| `lib/ai/context-builder.ts` | Bağlam kurma ve bütçeleme, konuşma özeti |
| `lib/ai/memory.ts` | Hafıza tipleri, doğrulama, tekilleştirme, CRUD |
| `lib/ai/safety.ts` | Engelleme kalıpları ve güvenli yanıtlar |
| `lib/ai/prompts.ts` | Sürümlenmiş sistem promptu (`v1`) |
| `lib/ai/knowledge.ts` | RAG'a hazır bilgi tabanı soyutlaması |
| `lib/ai/telemetry.ts` | Gizliliğe duyarlı olay/metrik |
| `lib/ai/capability.ts` | Cihaz üstü AI yeteneği algılama + native köprü sözleşmesi |
| `lib/ai/signals.ts` | İstemci sinyallerinin doğrulanması |
| `app/api/ai/feedback/route.ts` | 👍/👎 |
| `app/api/ai/memory/route.ts` | Hafıza listele / sil / çıkar |
| `db/migrations/20260819_ai_memory.sql` | `ai_memories`, `ai_feedback`, `ai_provider_events` |
| `docs/AI_MIGRATION_PLAN.md`, `AI_MODEL_DECISION.md`, `AI_FINETUNING_FUTURE.md` | Belgeler |
| `tests/ai-*.test.mjs` (6 dosya) | 63 yeni test |

## Files Modified

| Dosya | Değişiklik |
|---|---|
| `lib/ai-provider.ts` | Sağlayıcı **değil**, router üzerine uyumluluk katmanı. İmzalar korundu |
| `app/api/chat/route.ts` | Coach Service'e taşındı; güvenlik kullanım hakkından önce; yerel yanıtta hak iadesi |
| `lib/ai-nutrition-estimator.ts` | Sağlayıcıya özgü `moonshot`/`isMoonshotK2` dallanması kaldırıldı |
| `components/FitAiApp.tsx` | Yapılandırılmış `coachSignals`; uydurulmuş BMI (`"22.4"`) artık gönderilmiyor |
| `components/AiCoachChat.tsx` | Sinyaller, 👍/👎, arka planda hafıza çıkarımı |
| `app/globals.css` | `.coach-feedback` (mevcut tasarım tokenlarıyla, koyu tema dahil) |
| `app/gizlilik/page.tsx` | Hafıza/geri bildirim/telemetri veri kategorileri; model adı düzeltmesi |
| `lib/i18n/dictionaries/{tr,en}.ts` | Geri bildirim etiketleri |
| `README.md`, `docs/GELISTIRME.md`, `.env.example` | Belgeler ve yeni değişkenler |
| `tests/plan-programs.test.mjs`, `tests/nutrition-tracking.test.mjs` | Taşınan sabitlerin yeni konumuna yönlendirildi |

## Database Changes

`db/migrations/20260819_ai_memory.sql` — yalnızca **ekleme**; var olan hiçbir
tabloya dokunulmaz, veri kaybı riski yoktur, dosya sonunda geri alma bölümü
vardır.

| Tablo | Amaç | İzolasyon |
|---|---|---|
| `ai_memories` | Kalıcı tercihler | RLS `auth.uid() = user_id`; `unique(user_id, memory_type, memory_key)` |
| `ai_feedback` | 👍/👎 + teknik meta | RLS; `unique(user_id, message_id)` |
| `ai_provider_events` | Sağlayıcı/gecikme/hata sınıfı | RLS |

Kategori ve uzunluk kısıtları veritabanında da tekrarlanır (uygulama katmanı
atlansa bile çöp veri girmesin). İki indeks eklendi; her ikisi de kullanıcı
bazlı güncellik sorgusunu tam karşılar.

## AI Provider Architecture

```ts
interface AIProvider {
  id: string;
  kind: "local" | "remote";
  categories?: readonly AiTaskCategory[];
  lastResortCategories?: readonly AiTaskCategory[];
  isAvailable(): Promise<boolean>;
  generateText(request: AiRequest): Promise<AiResponse>;
  generateObject?<T>(request: AiObjectRequest<T>): Promise<AiObjectResponse<T>>;
}
```

Yeni sağlayıcı = `providerRegistry.register(provider)`. Başka hiçbir dosya
değişmez. `generateObject` isteğe bağlıdır; şema gerektiren isteklerde onu
uygulamayan sağlayıcılar zincirden elenir.

`lastResortCategories` göçün en önemli tasarım kararlarından biri: yerel
sağlayıcı serbest sohbette **zincirin sonunda** durur. Aksi hâlde "önce yerel"
kuralı her kullanıcıya her soruda şablon cevap verirdi.

## Local Model

Cihaz üstü LLM **çalıştırılmıyor** ve bu bilinçli bir karar (gerekçe:
`docs/AI_MODEL_DECISION.md`). Özet: küçük bir quantize model 2–3 GB indirme ve
orta segment Androidde 30–60 sn'lik yanıt süresi demek; ölçülen uzak süre ~5 sn.
Bugün geçmek ürünü **kötüleştirirdi**.

Bunun yerine kurulan şey gerçek ve çalışıyor: `deterministic-local` sağlayıcısı
ağsız, ücretsiz, cihazda çalışır ve deterministik motorun sayılarını güvenli
şablon cümlelerle birleştirir.

Native köprü geldiğinde tek gereken `globalThis.HedefitLocalAi` üzerinden
`LocalAiBridge` sunmak; `capability.ts` otomatik `LOCAL_READY` döner ve router
yeni sağlayıcıyı `kind: "local"` olduğu için zincirin başına alır — **Hedefit'in
geri kalanında tek satır değişmeden**.

## Kimi Fallback

Kimi artık bir varsayılan, bir bağımlılık değil. `openai-compatible` sağlayıcısı
`AI_BASE_URL` + `AI_MODEL` ile herhangi bir OpenAI-uyumlu uç noktaya döner.
Zincir: `local (kategori uygunsa) → uzak → local (son çare) → açık hata`.
Ham sağlayıcı hatası kullanıcıya **hiçbir koşulda** ulaşmaz.

## Intelligence Engine

`lib/ai/intelligence.ts` — BMI, kalori hedefi/tüketilen/kalan, protein
hedefi/kalan, BMR/TDEE, hedefe kalan kilo, 7 günlük kilo farkı, haftalık
trend/oran, 7 günlük ortalamalar, aktivite sayıları.

**Formül tekrarlamaz:** BMR/TDEE/makro `lib/nutrition-goals.ts`, trend yine
orada, BMI `lib/body-metrics.ts`. Motor bunları tek bir `CoachFacts` nesnesinde
toplar.

Hesaplanamayan alan `undefined` kalır ve `missing[]`'e yazılır — **uydurulmaz**.
Prompt modele bu değerlerin "KESİN DOĞRU" olduğunu ve yeniden hesaplanmamasını
söyler.

Göç öncesinde istemci BMI'yı kendisi hesaplıyor, ölçü eksikse yerine sabit
`"22.4"` yazıyordu; yani modele hiç ölçülmemiş bir değer gerçek gibi gidiyordu.
Bu ortadan kalktı ve testle korunuyor.

## Memory System

Dokuz dar kategori. `sanitizeMemory` modelin JSON'unu tek tek doğrular; güveni
`0.6` altındaki çıkarım saklanmaz (yanlış bir "sevmiyor" kaydı, kaydın hiç
olmamasından zararlıdır). Tekilleştirme hem uygulamada (`dedupeMemories`) hem
veritabanında (`unique`) yapılır; çakışmada kullanıcının açık ifadesi çıkarımı
yener.

Çıkarım **ayrı uç noktada** (`POST /api/ai/memory`) ve istemci yanıtı ekrana
bastıktan sonra çalışır — sohbet yanıtı ikinci bir model çağrısını beklemez.
Ucuz bir ön eleme (`mayContainMemory`) aday olmayan mesajlarda ücretli çağrıyı
hiç yapmaz.

Kullanıcı hafızasını `GET /api/ai/memory` ile görebilir, `DELETE` ile siler.

## RAG

`lib/ai/knowledge.ts` — sekiz küratörlü parça, her biri **kaynak ve tarih**
taşır. Model üretimi "tıbbi gerçek" bu tabloya yazılmaz.

Vektör veritabanı bilerek kurulmadı: bu ölçekte kalite kazancı vermeden dağıtımı
ve maliyeti büyütürdü. `KnowledgeRetriever` arayüzü asenkron olduğu için içerik
büyüdüğünde yalnız `retrieve` gövdesi değişir, çağıran taraf değişmez.

Getirim **soruya** göre yapılır; eşleşme yoksa hiçbir şey gönderilmez.

## Safety

`lib/ai/safety.ts` prompttan bağımsız. Altı kategori: acil, kendine zarar, yeme
bozukluğu, aşırı kısıtlama, ilaç, tanı. Engellenen istek **hiçbir sağlayıcıya
gitmez** ve kullanıcının günlük hakkı harcanmaz.

Kalıplar bilerek dardır: `sıradan fitness soruları ENGELLENMEZ` testi
("kas ağrısı normal mi?", "bacak ağrım var…") bu dengeyi korur. Her iki dilin
kalıbı da denenir — TR arayüzde İngilizce yazan kullanıcı da korunur.

Çıktı tarafında `enforceOutputSafety`, modelin kendiliğinden kurduğu tanı
cümlesine hatırlatma ekler; faydalı içeriği silmez.

## Security Improvements

1. **Sağlayıcıya özgü mantık alan modülünden çıkarıldı** — `ai-nutrition-estimator.ts`
   artık `moonshot`/`kimi-k2` bilmiyor.
2. **Güvenlik katmanı kullanım hakkından önce** — güvenlik uyarısı görmek artık
   AI hakkı harcamıyor.
3. **Ham sağlayıcı hatası kullanıcıya sızmıyor**; log'a yalnızca sınıflandırılmış
   tür yazılıyor (`classifyError`).
4. **İstemci artık türetilmiş değer gönderemiyor** — aralık dışı değerler
   kırpılmaz, atılır (kırpmak sessizce yanlış bir gerçek üretirdi).
5. **Prompt injection sınırı korundu ve genişletildi** — `<facts>`, `<memory>`,
   `<knowledge>` etiketleri; kural yalnızca bölüm gerçekten gönderildiğinde eklenir.
6. **Telemetri ve geri bildirimde metin saklanmıyor** — sağlık verisi ikinci bir
   tabloya çoğaltılmıyor.
7. **Kullanıcı izolasyonu RLS'te**, uygulama kodunda değil; sunucu istemcisi de
   kullanıcının kendi jetonuyla kuruluyor, servis anahtarı kullanılmıyor.
8. **Gizlilik politikası güncellendi** — hafıza, geri bildirim ve teknik ölçüm
   kategorileri eklendi; artık varsayılan olmayan model adı düzeltildi.

Denetim sonucu: istemci bileşenlerinde sağlayıcı sırrı **yok**; üretim
bundle'ında (`dist/client`) `AI_API_KEY` veya sağlayıcı uç noktası **yok**;
`NEXT_PUBLIC_` öneki olmayan hiçbir değişken istemciye gitmiyor.

## Tests Added

63 yeni test, altı dosyada — gerçek sağlayıcıya **hiç ağ isteği yapılmadan**:

| Dosya | Kapsam |
|---|---|
| `ai-router.test.mjs` (16) | Yerelde cevaplanan istek ücretli çağrı üretmiyor · yerel hata → yedek · desteklenmeyen kategori atlanıyor · her sağlayıcı çökünce açık hata · iptalde yedek çağrı yok · son çare sıralaması · registry davranışı |
| `ai-intelligence.test.mjs` (7) | Kalan kalori/BMI/hedefe kalan · kayıtlı hedef ezilmiyor · veri yoksa uydurulmuyor · trend eşikleri · protein negatife düşmüyor |
| `ai-safety.test.mjs` (10) | Altı engelleme kategorisi · dilden bağımsızlık · **sıradan soruların engellenmemesi** · çıktı güvenliği |
| `ai-memory-context.test.mjs` (15) | Geçersiz/düşük güvenli kayıt eleniyor · tekilleştirme önceliği · bağlam bütçesi · alakasız bilgi girmiyor · provenans · prompt kuralları |
| `ai-signals.test.mjs` (7) | İstemci türetilmiş değer gönderemiyor · aralık dışı atılıyor · eski istemci çökertmiyor |
| `ai-coach-service.test.mjs` (8) | Uçtan uca: gerçekler prompta gömülüyor · acil durumda sıfır çağrı · yedekte sayılı yanıt · hafıza iletimi · bozuk model JSON'u çökertmiyor |

## Tests Executed

```
node --test tests/*.test.mjs
ℹ tests 524   ℹ pass 524   ℹ fail 0
```

Temel (göç öncesi): 461 geçer / 0 başarısız. Göç sırasında kırılan 3 test
**gerçek** bulguları yakaladı ve düzeltildi:

1. `plan-programs` × 2 — taşınan sabitlerin yeni konumuna yönlendirildi.
2. `usage-limits` — uzak sağlayıcı çökünce yerel yanıt veriliyor ama günlük hak
   iade **edilmiyordu**. Kullanıcı ücretli hizmeti almadan hakkını kaybederdi;
   düzeltildi.
3. `nutrition-tracking` — sağlayıcı tuhaflığı taşınırken daha ucuz varsayılan
   beslenme modeli düşmüştü (maliyet regresyonu); geri alındı.

Ayrıca iki güvenlik kalıbı testte açık verdi ve düzeltildi: `"chest hurts"`
(yalnız `"chest pain"` eşleşiyordu) ve `"Günde 500 kalori"` (Türkçe sözcük
sırası).

## Build Result

```
npm run build → Build complete.
```

Yeni rotalar (`/api/ai/feedback`, `/api/ai/memory`) Worker çıktısında kayıtlı.
`npx tsc --noEmit` temiz. `npx eslint` yeni/değişen dosyaların **hepsinde**
temiz.

Lint bütününde kalan 209 hata **göç öncesinden** vardır ve tamamı bir önceki
oturumdan kalmış `.claude/worktrees/.../dist` derleme çıktısındadır; kaynak
kodda değildir.

## Runtime Verification

- `npm run dev` → uygulama açılıyor, giriş ekranı doğru render ediliyor,
  **tarayıcı konsolunda hata yok**.
- `POST /api/chat` · `GET /api/ai/memory` · `POST /api/ai/feedback` → kimlik
  doğrulaması olmadan **401**.
- Kimlik doğrulamalı akışlar (sohbet, kullanım hakkı, iade) mevcut test
  paketinde gerçek rota modülü içe aktarılarak doğrulanıyor.

## Remaining Limitations

1. ~~**Cihaz üstü LLM yok**~~ — **ÇÖZÜLDÜ (Phase 2)**: LiteRT-LM 0.16.1 ile
   gerçek Capacitor/Android köprüsü yazıldı. Bkz. `docs/LOCAL_AI_PHASE2.md`.
   Kalan tek eksik ölçüm: fiziksel cihaz (bkz. `docs/LOCAL_AI_BENCHMARK.md`).
2. ~~**Model indirme ekranı yok**~~ — **ÇÖZÜLDÜ (Phase 2)**: kullanıcı onaylı,
   ilerlemeli, iptal edilebilir, SHA-256 doğrulamalı indirme
   (`components/LocalAiSettings.tsx` + `LocalAiModelStore.kt`).
3. **Kullanıcıya dönük "Yerel AI" anahtarı yok** — bilerek. Bugün var olmayan
   bir yeteneği vaat ederdi. İşletmeci tarafında `AI_ROUTING_MODE` çalışıyor.
4. **`ai_provider_events` yazımı bağlanmadı** — tablo, tip ve olay üretimi hazır;
   her istekte fazladan bir veritabanı yazımı eklememek için kalıcılaştırma
   çağıran tarafa bırakıldı. Bugün olaylar `consoleEventSink` ile log'a gidiyor.
5. ~~**Diğer dört AI rotası hâlâ uyumluluk katmanından geçiyor**~~ — **ÇÖZÜLDÜ**
   (bkz. aşağıdaki "İkinci Dalga"). Dört rota da Coach Service boru hattını
   kullanıyor ve `lib/ai-provider.ts` tamamen silindi.
6. ~~**Migration uygulanmadı**~~ — **ÇÖZÜLDÜ**: `db/migrations/20260819_ai_memory.sql`
   kullanıcı tarafından uygulandı. Hafıza ve geri bildirim artık etkin.
7. **Bilgi tabanı sekiz parça** — genel ilkelerle sınırlı, tanı içermez.
8. **Konuşma özeti deterministik**, modelle üretilmiyor — her mesajın maliyetini
   ikiye katlamamak için.

## Recommended Next Steps

1. `db/migrations/20260819_ai_memory.sql` dosyasını üretimde çalıştırın; ardından
   hafıza ve geri bildirim kendiliğinden devreye girer.
2. Uygulama içine "AI Koç Hafızası" ekranı ekleyin (`GET`/`DELETE /api/ai/memory`
   hazır) — kullanıcı kontrolünü görünür kılar.
3. `ai_provider_events` yazımını açın (tercihen toplu/örneklemeli) ve yerel ile
   uzak yanıtların 👍/👎 oranlarını karşılaştırın.
4. Kalan dört rotayı kademeli olarak Coach Service'e taşıyın; en çok kazancı
   `weekly-review` ve `goal-plan` verir (ikisi de deterministik motorun zaten
   ürettiği sayıları kullanabilir).
5. Cihaz üstü çıkarım için Capacitor köprüsünü yazın ve `LocalAiBridge`'i
   uygulayın; model seçimini gerçek cihaz ölçümüyle yapın.

---

# İkinci Dalga — Uyumluluk Katmanının Kaldırılması

Tarih: 2026-08-19 (aynı gün, ilk dalganın devamı)

İlk dalgada dört rota (`generate-plan`, `weekly-review`, `goal-plan`,
`nutrition/advice`) `lib/ai-provider.ts` uyumluluk katmanı üzerinden
çalışmaya devam ediyordu (bkz. Remaining Limitations #5). Bu dalgada hepsi
Coach Service boru hattına taşındı ve **uyumluluk katmanı tamamen silindi**.

## Eklenen altyapı

Coach Service sohbet için tasarlanmıştı: girdi mesaj dizisi, çıktı metin.
Bu dört rota ise **şemaya bağlı** çıktı üretir. Aynı boru hattını sohbet
olmayan görevlere açmak için üç parça eklendi:

| Ekleme | Rol |
|---|---|
| `prompts.ts` → `buildTaskSystemPrompt()` | Ortak kurallar (gerçekler kesindir, hafıza, güvenilmezlik) + göreve özgü `domainRules` |
| `context-builder.ts` → `buildTaskContext()` | Konuşma geçmişi olmayan görevler için hafıza + bilgi getirimi; sorgu bir dize |
| `coach.ts` → `generateCoachObject()` / `generateCoachTaskText()` | Güvenlik → bağlam → router zinciri, şema veya metin çıktısıyla |

Tasarım kararı: **`facts` hazır gelir.** Her rotanın kendi deterministik motoru
zaten çalışıyor (`planGoal`, `profileSignals`, `validateWeeklySummary`,
`nutritionGaps`). Coach Service bunları yeniden hesaplasaydı iş mantığı ikinci
kez yazılmış olurdu. Servis yalnızca onları `<facts>` içine otorite olarak
yerleştirir.

## Rota bazında değişim

| Rota | Kazanım |
|---|---|
| `weekly-review` | Özet `<facts>` içinde otorite; **hafıza** haftalık önerileri şekillendiriyor; bilgi getirimi hedef kategorisine göre |
| `goal-plan` | `goalPlanSummary` otorite; hafıza "bu hafta yapılacaklar" adımlarını şekillendiriyor |
| `nutrition/advice` | **Kalan makrolar artık sunucuda** (`nutritionGaps`) — model çıkarma yapmıyor; beslenme tercihleri (vejetaryen, alerji) öneriyi belirliyor |
| `generate-plan` | Tüm veri serbest metin başlıkları yerine yapılandırılmış `<facts>` içinde; hafıza sevilmeyen hareketleri programdan uzak tutuyor; fotoğraf varsa `vision` kategorisi |

Ek olarak `lib/ai-nutrition-estimator.ts` doğrudan `routeObject`'e bağlandı.
Kişiselleştirme gerektirmeyen bir iş olduğu için (200 g pilav kaç kalori)
bilerek Coach Service'in bağlam/hafıza hattına sokulmadı — her öğün girişine
gereksiz bir veritabanı turu eklerdi.

## Uyumluluk katmanı silindi

`lib/ai-provider.ts` **artık yok**. İçindeki iki genel yardımcı doğru yerlerine
taşındı:

- `hasAiProvider()` → `hasRemoteProvider()`, `lib/ai/providers/openai-compatible.ts`
- `parseImageDataUrl()` → aynı dosya

Yedi rota artık sağlayıcı katmanını doğrudan, deprecate edilmiş bir ara katman
olmadan kullanıyor. Denetim: `grep -rn "ai-provider" app lib components hooks`
→ yalnızca bir tarihsel yorum satırı.

## Bu dalgada bulunan gerçek hatalar

1. **`loadMemories` çökebiliyordu.** "Hafıza asla çağrıyı bozmaz" sözü
   verilmişti ama `data` dizi değilse (tablo yok, vekil katman, tek satır
   yanıtı) `.map` doğrudan `TypeError` fırlatıyordu — bu durumda **plan üretimi
   ve sohbet tamamen çökerdi**. `Array.isArray` guard + `try/catch` eklendi.
2. **7 günlük kilo değişimi günün saatine göre kayıyordu.** Tarih anahtarlı
   ölçümler (`"2026-08-12"`) `Date.now() - 7 gün` gibi bir ANLA
   karşılaştırılıyordu; tam 7 gün önceki kayıt öğleden önce içeride, öğleden
   sonra dışarıda kalıyordu. Kullanıcı aynı veriyle sabah "-1,0 kg", öğleden
   sonra "veri yok" görebiliyordu. Karşılaştırma gün bazına alındı ve günün
   dört farklı saatinde doğrulandı.
3. **Test paketinde 7 sn'lik gecikme.** `weekly_ai_reviews` sorgusu
   mock'lanmadığı için supabase-js ağ hatasında yeniden deniyordu; iki test
   14 sn sürüyordu → 66 ms.

## Testler

15 yeni test (`tests/ai-task-routes.test.mjs`): görev boru hattı (gerçekler
otorite, hafıza iletimi, alakasız bilgi girmiyor, şema gerektiren işte yerel
sağlayıcı elenmiyor, çıktı güvenliği), deterministik makro hesabı ve **dört
rotanın kota davranışı** (hizmet alınmadıysa hak iade edilir).

Güncellenen testler — hepsinin AMACI korundu, yalnız yeni mimariye
yönlendirildi:

- `rendered-html` — plan verisinin modele ulaştığı iddiaları artık `<facts>`
  anahtarlarını doğruluyor (`profileTest`, `exerciseCatalog`, `trainingHistory`,
  `adaptation`)
- `nutrition-tracking` — sistem promptu bağlaması `domainRules` üzerinden

```
node --test tests/*.test.mjs
ℹ tests 539   ℹ pass 539   ℹ fail 0        (ilk dalga sonrası: 524)
npx tsc --noEmit  → temiz
npx eslint …      → 0 hata (1 önceden var olan uyarı)
npm run build     → EXIT=0
```

Çalışma zamanı: uygulama açılıyor, **konsolda hata yok**, beş AI rotası da
kimlik doğrulaması olmadan **401**.

## Sözleşme değişikliği

**Yok.** Dört rotanın da yanıt şekli (`{review, source, model, reason}`,
`{status, plan, analysis, source, model}`, `{advice, source}`,
`{...plan, profileFingerprint, model}`) ve kota davranışı birebir korundu;
testlerle doğrulandı.


---

# Phase 2 — Gerçek Cihaz Üstü LLM (özet)

Ayrıntı: [LOCAL_AI_PHASE2.md](LOCAL_AI_PHASE2.md) ·
[LOCAL_AI_BENCHMARK.md](LOCAL_AI_BENCHMARK.md) ·
[AI_MODEL_DECISION.md](AI_MODEL_DECISION.md)

## Ne yapıldı

Yerel katman artık şablon değil, **gerçek sinir ağı çıkarımı**. Zincir üç
katmanlı:

```
on-device-litertlm  →  openai-compatible  →  local-deterministic
```

| Bileşen | Dosya |
|---|---|
| Capacitor eklentisi | `android/.../localai/HedefitLocalAiPlugin.kt` |
| LiteRT-LM sarmalayıcı | `LocalAiEngine.kt` (çalışma zamanını gören TEK dosya) |
| Model deposu (indirme + SHA-256 + atomik kurulum) | `LocalAiModelStore.kt` |
| Yetenek algılama (ABI/RAM/depolama) | `LocalAiCapability.kt` |
| Doğrulanmış model kataloğu | `LocalAiModelCatalog.kt` |
| JS köprüsü | `lib/ai/local-bridge.ts` |
| Sağlayıcı | `lib/ai/providers/on-device.ts` |
| Yerel politika (bütçe/kategori/süre) | `lib/ai/local-policy.ts` |
| Kalite denetimleri | `lib/ai/benchmark.ts` |
| İndirme arayüzü | `components/LocalAiSettings.tsx` |
| Karşılaştırma kümesi (48 senaryo) | `tests/fixtures/ai/hedefit-local-benchmark.json` |

## Phase 2'de bulunan gerçek hatalar

1. **Android derlemesi zaten kırıktı.** `capacitor-health` (commit `21d22c9`)
   `minSdk 26` dayatıyor, proje 24 ilan ediyordu → manifest birleştirme hatası.
   Android paketi o commit'ten beri hiç üretilememiş. minSdk 26'ya çıkarıldı.
2. **Güvenlik açığı: "göğsüm acıyor" engellenmiyordu.** Kalıp yalnız "ağrı"
   arıyordu; Türkçede göğüs ağrısı en sık "acıyor" diye ifade edilir. Karşılaştırma
   koşucusunun ilk çalıştırmasında yakalandı, düzeltildi, teste bağlandı.
3. **Cihaz üstü model ana özellikte hiç devreye girmeyecekti.** Sohbet rotası
   `conversation` kategorisiyle istek gönderiyor, ama bu kategori yerel listede
   yoktu — model kurulu olsa bile her mesaj uzağa giderdi. Kendi testim yakaladı.
4. **Kotlin 2.1 LiteRT-LM'i okuyamıyor** (metadata 2.3.0). Sürüm 2.3.21'e
   çıkarıldı; bu bir tercih değil çalışma zamanı dayatması.

## Doğrulama

```
node --test tests/*.test.mjs   → 568/568 geçer   (Phase 2 öncesi 539)
npx tsc --noEmit               → temiz
npx eslint …                   → 0 hata (4 önceden var olan uyarı)
npm run build                  → EXIT=0 (Cloudflare/web)
npx cap sync android           → başarılı
./gradlew clean assembleDebug  → BUILD SUCCESSFUL, 56 MB APK
npm run ai:benchmark:check     → 48 senaryo, 0 güvenlik hatası, 0 bütçe aşımı
```

APK doğrulaması: `liblitertlm_jni.so` (arm64-v8a + x86_64) **var**,
`HedefitLocalAiPlugin` dex'te **var**, model dosyası **YOK** (gigabaytlar
pakete gömülmedi).

Cloudflare Worker paketinde LiteRT/Android bağımlılığı **yok**; yalnız
"köprü var mı" kontrolü var — sunucuda köprü hiçbir zaman bulunmaz.

## Fiziksel cihaz sonucu ve nihai karar

2026-08-19'da yetkili fiziksel **Samsung SM-A525F** üzerinde ölçüldü:
Android 14 (SDK 34), `arm64-v8a`, 7.489 MB toplam RAM. Benzersiz cihaz
tanımlayıcısı toplanmadı. Üç model de Hedefit model yöneticisiyle indirildi,
tam boyut ve SHA-256 doğrulandı, CPU LiteRT-LM ile yüklendi, 48 senaryo ve
ardışık 10 normal üretim çalıştırıldı.

| Model | Boyut | Soğuk yükleme | Medyan TTFT | Decode | Medyan toplam | Deterministik | Hata/zaman aşımı | Son PSS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Qwen3 0.6B int4 | 497.664.000 B | 5,97 sn (sıcak: 1,21 sn) | 7,33 sn | 7 tok/sn | 43,83 sn | 29/48 | 5 | 2,28 GB |
| Qwen2.5 1.5B q8 | 1.597.931.520 B | 59,10 sn | 15,62 sn | 4 tok/sn | 30,30 sn | 24/48 | 10 | 2,23 GB |
| **Gemma 4 E2B** | **2.588.147.712 B** | **25,51 sn** | **4,42 sn** | **8 tok/sn** | **26,41 sn** | **45/48** | **0** | **1,61 GB** |

Üç model de 10/10 ardışık üretimi çökmeden tamamladı. Qwen3 bozuk tekrarlar
ve prompt yankısı üretti; Qwen2.5 daha okunaklı olsa da anlamsız kardiyo
önerileri, zayıf gerçek koruma ve 10 zaman aşımı verdi. Gemma doğal ve
uygulanabilir Türkçe, sağlanan gerçekleri ve kullanıcı tercihlerini belirgin
biçimde daha iyi korudu; injection grubunda 5/5 geçti. Bu nedenle
`DEFAULT_MODEL_ID = "gemma-4-e2b"`. Karmaşık akıl yürütme, şemalı üretim ve
görsel işler ölçüm politikasına uygun olarak uzak sağlayıcıda kalır.

## Çevrimdışı, yönlendirme ve iptal

- Android'de Wi-Fi ve mobil veri kapalıyken `validatedNetworkAvailable=false`
  doğrulandı. Gemma `coach-01`, `miss-01` ve `fact-01` istemlerini yerelde
  tamamladı; her kayıtta `provider=local`, `fallbackUsed=false`, uzak istek yok.
- Aktif LiteRT üretimi iptal edildi ve **7,45 sn** içinde durdu (sınır 10 sn).
  Uzak yedek tetiklenmedi.
- Router regresyonu: Automatic `local → remote → deterministic`, Local-only
  `local → deterministic` ve asla remote, Cloud/remote modu yereli atlar.
  Kullanıcı iptali zinciri sonlandırır ve remote'a geçmez.

## Nihai doğrulama

```
npm test          → 573/573 geçti; production build başarılı
npx tsc --noEmit  → temiz
npm run android:build → BUILD SUCCESSFUL
```

## Kalan sınırlamalar

- Ölçüm tek fiziksel cihazda yapıldı; özellikle 6 GB toplam RAM sınırındaki
  cihazlar ayrıca doğrulanmalı.
- Gemma 2,59 GB indirme gerektiriyor ve medyan toplam yanıt süresi 26,41 sn;
  GPU/NPU ve ana sohbet arayüzünde token akışı bu fazda bilerek eklenmedi.
- Gemma eksik-veri grubunda 4/5 geçti; bir senaryoda bağlamda olmayan
  `0 antrenman` değeri üretti. Bu yüzden deterministik gerçek/safety katmanı
  ve uzak karmaşık-iş yönlendirmesi korunmalıdır.
- Gerçek fiziksel kanıt çevrimdışı yerel başarı ve native iptali kapsar;
  çalışma zamanı/uzak-sağlayıcı arıza dalları deterministik router testleriyle
  doğrulandı.
