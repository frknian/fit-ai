package com.hedefit.app.localai

/**
 * Cihaz üstü model kataloğu.
 *
 * Buradaki her değer GERÇEK ve DOĞRULANMIŞTIR: dosya adları, byte boyutları ve
 * SHA-256 özetleri 2026-08-19'da Hugging Face API'sinden (`paths-info`)
 * okunmuştur. Uydurulmuş bir boyut/özet, indirmeyi ya hiç bitmeyen ya da
 * bozuk dosyayı "hazır" sayan bir sisteme çevirirdi.
 *
 * Katalog NEDEN native tarafta?
 * İndirme, bütünlük doğrulaması ve dosya yönetimi native katmanda yapılır;
 * JavaScript'e yalnızca "hangi modeller var, hangisi kurulu" bilgisi gider.
 * Böylece WebView'a keyfi bir indirme URL'si verme imkânı doğmaz — JS yalnız
 * BURADAKİ kimliklerden birini seçebilir (bkz. HedefitLocalAiPlugin).
 *
 * Modellerin tamamı Apache-2.0 lisanslı ve HF üzerinde gate'siz; indirme için
 * kullanıcı hesabı/lisans kabulü gerekmez.
 */
object LocalAiModelCatalog {

    /**
     * @param maxNumTokens Motorun toplam bağlam penceresi (giriş + çıkış).
     *   Mobilde modelin ilan ettiği maksimumu kullanmak bellek israfıdır;
     *   Hedefit istemleri bunun çok altında kalır (bkz. LOCAL_PROMPT_BUDGET).
     * @param minTotalRamMb Bu modeli yüklemeyi denemek için gereken TOPLAM cihaz
     *   RAM'i. Ölçüt keyfi değil: dosya boyutunun yaklaşık iki katı + işletim
     *   sistemi ve WebView payı. Altındaki cihazda yükleme denemesi süreci
     *   öldürür, bu yüzden hiç denenmez.
     * @param chatApproved Bu modelin çıktısı KULLANICIYA OLDUĞU GİBİ
     *   gösterilebilir mi. Koç sohbeti yalnız bu bayrağı taşıyan modellere
     *   yönlendirilir; taşımayanlar deneysel/ölçüm amaçlıdır.
     *
     *   Bayrak ÜÇ ayrı eşiği birden temsil eder ve üçü de GERÇEK CİHAZDA
     *   ölçülmeden açılamaz — üçünden biri düşerse model kullanılamaz:
     *
     *     1. Dil biçimi  — Türkçe biçimbirimler bozulmuyor mu
     *        (lib/ai/turkish.ts denetimi)
     *     2. İçerik      — yanıt soruyu gerçekten cevaplıyor, sayı uydurmuyor,
     *        kendisiyle çelişmiyor mu (48 senaryoluk küme)
     *     3. Bütçe       — bellek ve gecikme mobilde kabul edilebilir mi
     *
     *   Bu ayrım pahalıya öğrenildi: qwen2.5-1.5b-q8 birinci eşiği geçiyor
     *   (Türkçesi düzgün biçimli) ama ikinci ve üçüncüde kalıyor. Yalnız
     *   "int4 bozuyor, q8 bozmuyor" akıl yürütmesiyle onaylanmıştı; ölçüm
     *   bunu çürüttü.
     *
     *   Bayrak boyuta göre verilmiş bir tahmin DEĞİL, gözlenen bir ayrım:
     *   ≤0,6B modeller int4'e nicemlendiğinde Türkçe biçimbirimleri bozup
     *   var olmayan kelimeler üretiyor ("yüzme" → "yümç"). Eklemeli bir dilde
     *   bu, üslup ayarıyla düzelen bir şey değil. Bir modelin bayrağı
     *   açılmadan önce lib/ai/turkish.ts denetimini içeren benchmark'tan
     *   geçmesi gerekir (bkz. docs/LOCAL_AI_BENCHMARK.md).
     */
    data class Entry(
        val id: String,
        val displayName: String,
        val fileName: String,
        val downloadUrl: String,
        val sizeBytes: Long,
        val sha256: String,
        val maxNumTokens: Int,
        val minTotalRamMb: Int,
        val supportsThinking: Boolean,
        val chatApproved: Boolean,
    )

