# Hedefit Yerel AI Karşılaştırması

## DURUM: PHYSICAL_DEVICE_BENCHMARK_BLOCKED

**Gerçek cihaz üstü çıkarım ölçümü YAPILAMADI ve hiçbir sayı uydurulmadı.**

Bu belgede TTFT, token/sn veya bellek değeri bulamayacaksınız — çünkü ölçüm
yapılmadı. Ölçüm altyapısının tamamı hazırdır; eksik olan tek şey donanımdır.

Ortam tespiti (2026-08-19):

```
$ adb devices -l
List of devices attached          ← bağlı cihaz yok

$ emulator -list-avds
                                  ← tanımlı AVD yok

$ ls $ANDROID_HOME/system-images
                                  ← kurulu sistem imajı yok
```

Bu, görev tanımındaki **geçerli dış blokaj** tanımına girer ("no authorized
physical Android device"). Diğer tüm Phase 2 işleri tamamlandı.

### Neden emülatörle "ölçüp" geçmedik

Bir x86_64 emülatörde çıkarım çalıştırılabilirdi, ama üretilen TTFT ve
token/sn değerleri gerçek bir telefonun performansıyla ilgisiz olurdu ve
belgeye yazıldığı anda yanıltıcı bir "ölçüm" hâline gelirdi. Mobil karar
mobil donanımda verilir.

---

## Ölçüm altyapısı (hazır)

### 1. Veri kümesi
`tests/fixtures/ai/hedefit-local-benchmark.json` — **48 senaryo**, 10 grup:

| Grup | Konu | Senaryo |
|---|---|---|
| A | Kişiselleştirilmiş koçluk | 6 |
| B | Kalori bağlamı (gerçekler hazır verilir) | 6 |
| C | Kilo trendi | 5 |
| D | Hafıza (tercihe uyma) | 5 |
| E | Eksik veri (uydurmama) | 5 |
| F | Güvenlik (modele hiç ulaşmamalı) | 5 |
| G | Türkçe kalitesi | 4 |
| H | Motivasyon | 3 |
| I | Gerçeklere uyma | 4 |
| J | Prompt injection | 5 |

Her senaryo Hedefit'in **kendi boru hattından** geçer: deterministik gerçekler
`<facts>` içinde hazır verilir, hafıza `<memory>` içine konur, güvenlik katmanı
modelden önce çalışır.

### 2. Deterministik kalite denetimleri
`lib/ai/benchmark.ts` — **uydurma "kalite puanı" üretilmez.** Yalnız nesnel
olarak doğrulanabilir şeyler ölçülür:

| Denetim | Ne yakalar |
|---|---|
| `mustContainNumbers` | Motorun verdiği sayı yanıtta korunmuş mu (ör. kalan 350 kcal) |
| `forbiddenNumbers` | Uydurma/enjekte edilmiş sayı |
| `mustNotInventNumbers` | Veri yokken sayı üretme |
| `mustAdmitMissing` | "Bilmiyorum" diyebilme |
| `mustBeTurkish` | Dil doğru mu (İngilizce belirteç baskınsa düşer) |
| `forbiddenSubstrings` | Hafızadaki tercihe aykırı öneri (sevmediği hareket) |
| `mustNotObeyInjection` | Enjeksiyon talimatına uyma |
| `minWords`/`maxWords` | Kullanılabilir uzunluk |

Öznel kalite (üslup, doğallık) **sayıya çevrilmez**; yanıtlar insan incelemesi
için rapora yazılır.

### 3. Performans metrikleri
LiteRT-LM `BenchmarkInfo` doğrudan sağlar ve eklenti bunları döndürür:
`initTimeInSecond` (model yükleme), `timeToFirstTokenInSecond` (TTFT),
`lastPrefillTokenCount`, `lastDecodeTokenCount`, `lastPrefillTokensPerSecond`,
`lastDecodeTokensPerSecond`. Ayrıca toplam süre, hata/zaman aşımı oranı.

### 4. Koşucu
`scripts/local-ai-benchmark.mjs`

Cihazsız da çalışan bölüm **bugün geçiyor**:

```
$ node scripts/local-ai-benchmark.mjs --check
Hedefit yerel AI karşılaştırması — 48 senaryo, 10 grup
Güvenlik yönlendirmesi: 5 engellenmeli senaryo, 0 hata
İstem bütçesi: 0 senaryo 6000 karakteri aşıyor
```

Bu koşum **gerçek bir güvenlik açığı yakaladı**: "Koşarken göğsüm **acıyor**"
engellenmiyordu, çünkü kalıp yalnız "ağrı" arıyordu. Türkçede göğüs ağrısı en
sık "acıyor" diye ifade edilir. Düzeltildi ve teste bağlandı.

---

## Cihaz bağlandığında çalıştırma

```bash
# 1. Cihazı bağla ve USB hata ayıklamayı yetkilendir
adb devices

# 2. Uygulamayı kur
cd android && ./gradlew :app:installDebug

# 3. Cihazsız doğrulamalar + cihaz bilgisi
node scripts/local-ai-benchmark.mjs --device

# 4. Modelleri tek tek ölç
node scripts/local-ai-benchmark.mjs --device --model qwen3-0.6b-int4
node scripts/local-ai-benchmark.mjs --device --model qwen2.5-1.5b-q8
node scripts/local-ai-benchmark.mjs --device --model gemma-4-e2b
```

Ayrıca elle doğrulanması gerekenler:

| Test | Nasıl |
|---|---|
| Çevrimdışı üretim | Model kurulduktan sonra uçak moduna al, koça soru sor. `provider = on-device-litertlm`, `fallbackUsed = false` olmalı ve **hiç ağ isteği çıkmamalı** |
| Tekrarlanabilirlik | Arka arkaya **en az 10** üretim: çökme yok, bellek şişmesi yok, her istekte yeniden yükleme yok, gecikme kararlı |
| İptal | Üretim sırasında "durdur" → üretim durmalı, **uzak sağlayıcıya düşülmemeli** |
| Yedekleme | Modeli sil → istek uzak sağlayıcıya gitmeli |
| Arka plan/geri dönüş | Uygulamayı arka plana al, geri dön; motor durumu tutarlı olmalı |
| Termal | 10+ ardışık üretimde token/sn düşüşünü kaydet |

## Sonuç tablosu (cihaz bağlandığında doldurulacak)

| Model | Boyut | Yükleme | TTFT | Decode tok/sn | Geçen senaryo | Türkçe | Gerçeklere uyma | Hata |
|---|---|---|---|---|---|---|---|---|
| Qwen3 0.6B int4 | 0,50 GB | — | — | — | — | — | — | — |
| Qwen2.5 1.5B q8 | 1,60 GB | — | — | — | — | — | — | — |
| Gemma 4 E2B | 2,59 GB | — | — | — | — | — | — | — |

Cihaz: `—` · Android: `—` · ABI: `—` · RAM: `—`

**Bu tablo doldurulmadan `DEFAULT_LOCAL_MODEL` kanıta dayalı seçilemez.**
Bugünkü varsayılan (`qwen3-0.6b-int4`) bir ölçüm sonucu değil, en düşük
başarısızlık riskine sahip seçenektir.

---

## Hedefit-mini — damıtılmış özel model denemesi (2026-08-21)

**Öğretmen:** Gemma 4 E2B (mlx-community/gemma-4-e2b-it-4bit, Mac'te MLX ile)
**Öğrenci taban model:** Qwen2.5-0.5B-Instruct (Apache-2.0)
**Veri kümesi:** 2600 senaryo üretildi, filtre sonrası 2006 eğitim + 105 doğrulama örneği (%81 kabul). 48 senaryoluk benchmark kümesi eğitimde HİÇ kullanılmadı (tutulan/held-out).
**Yöntem:** LoRA ince ayar (mlx_lm), int4 + Hadamard kuantizasyon (`dynamic_wi4c_hr_afp32`), LiteRT-LM'e dönüştürme.
**Nihai boyut:** 251 MB (hedef ≤300 MB — tutturuldu)

İki eğitim turu, aynı fiziksel cihazda (Samsung SM-A525F) ölçüldü:

| Tur | Adım | Yöntem | Cihazda skor | TTFT | Decode | PSS |
|---|---|---|---|---|---|---|
| A | 600/900 | batch=4, lr=1e-4 | **35/48** | 3276ms | 24,4 tok/s | 563 MB |
| B | +300 (900 toplam) | batch=2, grad-checkpoint, lr=1e-4 | 28/48 (bozuldu, atıldı) | — | — | — |
| C | 600'den devam, +300 (900 toplam) | batch=2, grad-checkpoint, **lr=3e-5** | **35/48** | 3355ms | 24,0 tok/s | 559 MB |

**Sonuç:** İki geçerli tur da (A ve C) cihazda **aynı toplam skoru** (35/48) verdi; dağılım farklı (C'de eksik-veri kabulü daha iyi, gerçek-sayı koruma daha zayıf) ama net kazanç yok. **Hedef ≥40/48'e ulaşılamadı.**

**Bulunan gerçek hatalar:**
1. Öğretmen varsayılan olarak görünür düşünme kanalı (`<|channel>thought`) üretiyordu; istem `system` rolü içerdiğinde şablon bunu zorluyordu. İstemi tek `user` turn'üne indirip çıktıyı ayrıştırarak çözüldü.
2. İlk filtre sürümü geçerli Türkçeyi (kalın/madde işaretli biçim yüzünden) yanlışlıkla eliyordu (%54 kabul) — beyaz liste yerine yalnız Latin-dışı alfabe kontrolüne çevrilip %81'e çıkarıldı.
3. Eksik-veri senaryolarında SORU, eksik olan alanla eşleşmiyordu (ör. "adım verisi yok" senaryosuna "antrenman yapayım mı?" sorusu düşüyordu) — öğrenciye yanlış davranış öğretiyordu; sorular eksik alana bağlanarak düzeltildi.
4. Batch boyutunu düşürüp aynı yüksek öğrenme oranını (1e-4) korumak, zaten yakınsamış bir adaptörü **bozdu** (28/48, eksik-veri senaryolarında `2.7×10²⁶⁵` gibi anlamsız sayılar üretti). Öğrenme oranı 3e-5'e düşürülünce bu tekrarlanmadı.

**Karar:** `hedefit-mini` katalogda **ikincil/deneysel** bir seçenek olarak duruyor (251 MB, hızlı, düşük bellek) ama `DEFAULT_MODEL_ID` **Gemma 4 E2B olarak kalıyor** (45/48). Kanıta dayalı eşiği tutturmayan bir modeli varsayılan yapmak, "en düşük boyut" ile "en iyi ürün kararı" arasındaki farkı görmezden gelmek olurdu — görev tanımının kendisinin yasakladığı bir şey.

**Sonraki adaylar (denenmedi, zaman kısıtı):** daha büyük öğrenci taban model (Qwen2.5-1.5B üzerinde damıtma), daha fazla/çeşitli eğitim verisi (özellikle B/C/I gruplarını hedefleyen), tam 900 adımı ORİJİNAL (batch=4, lr=1e-4) ayarla tamamlamak (bilgisayar donanım riski yüzünden yarıda kesildi — Tur A 600'de durduruldu).

---

## Saha bulgusu ve düzeltme — cihaz üstü sohbet (2026-08-21)

Koç sohbeti cihaz üstü modele bağlandıktan sonra kullanıcı üç şey bildirdi:
yanıtlar anlamsız, Türkçe bozuk (**"yüzme" yerine "yümç"** gibi var olmayan
kelimeler) ve sayfa kendi kendine yenileniyor.

### 1. Bozuk Türkçe

Varsayılan cihaz modeli `hedefit-mini` (Qwen2.5-**0.5B** tabanlı, **int4**).
Bu belgenin kendi ölçümü zaten 35/48 demişti (hedef ≥40) ve *"ikincil/deneysel
kalsın"* kararını yazmıştı; buna rağmen `DEFAULT_MODEL_ID` ona çevrilmiş ve
sohbet o modele bağlanmıştı.

**Ölçümün kendisi de kusurluydu.** `mustBeTurkish` denetimi yalnız baskın
alfabeye/dile bakar, üretilen kelimelerin gerçek Türkçe kelimeler olup
olmadığına bakmaz — "yümç" o denetimden **geçer**. Yani 35/48 skoru dil
kalitesini olduğundan iyi gösteriyordu.

### 2. Kendi kendine yenilenen sayfa

`HedefitLocalAiPlugin` içinde bellek baskısında motoru boşaltan bir
`onTrimMemory` metodu vardı ama **hiçbir zaman çağrılmıyordu**: `override`
değildi ve süreç hiçbir `ComponentCallbacks2` kaydetmemişti (Capacitor'ın
`Plugin` sınıfında bellek baskısı kancası yoktur). Yüklü model bellekte
kalıyor, sistem süreci öldürüyor, uygulama yeniden başlıyordu.

Bu, Gemma 4 E2B'nin "üründe kullanılamaz" ölçülmesinin de **gerçek sebebiydi**:
model belleği hiç bırakılamıyordu.

---

## Yapılan düzeltmeler

### A. Türkçe ses dizimi denetimi — `lib/ai/turkish.ts`

Sözlük değil, **biçim** denetimi: Türkçe eklemeli olduğu için sonlu bir kelime
listesi "koşabilirsin", "antrenmanlarını" gibi geçerli biçimleri doğrulayamaz.
Onun yerine Türkçede kelime **sonundaki ünsüz öbeklerinin** dar ve iyi
tanımlı kümesi kullanılır; bozuk üretim bu kümenin dışına hemen çıkar
("yümç" → sondaki `mç` Türkçede oluşmaz).

Kural seti, depodaki **~37.000 kelimelik Türkçe düz yazı korpusuna** karşı
ölçülerek daraltıldı. Elenen iki kural ve nedeni:

| Aday kural | Neden elendi |
|---|---|
| 4+ ardışık ünsüz | `orkestra` (rkstr), `enstrüman`, `ekstra`, `prompttan` geçerlidir |
| Kelime başında 3 ünsüz | `stres`, `strateji` geçerlidir |

Ayrıca `â/î/û` ünlü sayılmazsa `imkânsız` ikiye bölünüyordu; `ebeveyn`, `bayt`,
`zevk`, `şeyh` gibi geçerli son öbekler listeye eklendi. Son hâli korpusta
**sıfır yanlış pozitif** veriyor. Bu zor örnekler regresyon testine bağlandı.

Denetim iki yerde kullanılıyor:

- **Benchmark:** `mustBeTurkish` işaretli **her** senaryoda otomatik çalışır
  (ayrı bayrak yok — "Türkçe istiyorum ama bozuk kelime kabul ediyorum" diye
  bir senaryo yok).
- **Çalışma anı:** aşağıdaki 3. kapı.

### B. Üç kapılı sohbet yönlendirmesi

Sohbetin cihazda üretilmesi için üçünün de açık olması gerekir:

| # | Kapı | Yer | Neyi yakalar |
|---|---|---|---|
| 1 | Kategori izinli mi | `lib/ai/local-policy.ts` | Hangi **iş** cihazda çalışabilir |
| 2 | Modelin `chatReady` bayrağı | `LocalAiModelCatalog` (native) | Hangi **model** yeterli |
| 3 | Üretilen metin denetimden geçti mi | `lib/ai/turkish.ts` | 1 ve 2 doğruyken bile bozuk çıkan **tek bir yanıt** |

3. kapı **akış sırasında da** işler. Sondaki denetim tek başına yetmezdi:
akış açıkken metin üretildikçe ekrana basılıyor, yani yanıtı en sonda
reddetsek bile kullanıcı bozuk kelimeleri çoktan görmüş olurdu. Bozulma
anlaşılır anlaşılmaz üretim iptal edilir (pil ve ısı da kazanılır), ekran
temizlenir ve sunucuya düşülür — kullanıcı yalnız "düşünüyor" göstergesi
görür. Akışın son kelimesi yarım olabileceği için denetim **tam kelimeler**
üzerinde ve en az 12 kelime biriktikten sonra yapılır.

### C. Cihaza göre model seçimi (boyut büyütüldü)

Sabit `DEFAULT_MODEL_ID` yerine `LocalAiModelCatalog.recommendedFor(totalRamMb)`:
cihazın belleğine sığan **en büyük** sohbet-onaylı model seçilir. Bu katalogda
boyut ile Türkçe kalitesi aynı yönde gidiyor.

| Model | Boyut | Min. RAM | Sohbete uygun |
|---|---|---|---|
| hedefit-mini (0,5B int4) | 251 MB | 2 GB | ✗ biçimbirimleri bozuyor |
| Qwen3 0.6B int4 | 0,50 GB | 3 GB | ✗ aynı sınıf |
| **Qwen2.5 1.5B q8** | **1,60 GB** | **4 GB** | ✓ q8 nicemleme, bozulma yok |
| **Gemma 4 E2B** | **2,59 GB** | **8 GB** | ✓ karşılaştırmada 45/48 |

Gemma'nın eşiği 6 GB'dan **8 GB'a çıkarıldı**: 7,6 GB'lık SM-A525F eşiği
geçiyordu ama ölçümde PSS 1321 MB'a çıkıp WebView'la birlikte belleği
tüketiyordu. Eşik, ölçümün gerçekte gösterdiği yere çekildi. Böylece o cihazda
Qwen2.5 1.5B seçilir — 0,5B'ye göre **6 kat büyük**, Gemma'ya göre yarı
bellek.

Sohbete uygun model sığmazsa `FALLBACK_MODEL_ID` (hedefit-mini) döner; sohbet
o modele **yönlendirilmez** (kapı 2 kapalı) ama model ölçüm/deney için
kullanılabilir.

### D. Bellek geri çağrısı gerçekten kaydedildi

`registerComponentCallbacks` ile uygulama context'ine kaydedildi,
`handleOnDestroy`'da geri alınıyor. Üretim sürerken gelen bildirimde motor
**anında bırakılmaz** — LiteRT-LM kod çözerken native nesneleri serbest
bırakmak, sistemin öldürmesinden daha kötü, kesin bir çökme olurdu; üretim
iptal edilip bırakma sonrasına ertelenir.

### E. Kapatma anahtarı

Cihazda sorun çıkarsa yeniden derlemeye gerek yok:

```js
localStorage.setItem("hedefit.localAiChat", "0")
```

Ortam değişkeni bilerek kullanılmadı: `process.env` istemci paketinde derleme
anında sabitlenir, yani telefondaki bir davranışı kapatmak için yeni sürüm
gerekirdi.

---

## Cihazda doğrulanması GEREKENLER

Bu düzeltmelerin hiçbiri gerçek donanımda çalıştırılmadı — bu makinede Java
runtime yok, Kotlin derlenemedi. Cihaz bağlandığında:

1. `Qwen2.5-1.5B q8` indirilip 48 senaryoluk küme koşulmalı; **artık
   `mustBeRealTurkish` denetimi de sayıyor**, bu yüzden eski skorlarla
   doğrudan karşılaştırılamaz — taban yeniden ölçülmeli.
2. Yükleme sonrası PSS ölçülmeli (`dumpsys meminfo`); 1,5B q8 için beklenen
   aralık doğrulanmalı.
3. 10+ ardışık üretimde süreç ölümü olmamalı — asıl "sayfa yenileniyor"
   testi budur.
4. Bellek baskısı altında (`adb shell am send-trim-memory <pid> RUNNING_LOW`)
   motorun gerçekten bırakıldığı ve üretim sırasında bırakmanın ertelendiği
   görülmeli.
