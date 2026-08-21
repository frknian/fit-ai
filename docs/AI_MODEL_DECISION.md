# AI Model ve Çalışma Zamanı Kararı

Bu belge, Hedefit'in "yerel-öncelikli" hedefine hangi teknik gerçeklikle
yaklaştığını ve neden bugün cihaz üstü bir LLM ÇALIŞTIRMADIĞIMIZI anlatır.

## 1. Platform gerçeği (karar buradan çıkıyor)

Hedefit tek bir kod tabanından üç ortamda çalışır:

| Ortam | Ne çalışır | Cihaz üstü LLM mümkün mü? |
|---|---|---|
| Cloudflare Worker | Next.js/RSC sunucu tarafı, API rotaları | Hayır — bu kullanıcının cihazı değil; "yerel" tanımına girmez. Worker'da 128 MB bellek ve CPU süresi sınırı var. |
| Tarayıcı (PWA) | İstemci bileşenleri | Teknik olarak WebGPU ile mümkün, ama 1–2 GB model indirmesi ve kalıcı depolama yönetimi gerekir |
| Capacitor WebView (Android/iOS) | Aynı istemci kodu | Ancak NATIVE bir köprü ile. Bugün projede böyle bir eklenti yok. |

`android/` ve `ios/` klasörleri Capacitor'ün ürettiği kabuklardır; içlerinde
çıkarım çalışma zamanı (llama.cpp, MLC, MediaPipe LLM, Core ML) yoktur.

## 2. Neden şimdi bir model indirmiyoruz

Küçük ama Türkçesi kullanılabilir bir model (Gemma 3 4B, Qwen 3 4B, Phi 4 mini
sınıfı) 4-bit quantize halde **≈2–3 GB**'dır. Bunun anlamı:

- Google Play'de uygulama boyutu değil ama **ilk açılışta 2–3 GB indirme**
- 3–4 GB RAM'li orta segment Android cihazlarda yükleme sırasında **OOM riski**
- Üretim hızı bu sınıf cihazlarda **~3–8 token/sn** → 140 kelimelik bir koç
  yanıtı **30–60 sn**. Ölçülen uzak model süresi (`kimi-k2.7-code-highspeed`)
  **~5 sn**.

Yani bugün cihaz üstü LLM'e geçmek, kullanıcı deneyimini **iyileştirmez,
belirgin biçimde kötüleştirir**. "Yerel-öncelikli" hedefi doğru; onu yanlış
zamanda yanlış araçla uygulamak ürünü bozar.

## 3. Bunun yerine ne yapıldı

Yerel katman **gerçekten** kuruldu, ama LLM ile değil:

**`lib/ai/providers/deterministic-local.ts`** — ağ gerektirmeyen, cihazda
çalışan, ücretsiz bir sağlayıcı. Deterministik motorun (`lib/ai/intelligence.ts`)
ürettiği gerçek sayıları, güvenli ve tıbben temkinli şablon cümlelerle
birleştirir. Bu bir yer tutucu değil: uzak sağlayıcı çöktüğünde kullanıcı boş
ekran yerine kendi verisine dayanan somut bir yanıt alır.

Kritik tasarım kararı: bu sağlayıcı serbest sohbette **son çare**dir
(`lastResortCategories`), tercih edilen yol değil. Aksi hâlde her kullanıcı her
soruda şablon cevap alırdı.

## 4. Cihaz üstü LLM eklendiğinde ne olacak

Mimari buna **hazır**. Gereken tek şey `LocalAiBridge` arayüzünü uygulayan bir
Capacitor eklentisi (`lib/ai/capability.ts`):

```ts
type LocalAiBridge = {
  isRuntimeAvailable(): Promise<boolean>;
  isModelInstalled(): Promise<boolean>;
  availableMemoryMb(): Promise<number>;
};
```

Köprü `globalThis.HedefitLocalAi` üzerinden göründüğünde:

1. `detectDeviceAiCapability()` otomatik olarak `LOCAL_READY` döner
2. Yeni sağlayıcı `providerRegistry.register(onDeviceLlmProvider)` ile eklenir
3. Router onu `kind: "local"` olduğu için **zincirin başına** alır

**Hedefit'in geri kalanında tek satır değişmez.** Rotalar, bileşenler ve
deterministik motor bu geçişten habersizdir.

### Köprü geldiğinde model seçim ölçütleri

Bugünden bir model adı sabitlemiyoruz — köprü yazıldığında piyasa değişmiş
olacak. Değerlendirme şu eksenlerde yapılmalı:

