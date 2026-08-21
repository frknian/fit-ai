package com.hedefit.app.localai

import android.content.ComponentCallbacks2
import android.content.res.Configuration
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Hedefit'in cihaz üstü AI köprüsü.
 *
 * JavaScript'e AÇILAN YÜZEY BİLEREK DARDIR. Buradaki metotlar genel amaçlı
 * native yetenek sunmaz:
 *
 *   · dosya yolu kabul edilmez  → yalnız katalogdaki model kimliği
 *   · indirme URL'si kabul edilmez → adres native katalogdan gelir
 *   · keyfi kod/komut çalıştırılmaz
 *
 * Böylece WebView'a (uzak bir sunucudan yüklenen sayfaya) native yetki
 * devredilmiş olmaz.
 *
 * İŞ PARÇACIĞI: model yükleme ve üretim ASLA ana iş parçacığında çalışmaz;
 * hepsi Dispatchers.IO / Default üzerinde koşar.
 */
@CapacitorPlugin(name = "HedefitLocalAI")
class HedefitLocalAiPlugin : Plugin() {

    private val engine = LocalAiEngine()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val downloadCancelled = AtomicBoolean(false)
    @Volatile private var downloadJob: Job? = null
    @Volatile private var generationJob: Job? = null
    // Kullanıcı iptali ile gerçek arıza ayrımı: iptal, uzak sağlayıcıya
    // düşmeyi TETİKLEMEMELİDİR.
    @Volatile private var generationCancelledByUser = false

    // Bir seferde tek üretim. Aynı anda iki üretim başlatmak cihaz belleğini
    // ve ısısını gereksiz yere zorlar.
    private val generating = AtomicBoolean(false)

    // Üretim sürerken gelen bellek baskısı bildirimi. Motoru O ANDA bırakmak,
    // LiteRT-LM hâlâ kod çözerken altındaki native nesneleri serbest bırakmak
    // demektir — bu, sistemin öldürmesinden daha kötü, kesin bir çökme olurdu.
    // Bunun yerine üretim iptal edilir ve bırakma üretim bittikten sonra yapılır.
    private val releaseWhenIdle = AtomicBoolean(false)

    /**
     * Sistem bellek baskısı bildirdiğinde modeli bırakırız.
     *
     * Model belleği sürecin en büyük tek tüketicisidir (yüklü motor yüzlerce
     * MB); onu tutmak uğruna sürecin öldürülmesine izin vermek kullanıcının
     * uygulamayı kaybetmesi demektir. Bırakıldıktan sonra bir sonraki istek
     * modeli yeniden yükler ya da uzak sağlayıcıya düşer.
     *
     * KAYIT NEDEN ELLE YAPILIYOR: Capacitor'ın `Plugin` sınıfında bellek
     * baskısı için bir yaşam döngüsü kancası YOK — `handleOnPause`,
     * `handleOnDestroy` vb. var, `onTrimMemory` yok. Daha önce bu sınıfta
     * `onTrimMemory` adında bir metot vardı ama hiçbir şey onu ÇAĞIRMIYORDU:
     * `override` değildi ve süreç hiçbir `ComponentCallbacks2` kaydetmemişti.
     * Yani bellek bırakma kodu yazılmış ama hiç çalışmamıştı; motor bellekte
     * kalıyor, sistem bütün süreci öldürüyor ve WebView baştan yükleniyordu —
     * kullanıcıya "sayfa kendi kendine yenileniyor" diye görünen şey buydu.
     */
    private val memoryCallbacks = object : ComponentCallbacks2 {
        override fun onTrimMemory(level: Int) {
            if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) releaseEngineWhenSafe()
        }

        // Yapılandırma değişikliği (dönme, tema) bellekle ilgisizdir.
        override fun onConfigurationChanged(newConfig: Configuration) {}

