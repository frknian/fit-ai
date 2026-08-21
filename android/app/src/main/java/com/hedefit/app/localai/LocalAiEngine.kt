package com.hedefit.app.localai

import android.content.Context
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.ExperimentalApi
import com.google.ai.edge.litertlm.ExperimentalFlags
import com.google.ai.edge.litertlm.ResponseFormat
import com.google.ai.edge.litertlm.SamplerConfig
import com.google.ai.edge.litertlm.ThinkingConfig
import kotlinx.coroutines.flow.Flow

/**
 * LiteRT-LM motorunun Hedefit'e uyarlanmış sarmalayıcısı.
 *
 * Bu sınıf LiteRT-LM'e özgü TEK yerdir. Capacitor eklentisi ve JavaScript
 * tarafı `Engine`, `Conversation`, `Backend` gibi tipleri hiç görmez; böylece
 * çalışma zamanı değişirse yalnız bu dosya değişir.
 *
 * YAŞAM DÖNGÜSÜ: motor pahalıdır (yükleme saniyeler sürer ve yüz MB'larca
 * bellek tutar), bu yüzden yüklendikten sonra yeniden kullanılır. Her mesajda
 * yeniden yüklemek her yanıta saniyeler eklerdi. Bellek baskısı veya model
 * değişimi durumunda açıkça boşaltılır.
 */
class LocalAiEngine {

    /** Yüklü motorun kimliği; model değişince yeniden yükleme gerektiğini anlarız. */
    @Volatile private var loadedModelId: String? = null
    @Volatile private var engine: Engine? = null
    @Volatile private var conversation: Conversation? = null
    @Volatile private var lastLoadMs: Long = 0

    private val lock = Any()

    val isLoaded: Boolean get() = engine != null
    val currentModelId: String? get() = loadedModelId
    val loadDurationMs: Long get() = lastLoadMs

    /**
     * Modeli belleğe yükler. ÇAĞIRAN TARAF ARKA PLANDA ÇAĞIRMALIDIR —
     * `initialize()` on saniyeye kadar sürebilir ve ana iş parçacığını
     * kilitlerdi (bkz. HedefitLocalAiPlugin, kendi havuzunda çalıştırır).
     */
    @OptIn(ExperimentalApi::class)
    fun load(context: Context, model: LocalAiModelCatalog.Entry): Long = synchronized(lock) {
        if (loadedModelId == model.id && engine != null) return lastLoadMs

        // Farklı bir model yüklüyse önce onu bırak: iki büyük modeli aynı anda
        // bellekte tutmak süreci öldürür.
        releaseLocked()

        val file = LocalAiModelStore.modelFile(context, model)
        if (!file.isFile) throw IllegalStateException("model_not_installed")

        // BenchmarkInfo varsayılan olarak KAPALI ve çağrı sessizce hata verir.
        // Phase 2 karşılaştırması ile ürün telemetrisi TTFT/decode hızını bu
        // API'den okuduğu için motor yaratılmadan önce açık olmalıdır.
        ExperimentalFlags.enableBenchmark = true
        val startedAt = System.currentTimeMillis()
        val config = EngineConfig(
            modelPath = file.absolutePath,
            // CPU BİLEREK: GPU arka ucu tüm cihazlarda güvenilir değil ve
            // başarısız delegate başlatması süreci çökertebiliyor. GPU,
            // karşılaştırma sonuçları cihaz sınıfına göre güvenli olduğunu
            // gösterdiğinde açılacak bir sonraki adımdır.
            backend = Backend.CPU(),
            // Bağlam penceresi mobil için kasıtlı olarak küçük tutulur; modelin
            // ilan ettiği maksimumu kullanmak KV cache belleğini boşuna büyütür.
            maxNumTokens = model.maxNumTokens,
            cacheDir = context.cacheDir.absolutePath,
        )
        val created = Engine(config)
        created.initialize()
        engine = created
        loadedModelId = model.id
        lastLoadMs = System.currentTimeMillis() - startedAt
        return lastLoadMs
    }