| Ölçüt | Neden |
|---|---|
| Türkçe kalitesi | Kullanıcı tabanının ana dili; İngilizce ağırlıklı küçük modeller Türkçede belirgin düşüş yaşar |
| Yapılandırılmış çıktı | Hafıza çıkarımı ve niyet sınıflandırma JSON şeması gerektirir |
| RAM (4-bit) | Hedef: ≤ 2 GB, `MIN_LOCAL_MEMORY_MB` eşiğiyle uyumlu |
| İndirme boyutu | Wi-Fi zorunlu, kullanıcı onaylı indirme |
| Gecikme | Orta segment Androidde ilk token < 2 sn, ≥ 15 token/sn |
| Çalışma zamanı uyumu | Seçilen köprünün (MediaPipe / llama.cpp / Core ML) desteklediği format |
| Lisans | Ticari dağıtıma açık olmalı (Hedefit Play Store'da ücretli plan sunar) |

Aday aileler: **Gemma**, **Qwen**, **Phi**. Karar, gerçek cihazlarda ölçüm
yapılmadan verilmemelidir.

## 5. Model indirme deneyimi (köprü sonrası)

`docs/AI_MIGRATION_REPORT.md` "Remaining Limitations" bölümünde de belirtildiği
gibi bu ekran **henüz yapılmadı**, çünkü indirilecek bir şey yok. Köprü
geldiğinde gereken davranış:

- Sessiz indirme YOK; açık kullanıcı onayı
- Wi-Fi zorunlu, boyut önceden gösterilir
- İlerleme, iptal, yeniden dene
- Depolama alanı kontrolü
- Modeli silme / yeniden indirme
- Model sürümü görünür

## 6. Uzak sağlayıcı seçimi

Uzak katman **sağlayıcıya bağlı değildir**: `lib/ai/providers/openai-compatible.ts`
OpenAI-uyumlu herhangi bir uç noktayla çalışır. Moonshot (Kimi) yalnızca
varsayılan; `AI_BASE_URL` + `AI_MODEL` ile OpenRouter, Together, Fireworks veya
kendi vLLM/Ollama sunucunuza tek ortam değişkeniyle geçilir.

Varsayılan `kimi-k2.7-code-highspeed` seçimi ölçüme dayanır (bkz. aynı dosyadaki
süre tablosu): akıl yürüten modeller bu uygulamanın zaman penceresine
yetişmiyordu.


---

# PHASE 2 GÜNCELLEMESİ — Cihaz üstü LLM artık GERÇEK

Yukarıdaki Phase 1 değerlendirmesi "bugün cihaz üstü LLM çalıştırmıyoruz"
diyordu ve gerekçesi doğruydu. Phase 2 o kararı **tersine çevirdi**: Google'ın
üretim için hazırladığı LiteRT-LM çalışma zamanı entegre edildi ve gerçek bir
Capacitor/Android köprüsü yazıldı.

## Çalışma zamanı kararı

**Seçilen:** `com.google.ai.edge.litertlm:litertlm-android:0.16.1`

| Aday | Sonuç |
|---|---|
| **LiteRT-LM** | ✅ Seçildi. Google'ın üretim çalışma zamanı; Kotlin API'si coroutine/Flow tabanlı; `cancelProcess()` ve `BenchmarkInfo` yerleşik; `.litertlm` artefaktları hazır |
| MediaPipe LLM Inference (`tasks-genai`) | ❌ Bakım modunda; görev tanımı da kaçınılmasını istiyor |
| llama.cpp / ONNX Runtime | ❌ Değerlendirilmedi — LiteRT-LM sorunsuz entegre oldu, karşılaştırma yapmadan başka bir çalışma zamanına geçmek gerekçesiz olurdu |

Karar dokümantasyona değil **artefakta** dayanır: AAR indirilip `javap` ile
incelendi, kullanılan her sınıf ve imza gerçek ikili dosyadan doğrulandı.

### Öğrenilen sert kısıtlar

- AAR yalnız **arm64-v8a** ve **x86_64** native kitaplığı taşıyor →
  32-bit ARM cihazlar desteklenmez (yetenek algılamada elenir).
- AAR **Kotlin metadata 2.3.0** ile derlenmiş → projenin Kotlin sürümü
  2.3.21'e çıkarılmak ZORUNDA kaldı (2.1/2.2 okuyamıyor).
- AAR `minSdkVersion 24`; uygulamanın tabanı ayrı bir sebeple 26'ya çıktı.

## Model adayları (ölçüme hazır)

Boyut ve SHA-256 değerleri Hugging Face API'sinden okunmuş gerçek değerlerdir.
Üçü de Apache-2.0 ve gate'siz.

| Model | Artefakt | Boyut | Min. RAM | Not |
|---|---|---|---|---|
| Qwen3 0.6B (mixed int4) | `qwen3_0_6b_mixed_int4.litertlm` | 0,50 GB | 3 GB | En küçük; thinking destekli (kapalı kullanılır) |
| Qwen2.5 1.5B (q8) | `Qwen2.5-1.5B-Instruct_…_q8_ekv4096.litertlm` | 1,60 GB | 4 GB | Denge adayı |
| Gemma 4 E2B | `gemma-4-E2B-it.litertlm` | 2,59 GB | 6 GB | En büyük; kalite adayı |

Kapsam dışı:
- **Qwen2.5 0.5B** — depoda `.litertlm` yok, yalnız `.task`; LiteRT-LM 0.16.1
  ile kullanılamaz.
- **Gemma 3 1B** — litert-community deposu Gemma 4 ailesine geçmiş; yerine
  `gemma-4-E2B` alındı.

## VARSAYILAN MODEL: HENÜZ KANITA DAYALI SEÇİLMEDİ

`DEFAULT_MODEL_ID = "qwen3-0.6b-int4"`

Bu bir **ölçüm sonucu değildir**. Fiziksel cihaz bulunmadığı için karşılaştırma
çalıştırılamadı (`docs/LOCAL_AI_BENCHMARK.md` → PHYSICAL_DEVICE_BENCHMARK_BLOCKED).
En küçük model, en düşük "hiç çalışmama" riskine sahip olduğu için geçici
varsayılan yapıldı.

Nihai seçim şu eksenlerde ölçüldükten sonra yapılmalı — ve **yalnız hızla ya da
yalnız boyutla** verilmemeli:

1. Türkçe koçluk kalitesi
2. `<facts>` içindeki sayıları koruma (uydurmama)
3. Talimata uyma
4. TTFT ve decode token/sn
5. RAM ve termal davranış
6. İndirme boyutunun kullanıcıya maliyeti

Ölçüm tamamlandığında `LocalAiModelCatalog.DEFAULT_MODEL_ID` güncellenir ve
sonuç tablosu `docs/LOCAL_AI_BENCHMARK.md` içine yazılır.

---

## 2026-08-21 güncellemesi — Hedefit-mini denemesi ve varsayılanın korunması

Gemma 4 E2B'yi öğretmen alan bir damıtma denemesi yapıldı (bkz.
`docs/LOCAL_AI_BENCHMARK.md` > Hedefit-mini). Sonuç: 251 MB, cihazda 35/48 —
gerçek ve ölçülmüş bir sonuç, ama ≥40/48 hedefinin altında.

