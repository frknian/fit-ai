package com.hedefit.app.coach

import android.app.Application
import android.os.Build
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import com.hedefit.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class LocalCoachState(
    val supported: Boolean,
    val downloading: Boolean = false,
    val installed: Boolean = false,
    val downloadedBytes: Long = 0,
    val totalBytes: Long = 0,
    val ready: Boolean = false,
    val error: String? = null,
) {
    val progress: Float get() = if (totalBytes > 0) downloadedBytes.toFloat() / totalBytes else 0f
}

/** On-device Qwen 1.7B runner. The model is explicitly downloaded, never packaged in the APK. */
class LocalCoach(private val application: Application) {
    private val modelFile = File(File(application.filesDir, "local-coach").apply { mkdirs() }, "qwen3-1.7b-q8_0.gguf")
    val state = MutableStateFlow(LocalCoachState(supported = Build.VERSION.SDK_INT >= 30 && Build.SUPPORTED_64_BIT_ABIS.isNotEmpty()))
    private var engine: InferenceEngine? = null

    init {
        state.update { it.copy(installed = hasModel(), downloadedBytes = if (hasModel()) modelFile.length() else 0L, totalBytes = if (hasModel()) modelFile.length() else 0L) }
    }

    fun hasModel(): Boolean = modelFile.isFile && modelFile.length() > 1_500_000_000L

    suspend fun downloadAndPrepare(language: String) = withContext(Dispatchers.IO) {
        require(state.value.supported) { "Akıllı Fit Koç Android 11 ve 64-bit cihaz gerektirir." }
        if (!hasModel()) download()
        prepare(language)
    }

    suspend fun prepare(language: String) = withContext(Dispatchers.IO) {
        require(hasModel()) { "Qwen modeli henüz indirilmedi." }
        if (state.value.ready) return@withContext
        state.update { it.copy(error = null) }
        try {
            val localEngine = engine ?: AiChat.getInferenceEngine(application).also { engine = it }
            withTimeout(20_000) { localEngine.state.first { it !is InferenceEngine.State.Initializing } }
            localEngine.loadModel(modelFile.absolutePath)
            localEngine.setSystemPrompt(systemPrompt(language))
            state.update { it.copy(ready = true, installed = true, error = null) }
        } catch (error: Throwable) {
            state.update { it.copy(ready = false, error = "Yerel model başlatılamadı: ${error.message ?: "bilinmeyen hata"}") }
            throw error
        }
    }

    suspend fun reply(message: String, language: String): String = withContext(Dispatchers.IO) {
        if (!state.value.ready) prepare(language)
        val answer = StringBuilder()
        requireNotNull(engine).sendUserPrompt(message, predictLength = 280).collect { answer.append(it) }
        answer.toString().trim().ifBlank { "Bu yanıtı oluşturamadım. Sorunu daha kısa yazmayı dene." }
    }

    fun removeModel() {
        runCatching { engine?.cleanUp() }
        modelFile.delete()
        File(modelFile.parentFile, "download.part").delete()
        state.value = LocalCoachState(supported = state.value.supported)
    }

    private fun download() {
        val partial = File(modelFile.parentFile, "download.part")
        state.update { it.copy(downloading = true, error = null, downloadedBytes = partial.length()) }
        try {
            val connection = (URL(BuildConfig.LOCAL_COACH_MODEL_URL).openConnection() as HttpURLConnection).apply {
                connectTimeout = 20_000
                readTimeout = 60_000
                instanceFollowRedirects = true
                if (partial.exists()) setRequestProperty("Range", "bytes=${partial.length()}-")
            }
            connection.connect()
            val resumed = connection.responseCode == HttpURLConnection.HTTP_PARTIAL
            if (!resumed && partial.exists()) partial.delete()
            val start = if (resumed) partial.length() else 0L
            val total = connection.contentLengthLong.takeIf { it > 0 }?.plus(start) ?: 0L
            connection.inputStream.use { input ->
                partial.outputStream().buffered().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var downloaded = start
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        downloaded += count
                        state.update { it.copy(downloadedBytes = downloaded, totalBytes = total) }
                    }
                }
            }
            check(partial.length() > 1_500_000_000L) { "Model dosyası eksik indirildi." }
            check(partial.renameTo(modelFile)) { "Model dosyası kaydedilemedi." }
            state.update { it.copy(downloading = false, installed = true, downloadedBytes = modelFile.length(), totalBytes = modelFile.length()) }
        } catch (error: Throwable) {
            state.update { it.copy(downloading = false, error = "Model indirilemedi: ${error.message ?: "bağlantıyı kontrol et"}") }
            throw error
        }
    }

    private fun systemPrompt(language: String): String = if (language == "en") """
        You are Fit Coach, Hedefit's concise offline fitness coach. Only answer questions about exercise, nutrition, recovery, and healthy habits. Politely decline every other topic in one short sentence, then invite the user to ask about their goal, workout, or meals. Give practical guidance using the user's stated context only. For a healthy training adult, general basics are: protein 1.6–2.2 g/kg/day, moderate calorie deficit for fat loss, a small surplus for muscle gain, and 2–4 resistance sessions per week to start. Never present these as medical prescriptions; never diagnose, prescribe medication, recommend extreme diets, or promise spot-fat loss. Say you are not a doctor for injury, eating-disorder, pregnancy, or illness questions. Use short, clear Turkish if the user writes Turkish; otherwise English. Do not invent calories or medical facts; ask a follow-up when data is missing.
    """.trimIndent() else """
        Sen Hedefit'in kısa ve uygulanabilir çevrimdışı Fit Koçusun. Yalnızca antrenman, beslenme, toparlanma ve sağlıklı alışkanlıklarla ilgili soruları yanıtla. Spor ve beslenme dışındaki her soruyu tek kısa ve nazik cümleyle reddet; ardından kullanıcıyı hedefi, antrenmanı veya öğünleriyle ilgili bir soru sormaya davet et. Yalnızca kullanıcının verdiği bilgilere dayanarak öneri ver. Sağlıklı ve düzenli antrenman yapan yetişkinler için temel çerçeve: günlük protein kilo başına 1,6–2,2 gram, kilo vermede ılımlı kalori açığı, kas almada küçük kalori fazlası ve başlangıçta haftada 2–4 direnç seansıdır. Bunları tıbbi reçete gibi sunma. Tanı koyma, ilaç önerme, aşırı diyet önerme ve bölgesel yağ yakımı sözü verme. Sakatlık, yeme bozukluğu, hamilelik veya hastalık sorularında doktor olmadığını belirt ve uzmana yönlendir. Veri yoksa kalori veya sağlık bilgisi uydurma; kısa bir takip sorusu sor.
    """.trimIndent()
}
