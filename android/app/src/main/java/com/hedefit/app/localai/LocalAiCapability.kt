package com.hedefit.app.localai

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.StatFs

/**
 * Cihazın yerel AI çalıştırmaya uygun olup olmadığına karar verir.
 *
 * "Android = destekleniyor" VARSAYILMAZ. LiteRT-LM 0.16.1 AAR'ı yalnızca
 * arm64-v8a ve x86_64 için native kitaplık taşır — 32-bit ARM cihazlarda
 * kitaplık yüklenemez ve süreç çöker. Bu yüzden ABI kontrolü ilk sıradadır.
 */
object LocalAiCapability {

    /** JS tarafındaki LocalAiState ile birebir aynı isimler. */
    enum class State {
        UNSUPPORTED_PLATFORM,
        LOW_MEMORY,
        INSUFFICIENT_STORAGE,
        MODEL_NOT_INSTALLED,
        MODEL_READY,
        RUNTIME_ERROR,
    }

    data class Report(
        val state: State,
        val supported: Boolean,
        val reason: String?,
        val abi: String,
        val sdkInt: Int,
        val totalRamMb: Long,
        val availableRamMb: Long,
        val freeStorageMb: Long,
        val lowRamDevice: Boolean,
    )

    // LiteRT-LM AAR'ının içindeki jni/ dizinleri. Listeyi elle sabitlemek
    // yerine doğrulanmış gerçeğe dayanıyoruz: aar'da yalnız bu iki ABI var.
    private val SUPPORTED_ABIS = setOf("arm64-v8a", "x86_64")

    // LiteRT-LM AAR manifesti minSdkVersion=24 ilan ediyor; uygulamanın kendi
    // minSdk'i de 24. Yine de açıkça kontrol ediyoruz ki ileride uygulamanın
    // tabanı düşerse yerel AI sessizce çökmesin.
    private const val MIN_SDK = 24

    fun primaryAbi(): String = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()

    private fun memoryInfo(context: Context): ActivityManager.MemoryInfo {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return ActivityManager.MemoryInfo().also { manager.getMemoryInfo(it) }
    }

    /** Cihazın toplam RAM'i (MB). Model seçimi buna göre yapılır. */
    fun totalRamMb(context: Context): Long = memoryInfo(context).totalMem / (1024 * 1024)

    fun isLowRamDevice(context: Context): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return manager.isLowRamDevice
    }

    fun freeStorageBytes(context: Context): Long {
        // Modelin yazılacağı GERÇEK dizinin bulunduğu birim ölçülür; sistem
        // bölümünün boş alanı burada anlamsızdır.
        val stat = StatFs(LocalAiModelStore.modelsDir(context).absolutePath)
        return stat.availableBytes
    }

    /**
     * @param model Hedeflenen model; verilirse boyut/RAM eşikleri ona göre
     *   değerlendirilir. Verilmezse yalnız platform uygunluğu bakılır.
     */
    fun evaluate(context: Context, model: LocalAiModelCatalog.Entry?): Report {
        val abi = primaryAbi()
        val memory = memoryInfo(context)
        val totalRamMb = memory.totalMem / (1024 * 1024)
        val availableRamMb = memory.availMem / (1024 * 1024)
        val freeStorageMb = freeStorageBytes(context) / (1024 * 1024)
        val lowRam = isLowRamDevice(context)

        fun report(state: State, supported: Boolean, reason: String?) = Report(
            state = state,
            supported = supported,
            reason = reason,
            abi = abi,
            sdkInt = Build.VERSION.SDK_INT,
            totalRamMb = totalRamMb,
            availableRamMb = availableRamMb,
            freeStorageMb = freeStorageMb,
            lowRamDevice = lowRam,
        )

        if (Build.VERSION.SDK_INT < MIN_SDK) {
            return report(State.UNSUPPORTED_PLATFORM, false, "android_too_old")
        }
        if (Build.SUPPORTED_ABIS.none { it in SUPPORTED_ABIS }) {
            // 32-bit ARM: LiteRT-LM native kitaplığı yok.
            return report(State.UNSUPPORTED_PLATFORM, false, "unsupported_abi")
        }
        if (lowRam) {
            // Android'in kendi "düşük bellekli cihaz" bayrağı; bu cihazlarda
            // birkaç yüz MB'lık bir modeli bile yerleşik tutmak riskli.
            return report(State.LOW_MEMORY, false, "low_ram_device")
        }
        if (model == null) {
            return report(State.MODEL_NOT_INSTALLED, true, null)
        }
        if (totalRamMb < model.minTotalRamMb) {
            return report(State.LOW_MEMORY, false, "insufficient_total_ram")
        }
        val installed = LocalAiModelStore.isInstalled(context, model)
        if (!installed) {
            // İndirme için model boyutu + %5 pay gerekir; tam sınırda indirme
            // bitip doğrulama için yer kalmaması kötü bir kullanıcı deneyimi.
            val requiredMb = (model.sizeBytes * 1.05).toLong() / (1024 * 1024)
            if (freeStorageMb < requiredMb) {
                return report(State.INSUFFICIENT_STORAGE, false, "insufficient_storage")
            }
            return report(State.MODEL_NOT_INSTALLED, true, null)
        }
        return report(State.MODEL_READY, true, null)
    }
}