        @Deprecated("ComponentCallbacks üzerinde kaldırıldı; API 34 öncesinde hâlâ çağrılır.")
        override fun onLowMemory() {
            releaseEngineWhenSafe()
        }
    }

    private fun releaseEngineWhenSafe() {
        if (generating.get()) {
            // Üretimi durdur; bırakma işini üretim döngüsünün sonu yapar.
            releaseWhenIdle.set(true)
            engine.cancel()
            return
        }
        engine.release()
    }

    override fun load() {
        super.load()
        // Uygulama context'ine kaydediyoruz: bildirim, Activity yeniden
        // yaratılsa da sürecin tamamı için gelir.
        context.applicationContext.registerComponentCallbacks(memoryCallbacks)
    }

    override fun handleOnDestroy() {
        runCatching { context.applicationContext.unregisterComponentCallbacks(memoryCallbacks) }
        scope.cancel()
        engine.release()
        super.handleOnDestroy()
    }

    /**
     * Cihazın belleğine göre seçilmiş model.
     *
     * Sabit bir varsayılan yerine cihaza göre seçiyoruz: 8 GB'lık bir telefonu
     * 4 GB'lık bir telefonun modeline mahkûm etmek gereksiz kalite kaybı,
     * tersi ise sürecin öldürülmesi demek (bkz. LocalAiModelCatalog).
     */
    private fun recommendedModel(): LocalAiModelCatalog.Entry =
        LocalAiModelCatalog.recommendedFor(LocalAiCapability.totalRamMb(context))

    private fun resolveModel(call: PluginCall): LocalAiModelCatalog.Entry? {
        // JS yalnız KİMLİK verebilir; bilinmeyen kimlik reddedilir.
        val id = call.getString("modelId") ?: return recommendedModel()
        return LocalAiModelCatalog.byId(id)
    }

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        scope.launch {
            runCatching {
                val model = call.getString("modelId")?.let { LocalAiModelCatalog.byId(it) } ?: recommendedModel()
                val report = LocalAiCapability.evaluate(context, model)
                JSObject().apply {
                    put("runtimeAvailable", true)
                    // Hangi modelin kullanılacağı ve o modelin çıktısının koç
                    // sohbetinde KULLANICIYA GÖSTERİLEBİLİR olup olmadığı.
                    // JS bu bayrağa bakar; kapalıysa sohbeti sunucuya yollar.
                    put("selectedModelId", model.id)
                    put("chatReady", model.turkishProseReady && report.state == LocalAiCapability.State.MODEL_READY)
                    put("supported", report.supported)
                    put("state", report.state.name)
                    put("reason", report.reason)
                    put("abi", report.abi)
                    put("sdkInt", report.sdkInt)
                    put("totalRamMb", report.totalRamMb)
                    put("availableRamMb", report.availableRamMb)
                    put("freeStorageMb", report.freeStorageMb)
                    put("lowRamDevice", report.lowRamDevice)
                    put("engineLoaded", engine.isLoaded)
                    put("loadedModelId", engine.currentModelId)
                }
            }.onSuccess { call.resolve(it) }
                .onFailure { call.reject("capability_failed", it.javaClass.simpleName) }
        }
    }

    @PluginMethod
    fun listModels(call: PluginCall) {
        scope.launch {
            val models = com.getcapacitor.JSArray()
            for (entry in LocalAiModelCatalog.entries) {
                models.put(JSObject().apply {
                    put("id", entry.id)
                    put("displayName", entry.displayName)
                    put("sizeBytes", entry.sizeBytes)
                    put("installed", LocalAiModelStore.isInstalled(context, entry))
                    put("minTotalRamMb", entry.minTotalRamMb)
                    put("turkishProseReady", entry.turkishProseReady)
                })
            }
            call.resolve(JSObject().apply {
                put("models", models)
                put("defaultModelId", recommendedModel().id)
            })
        }
    }

    @PluginMethod
    fun getModelStatus(call: PluginCall) {
        val model = resolveModel(call) ?: return call.reject("unknown_model")
        scope.launch {
            call.resolve(JSObject().apply {
                put("modelId", model.id)
                put("installed", LocalAiModelStore.isInstalled(context, model))
                put("sizeBytes", model.sizeBytes)
                put("downloadedBytes", LocalAiModelStore.installedBytes(context, model))
                put("downloading", downloadJob?.isActive == true)
                put("loaded", engine.currentModelId == model.id && engine.isLoaded)
            })
        }
    }

    @PluginMethod
    fun verifyModelIntegrity(call: PluginCall) {
        val model = resolveModel(call) ?: return call.reject("unknown_model")
        scope.launch {
            runCatching { LocalAiModelStore.verifyIntegrity(context, model) }
                .onSuccess { result ->
                    call.resolve(JSObject().apply {
                        put("modelId", model.id)
                        put("valid", result.valid)
                        put("sizeBytes", result.sizeBytes)
                        // Özeti yalnız doğrulama kanıtı olarak döndürürüz;
                        // cihaz veya kullanıcı tanımlayıcısı değildir.
                        put("sha256", result.sha256)
                    })
                }
                .onFailure { call.reject("integrity_check_failed", it.javaClass.simpleName) }
        }
    }

    @PluginMethod
    fun downloadModel(call: PluginCall) {
        val model = resolveModel(call) ?: return call.reject("unknown_model")
        if (downloadJob?.isActive == true) return call.reject("download_in_progress")
        downloadCancelled.set(false)
        downloadJob = scope.launch {
            runCatching {
                LocalAiModelStore.download(context, model, downloadCancelled) { downloaded, total ->
                    notifyListeners("localAiDownloadProgress", JSObject().apply {
                        put("modelId", model.id)
                        put("downloadedBytes", downloaded)
                        put("totalBytes", total)
                    })
                }
            }.onSuccess {
                call.resolve(JSObject().apply { put("installed", true); put("modelId", model.id) })
            }.onFailure { error ->
                // Ham hata mesajı/stacktrace ARAYÜZE GİTMEZ; yalnız sınıflandırma.
                val kind = when (error) {
                    is LocalAiModelStore.DownloadCancelledException -> "cancelled"
                    is LocalAiModelStore.IntegrityException -> "integrity_failed"
                    else -> "download_failed"
                }
                call.reject(kind)
            }
        }
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        downloadCancelled.set(true)
        call.resolve()
    }

    @PluginMethod
    fun deleteModel(call: PluginCall) {
        val model = resolveModel(call) ?: return call.reject("unknown_model")
        scope.launch {
            if (engine.currentModelId == model.id) engine.release()
            val deleted = LocalAiModelStore.delete(context, model)
            call.resolve(JSObject().apply { put("deleted", deleted) })
        }
    }

    @PluginMethod
    fun loadModel(call: PluginCall) {
        val model = resolveModel(call) ?: return call.reject("unknown_model")
        val timeoutMs = call.getInt("timeoutMs") ?: 120_000
        scope.launch {
            val result = runCatching {
                withTimeoutOrNull(timeoutMs.toLong()) { engine.load(context, model) }
            }
            result.onSuccess { loadMs ->
                if (loadMs == null) {
                    engine.release()
                    call.reject("load_timeout")
                } else {
                    call.resolve(JSObject().apply { put("loadMs", loadMs); put("modelId", model.id) })
                }
            }.onFailure { error ->
                engine.release()
                call.reject(if (error.message == "model_not_installed") "model_not_installed" else "load_failed")
            }
        }
    }

    @PluginMethod
    fun unloadModel(call: PluginCall) {
        scope.launch { engine.release(); call.resolve() }
    }

    /**
     * Akışlı üretim.
     *
     * Girdi, uygulamanın kendi boru hattının ürettiği NİHAİ istemdir; native
     * taraf ne Supabase'e ne başka bir servise erişir, kendi başına bağlam
     * üretmez.
     */
    @PluginMethod
    fun generate(call: PluginCall) {
        val model = resolveModel(call) ?: return call.reject("unknown_model")
        val systemPrompt = call.getString("systemPrompt").orEmpty()
        val userPrompt = call.getString("userPrompt").orEmpty()
        if (userPrompt.isBlank()) return call.reject("empty_prompt")
        val maxOutputTokens = call.getInt("maxOutputTokens") ?: 320
        val temperature = call.getDouble("temperature") ?: 0.3
        val timeoutMs = (call.getInt("timeoutMs") ?: 60_000).toLong()
        val stream = call.getBoolean("stream") ?: true
        val requestId = call.getString("requestId").orEmpty()
        // Verilirse LiteRT-LM'in kısıtlı kod çözümünü açar (bkz. LocalAiEngine
        // generateStream jsonSchema açıklaması). Akış (stream) şema kısıtlı
        // üretimde KAPATILIR: JS tarafı ancak tüm metin bitince JSON.parse
        // yapabilir, yarım parçaları göstermenin bir anlamı yok.
        val jsonSchema = call.getString("jsonSchema")

        if (!generating.compareAndSet(false, true)) return call.reject("generation_in_progress")
        generationCancelledByUser = false

        generationJob = scope.launch {
            val startedAt = System.currentTimeMillis()
            val builder = StringBuilder()
            val outcome = runCatching {
                if (!engine.isLoaded || engine.currentModelId != model.id) engine.load(context, model)
                withTimeoutOrNull(timeoutMs) {
                    engine.generateStream(model, systemPrompt, userPrompt, maxOutputTokens, temperature, jsonSchema = jsonSchema)
                        .collect { message ->
                            val chunk = message.contents.contents
                                .filterIsInstance<com.google.ai.edge.litertlm.Content.Text>()
                                .joinToString("") { it.text }
                            if (chunk.isNotEmpty()) {
                                builder.append(chunk)
                                if (stream && jsonSchema == null && requestId.isNotEmpty()) {
                                    notifyListeners("localAiToken", JSObject().apply {
                                        put("requestId", requestId)
                                        put("chunk", chunk)
                                    })
                                }
                            }
                        }
                    true
                }
            }

            generating.set(false)
            outcome.onSuccess { completed ->
                if (generationCancelledByUser) {
                    // İPTAL ARIZA DEĞİLDİR: ayrı bir kodla döner ki JS tarafı
                    // uzak sağlayıcıya düşmesin.
                    call.reject("cancelled")
                    return@onSuccess
                }
                if (completed == null) {
                    engine.cancel()
                    call.reject("generation_timeout")
                    return@onSuccess
                }
                val info = engine.benchmarkInfo()
                call.resolve(JSObject().apply {
                    put("text", builder.toString())
                    put("modelId", model.id)
                    put("totalMs", System.currentTimeMillis() - startedAt)
                    put("loadMs", engine.loadDurationMs)
                    put("promptTokens", info?.lastPrefillTokenCount ?: 0)
                    put("outputTokens", info?.lastDecodeTokenCount ?: 0)
                    put("ttftMs", ((info?.timeToFirstTokenInSecond ?: 0.0) * 1000).toLong())
                    put("decodeTokensPerSecond", info?.lastDecodeTokensPerSecond ?: 0.0)
                    put("prefillTokensPerSecond", info?.lastPrefillTokensPerSecond ?: 0.0)
                })
            }.onFailure { error ->
                if (generationCancelledByUser) call.reject("cancelled")
                else call.reject("generation_failed", error.javaClass.simpleName)
            }

            // Bellek baskısı üretim sırasında geldiyse bırakma buraya
            // ertelenmişti; ölçümler okunduktan sonra artık güvenli.
            if (releaseWhenIdle.compareAndSet(true, false)) engine.release()
        }
    }

    @PluginMethod
    fun cancelGeneration(call: PluginCall) {
        generationCancelledByUser = true
        engine.cancel()
        call.resolve()
    }

    @PluginMethod
    fun getBenchmarkInfo(call: PluginCall) {
        val info = engine.benchmarkInfo()
        call.resolve(JSObject().apply {
            put("available", info != null)
            put("initTimeMs", ((info?.initTimeInSecond ?: 0.0) * 1000).toLong())
            put("ttftMs", ((info?.timeToFirstTokenInSecond ?: 0.0) * 1000).toLong())
            put("prefillTokens", info?.lastPrefillTokenCount ?: 0)
            put("decodeTokens", info?.lastDecodeTokenCount ?: 0)
            put("prefillTokensPerSecond", info?.lastPrefillTokensPerSecond ?: 0.0)
            put("decodeTokensPerSecond", info?.lastDecodeTokensPerSecond ?: 0.0)
            put("tokenCount", engine.tokenCount())
        })
    }
}