**`DEFAULT_MODEL_ID` Gemma 4 E2B olarak KALIYOR.** Gerekçe: küçük ve hızlı
olmak başlı başına bir kazanım değildir; kanıta dayalı kalite eşiğini
tutturmamış bir modeli yalnız boyutu küçük diye varsayılan yapmak, bu projenin
baştan beri izlediği "sezgiyle değil ölçümle karar ver" ilkesine aykırı olurdu.

`hedefit-mini`, kataloğa **ikincil bir seçenek** olarak eklendi
(`LocalAiModelCatalog.kt`). İleride eğitim verisi/yöntemi iyileştirilip
40+/48'e ulaşıldığında `DEFAULT_MODEL_ID` burada güncellenir.

## Şemaya bağlı yerel üretim (2026-08-21)

LiteRT-LM 0.16.1'in `ResponseFormat.json(schema)` API'si — kısıtlı
(grammar-constrained) kod çözüm — cihaz üstü modellerin yapılandırılmış JSON
üretmesini mümkün kılıyor: motor şemaya UYMAYAN bir token dizisi üretemez.
Bu, alan DEĞERLERİNİN (ör. egzersiz kimliklerinin katalogla eşleşmesi) anlamca
doğru olacağını garanti ETMEZ; yalnız söz dizimi düzeyinde geçerli JSON
garantisi verir.

Bu nedenle şemaya bağlı üretim üç kategoride açıldı (`localObjectCapableCategories`),
her biri kendi güvenlik ağıyla:

- `goal_progress`, `complex_reasoning` — route'ta deterministik şablon yedeği
  VAR; yerel geçersiz JSON üretse bile kullanıcı anlamlı bir kart görür.
- `plan_generation` (antrenman programı) — route'ta şablon yedek YOK; bunun
  yerine route yerel sonucu semantik olarak doğrular (`workouts.length >= 3`)
  ve geçersizse UZAĞA BİR KEZ yeniden dener. Kullanıcı hiçbir zaman gereksiz
  bir 502 görmez.
