package com.hedefit.app.localai

import android.content.Context
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Model dosyalarının indirilmesi, doğrulanması ve saklanması.
 *
 * GÜVENLİK KURALLARI (bkz. docs/LOCAL_AI_PHASE2.md > Güvenlik):
 *
 *  1. JavaScript'ten URL ALINMAZ. İndirilecek adres yalnızca
 *     LocalAiModelCatalog içindeki sabit listeden gelir; WebView'a keyfi
 *     indirme yaptırma imkânı yoktur.
 *  2. Dosyalar uygulamanın KENDİ özel dizinindedir (`filesDir`), dünyaya
 *     okunur bir paylaşımlı dizinde değil.
 *  3. Yarım inen dosya ASLA "hazır" sayılmaz: indirme `.part` uzantısıyla
 *     yapılır, SHA-256 doğrulandıktan SONRA atomik olarak yerine taşınır.
 *  4. Beklenen boyut ve SHA-256 uyuşmazsa dosya silinir.
 */
object LocalAiModelStore {

    private const val DIR_NAME = "hedefit-local-ai"
    private const val BUFFER = 1 shl 16

    fun modelsDir(context: Context): File =
        File(context.filesDir, DIR_NAME).also { if (!it.exists()) it.mkdirs() }

    fun modelFile(context: Context, model: LocalAiModelCatalog.Entry): File =
        File(modelsDir(context), model.fileName)

    private fun partFile(context: Context, model: LocalAiModelCatalog.Entry): File =
        File(modelsDir(context), "${model.fileName}.part")

    /**
     * Kurulu sayılmanın koşulu: dosya var VE boyutu beklenen boyuta eşit.
     *
     * Her çağrıda SHA-256 hesaplamıyoruz — 500 MB–2,6 GB'lık bir dosyayı her
     * durum sorgusunda okumak saniyeler sürerdi. Özet, indirme bittiğinde bir
     * kez doğrulanır; bundan sonra dosya uygulamanın özel dizinindedir ve
     * başka bir uygulama değiştiremez.
     */
    fun isInstalled(context: Context, model: LocalAiModelCatalog.Entry): Boolean {
        val file = modelFile(context, model)
        return file.isFile && file.length() == model.sizeBytes
    }

    fun installedBytes(context: Context, model: LocalAiModelCatalog.Entry): Long {
        val file = modelFile(context, model)
        return if (file.isFile) file.length() else 0L
    }

    data class IntegrityResult(
        val valid: Boolean,
        val sizeBytes: Long,
        val sha256: String?,
    )

    /**
     * Kurulu dosyayı yeniden okuyarak boyutunu ve SHA-256 özetini doğrular.
     *
     * Bu pahalı işlem normal durum sorgusunda yapılmaz; gerçek cihaz
     * karşılaştırması ve açık kullanıcı doğrulaması için ayrı tutulur.
     */
    fun verifyIntegrity(context: Context, model: LocalAiModelCatalog.Entry): IntegrityResult {
        val file = modelFile(context, model)
        if (!file.isFile) return IntegrityResult(false, 0L, null)
        val size = file.length()
        if (size != model.sizeBytes) return IntegrityResult(false, size, null)

        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(BUFFER)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        val actual = digest.digest().joinToString("") { "%02x".format(it) }
        return IntegrityResult(
            valid = actual.equals(model.sha256, ignoreCase = true),
            sizeBytes = size,
            sha256 = actual,
        )
    }

    fun delete(context: Context, model: LocalAiModelCatalog.Entry): Boolean {
        partFile(context, model).delete()
        val file = modelFile(context, model)
        return if (file.exists()) file.delete() else true
    }

    class DownloadCancelledException : IOException("download cancelled")
    class IntegrityException(message: String) : IOException(message)

    /**
     * Modeli indirir.
     *
     * @param onProgress indirilen/toplam bayt. Çağıran taraf bunu kısıtlar
     *   (her bayt için köprüden olay göndermek arayüzü kilitler).
     * @param cancelled İptal bayrağı; kullanıcı vazgeçerse indirme bırakılır
     *   ve yarım dosya silinir.
     */
    fun download(
        context: Context,
        model: LocalAiModelCatalog.Entry,
        cancelled: AtomicBoolean,
        onProgress: (downloaded: Long, total: Long) -> Unit,
    ) {
        val target = modelFile(context, model)
        if (isInstalled(context, model)) return

        val free = LocalAiCapability.freeStorageBytes(context)
        if (free < model.sizeBytes) {
            throw IOException("insufficient_storage")
        }

        val part = partFile(context, model)
        // Her indirme baştan başlar. Sunucu tarafı Range desteğine güvenip
        // yarım dosyanın üstüne yazmak, kaynak değiştiyse sessizce BOZUK bir
        // dosya üretir; bütünlük doğrulaması bunu yakalar ama boşuna
        // gigabaytlarca indirme yapılmış olurdu.
        if (part.exists()) part.delete()

        val connection = (URL(model.downloadUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 30_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            requestMethod = "GET"
        }

        try {
            val status = connection.responseCode
            if (status !in 200..299) throw IOException("http_$status")

            val digest = MessageDigest.getInstance("SHA-256")
            var downloaded = 0L
            var lastReported = 0L

            connection.inputStream.use { input ->
                part.outputStream().use { output ->
                    val buffer = ByteArray(BUFFER)
                    while (true) {
                        if (cancelled.get()) throw DownloadCancelledException()
                        val read = input.read(buffer)
                        if (read <= 0) break
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        downloaded += read
                        // İlerleme en fazla ~%0,5'te bir bildirilir.
                        if (downloaded - lastReported >= model.sizeBytes / 200 + 1) {
                            lastReported = downloaded
                            onProgress(downloaded, model.sizeBytes)
                        }
                    }
                }
            }
            onProgress(downloaded, model.sizeBytes)

            if (downloaded != model.sizeBytes) {
                throw IntegrityException("size_mismatch")
            }
            val actual = digest.digest().joinToString("") { "%02x".format(it) }
            if (!actual.equals(model.sha256, ignoreCase = true)) {
                throw IntegrityException("checksum_mismatch")
            }

            // Atomik son adım: doğrulanmış dosya yerine taşınır. Bu satırdan
            // önce hiçbir noktada `isInstalled` true dönmez.
            if (target.exists()) target.delete()
            if (!part.renameTo(target)) throw IOException("finalize_failed")
        } catch (error: Throwable) {
            part.delete()
            throw error
        } finally {
            connection.disconnect()
        }
    }
}