    private fun hf(repo: String, file: String) = "https://huggingface.co/$repo/resolve/main/$file?download=true"

    val entries: List<Entry> = listOf(
        Entry(
            id = "qwen3-0.6b-int4",
            displayName = "Hedefit Local AI (kompakt)",
            fileName = "qwen3_0_6b_mixed_int4.litertlm",
            downloadUrl = hf("litert-community/Qwen3-0.6B", "qwen3_0_6b_mixed_int4.litertlm"),
            sizeBytes = 497_664_000L,
            sha256 = "b1baab462f6be49d70eada79d715c2c52cd9ece0cad00bddf6a2c097d23498e9",
            maxNumTokens = 2048,
            minTotalRamMb = 3_072,
            // Qwen3 "thinking" modunu destekler; Hedefit'te KAPALI kullanılır
            // (bkz. LocalAiEngine — görünür akıl yürütme kısa koçluk yanıtında
            // yalnızca gecikme ve token harcar).
            supportsThinking = true,
            // 0,6B int4: hedefit-mini ile aynı sınıfta, Türkçesi sohbete
            // yetmiyor. Ölçüm/karşılaştırma için katalogda kalıyor.
            chatApproved = false,
        ),
        Entry(
            id = "qwen2.5-1.5b-q8",
            displayName = "Hedefit Local AI (dengeli)",
            fileName = "Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.litertlm",
            downloadUrl = hf("litert-community/Qwen2.5-1.5B-Instruct", "Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.litertlm"),
            sizeBytes = 1_597_931_520L,
            sha256 = "faa60663b333290c1496c499828b21d3e3254a788cacd8cce917ce0f761a2dc9",
            maxNumTokens = 2048,
            minTotalRamMb = 4_096,
            supportsThinking = false,
            // ÖLÇÜLDÜ (SM-A525F, 2026-08-21) — ONAYSIZ.
            //
            // Türkçesi biçim olarak DÜZGÜN: "yüzme" doğru yazılıyor, ses
            // dizimi denetiminden geçiyor. Yani int4 bozulması yok. Ama
            // diğer iki eşikte kalıyor:
            //
            //   İçerik: "Bugün 30 dakikalık 5 kilometre yürüyüş yapmalısınız.
            //   Bu yürüyüş, 10 dakikalık 2 kilometre yürüyüşüne eşit
            //   olmalıdır." — kendisiyle çelişiyor, <facts> dışı sayı
            //   uyduruyor, soruyu cevaplamıyor.
            //
            //   Bütçe: PSS 2255 MB (Gemma'nın 1321 MB'ının neredeyse iki
            //   katı — q8 ağırlıklar bellekte sıkıştırılmadan duruyor),
            //   decode 4,0 tok/s, model yüklüyken yanıt 29,6 sn, ilk
            //   yüklemede 98,9 sn.
            //
            // Katalogda ölçüm/karşılaştırma için kalıyor.
            chatApproved = false,
        ),
        Entry(
            id = "gemma-4-e2b",
            displayName = "Hedefit Local AI (gelişmiş)",
            fileName = "gemma-4-E2B-it.litertlm",
            downloadUrl = hf("litert-community/gemma-4-E2B-it-litert-lm", "gemma-4-E2B-it.litertlm"),
            sizeBytes = 2_588_147_712L,
            sha256 = "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c",
            maxNumTokens = 2048,
            // 6144 İDİ → 8192. SM-A525F (7,6 GB toplam) eşiği geçiyordu ama
            // ölçümde yüklemeden sonra PSS 1321 MB'a çıkıp WebView'la birlikte
            // belleği tüketiyordu (bkz. aşağıdaki DEFAULT açıklaması). Eşik,
            // ölçümün gerçekte gösterdiği yere çekildi: bu modeli yalnız 8 GB
            // ve üzeri cihazlarda deniyoruz.
            minTotalRamMb = 8_192,
            supportsThinking = false,
            // Karşılaştırmada en yüksek kalite (45/48).
            chatApproved = true,
        ),
        Entry(
            id = "hedefit-mini",
            displayName = "Hedefit Local AI",
            fileName = "hedefit-mini.litertlm",
            // Hedefit'in kendi distilasyon boru hattında üretildi
            // (scripts/ml/): Gemma 4 E2B öğretmen, Qwen2.5-0.5B-Instruct
            // öğrenci, LoRA ince ayar + int4 nicemleme. Henüz genel dağıtıma
            // açılmadığı için indirme adresi boş; şimdilik `adb push` ile
            // yerleştiriliyor. docs/LOCAL_AI_BENCHMARK.md > Hedefit-mini.
            downloadUrl = "",
            sizeBytes = 263035904L,
            sha256 = "10f382e3de3482a8ff82a60d75aa10bb825eacd9fe36c959ac7e3771acd9ff14",
            maxNumTokens = 1024,
            minTotalRamMb = 2_048,
            supportsThinking = false,
            // 0,5B int4. Hızlı ve küçük ama Türkçesi kullanıcıya
            // gösterilebilir değil — sahada "yüzme" yerine "yümç" üretti.
            chatApproved = false,
        ),
    )