    /**
     * Konuşma oturumunu (yeniden) kurar.
     *
     * Hedefit her istekte TAM bağlamı kendisi üretir (Intelligence Engine +
     * Memory + Context Builder). Bu yüzden modelin kendi sohbet geçmişini
     * biriktirmesini İSTEMİYORUZ: aksi hâlde aynı bilgi hem sistem isteminde
     * hem birikmiş geçmişte iki kez yer alır ve bağlam bütçesi şişer.
     * Her üretim taze bir oturumla yapılır.
     */
    private fun newConversation(model: LocalAiModelCatalog.Entry, systemPrompt: String, maxOutputTokens: Int, temperature: Double, needsResponseFormat: Boolean = false): Conversation {
        val active = engine ?: throw IllegalStateException("engine_not_loaded")
        conversation?.runCatching { close() }
        val config = ConversationConfig(
            systemInstruction = if (systemPrompt.isBlank()) null else Contents.of(systemPrompt),
            samplerConfig = SamplerConfig(
                topK = 40,
                topP = 0.95,
                // Koçluk yanıtında yaratıcılık değil tutarlılık isteriz;
                // yüksek sıcaklık uydurma sayı riskini artırır.
                temperature = temperature,
                seed = 0,
            ),
            maxOutputToken = maxOutputTokens,
            // Görünür akıl yürütme KAPALI: 140 kelimelik bir koçluk yanıtı için
            // yüzlerce token düşünmek yalnızca gecikme ve pil harcar.
            thinkingConfig = if (model.supportsThinking) ThinkingConfig(false) else null,
            // Yalnız şema kısıtlı üretim istendiğinde açılır; her sohbet
            // oturumunda gereksiz kısıtlı-kod-çözme yolunu etkinleştirmemek için.
            enableResponseFormat = needsResponseFormat,
        )
        return active.createConversation(config).also { conversation = it }
    }

    /**
     * Akışlı üretim. Çağıran taraf Flow'u toplar ve iptali coroutine ile yapar.
     *
     * @param jsonSchema Verilirse LiteRT-LM'in kısıtlı (grammar-constrained)
     *   kod çözümü devreye girer: motor bu şemaya UYMAYAN bir token DİZİSİ
     *   üretemez, yani söz dizimi düzeyinde geçersiz JSON imkânsız hâle gelir.
     *   Bu, alan adlarının/değerlerin ANLAMCA doğru olacağını garanti ETMEZ —
     *   onu uygulama katmanındaki şema doğrulayıcı (bkz. lib/ai/providers/
     *   on-device.ts) ve rota düzeyindeki semantik kontroller (ör.
     *   validateGoalAnalysis, workouts.length) üstlenir.
     */
    fun generateStream(
        model: LocalAiModelCatalog.Entry,
        systemPrompt: String,
        userPrompt: String,
        maxOutputTokens: Int,
        temperature: Double,
        jsonSchema: String? = null,
    ): Flow<com.google.ai.edge.litertlm.Message> = synchronized(lock) {
        val session = newConversation(model, systemPrompt, maxOutputTokens, temperature, needsResponseFormat = jsonSchema != null)
        val responseFormat = jsonSchema?.let { ResponseFormat.json(it) }
        session.sendMessageAsync(userPrompt, responseFormat = responseFormat)
    }

    /**
     * Üretimi durdurur.
     *
     * Bu, kullanıcının açık isteğidir (durdur düğmesi) — bir sağlayıcı arızası
     * DEĞİLDİR. Çağıran taraf bunu uzak sağlayıcıya düşme sebebi saymamalıdır.
     */
    fun cancel() {
        conversation?.runCatching { cancelProcess() }
    }

    /**
     * Son üretimin ölçümleri; karşılaştırma koşucusu bunu kullanır.
     *
     * LiteRT-LM bu API'yi @ExperimentalApi olarak işaretliyor. Opt-in DAR
     * tutuluyor (modül geneli değil, yalnız bu iki fonksiyon): API değişirse
     * derleme burada kırılır ve fark edilir. Ölçüm verisi ürün akışı için
     * zorunlu değildir — runCatching ile sarılıdır, kaybolursa üretim sürer.
     */
    @OptIn(ExperimentalApi::class)
    fun benchmarkInfo(): com.google.ai.edge.litertlm.BenchmarkInfo? =
        conversation?.runCatching { getBenchmarkInfo() }?.getOrNull()

    @OptIn(ExperimentalApi::class)
    fun tokenCount(): Int = conversation?.runCatching { getTokenCount() }?.getOrNull() ?: 0

    private fun releaseLocked() {
        conversation?.runCatching { close() }
        conversation = null
        engine?.runCatching { close() }
        engine = null
        loadedModelId = null
        lastLoadMs = 0
    }

    /** Belleği bırakır. Bellek baskısında ve model değişiminde çağrılır. */
    fun release() = synchronized(lock) { releaseLocked() }
}