    fun byId(id: String?): Entry? = entries.firstOrNull { it.id == id }

    /**
     * Cihazın belleğine sığan EN İYİ sohbet modeli, yoksa null.
     *
     * "En iyi" = en büyük: bu katalogda boyut ile Türkçe kalitesi aynı yönde
     * gidiyor (0,5B bozuk, 1,5B kullanılabilir, E2B en iyi). Sabit tek bir
     * varsayılan yerine cihaza göre seçmenin sebebi bu: 8 GB'lık bir telefonu
     * 4 GB'lık bir telefonun kısıtına mahkûm etmek gereksiz bir kalite kaybı,
     * tersi ise sürecin öldürülmesi demek.
     */
    fun bestChatModelFor(totalRamMb: Long): Entry? = entries
        .filter { it.chatApproved && totalRamMb >= it.minTotalRamMb }
        .maxByOrNull { it.sizeBytes }

    /**
     * Cihazda kullanılacak model.
     *
     * Sohbete uygun bir model sığıyorsa o seçilir. Sığmıyorsa küçük model
     * (`FALLBACK_MODEL_ID`) döner — ama bu, sohbetin ona yönlendirileceği
     * anlamına GELMEZ: JS tarafı `chatReady` bayrağına bakar ve bayrak
     * kapalıysa sohbeti sunucuya gönderir (bkz. lib/ai/local-first.ts).
     * Küçük model yine de indirilebilir ve ölçüm/deney için kullanılabilir.
     */
    fun recommendedFor(totalRamMb: Long): Entry =
        bestChatModelFor(totalRamMb) ?: byId(FALLBACK_MODEL_ID)!!

    /**
     * Sohbete uygun model bulunamadığında kalan seçenek.
     *
     * hedefit-mini (Hedefit'in kendi damıtılmış modeli, 251 MB, PSS 563 MB):
     * düşük bellekli cihazlarda gerçekten ÇALIŞAN tek seçenek — medyan 9,7 sn
     * ve motor bellekte kalabiliyor. Kıyasla Gemma 4 E2B aynı cihazda (SM-A525F,
     * 7,6 GB) yükleme sonrası PSS 1321 MB'a çıkıyor, WebView + React üstüne
     * eklenince boş bellek tükeniyor, sistem motoru boşaltıyor ve HER istek
     * 2,59 GB'lık modeli baştan yüklüyordu: medyan 26,4 sn ve sık sık süreç
     * ölümü.
     *
     * AMA hedefit-mini'nin Türkçesi sohbete yetmiyor (`chatApproved =
     * false`). Bu yüzden burası bir "varsayılan sohbet modeli" değil, yalnız
     * kataloğun boş dönmemesi için bir taban.
     */
    const val FALLBACK_MODEL_ID = "hedefit-mini"

    /**
     * Geriye dönük uyumluluk için sabit varsayılan.
     *
     * Yeni kod `recommendedFor(totalRamMb)` kullanmalı; cihazı bilmeyen
     * çağrılar (ör. katalog listeleme) için taban model döner.
     */
    const val DEFAULT_MODEL_ID = FALLBACK_MODEL_ID
}
