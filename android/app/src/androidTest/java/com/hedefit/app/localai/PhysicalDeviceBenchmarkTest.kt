package com.hedefit.app.localai

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Uzun fiziksel cihaz karşılaştırmasını cihazın içinde çalıştırır.
 *
 * Bu bir alternatif çalışma zamanı değildir: üretim kodundaki katalog,
 * LocalAiModelStore ve LocalAiEngine doğrudan kullanılır. Ama USB/CDP bağlantısı
 * kesilse bile test cihazda sürer ve her senaryodan sonra dış dosyaya checkpoint
 * yazar. Girdi, repodaki 48 senaryodan host koşucusu tarafından hazırlanır.
 */
@RunWith(AndroidJUnit4::class)
class PhysicalDeviceBenchmarkTest {

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context = instrumentation.targetContext
    private val arguments = InstrumentationRegistry.getArguments()

    private fun memorySnapshot(): JSONObject {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memory = ActivityManager.MemoryInfo().also(activityManager::getMemoryInfo)
        val pssKb = activityManager.getProcessMemoryInfo(intArrayOf(Process.myPid())).firstOrNull()?.totalPss
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val temperatureTenths = battery?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
        return JSONObject().apply {
            put("availableRamMb", memory.availMem / (1024 * 1024))
            put("totalRamMb", memory.totalMem / (1024 * 1024))
            put("lowMemory", memory.lowMemory)
            put("processPssMb", pssKb?.div(1024.0))
            put("thermalStatus", if (Build.VERSION.SDK_INT >= 29) power.currentThermalStatus else JSONObject.NULL)
            put("batteryTemperatureC", if (temperatureTenths != null && temperatureTenths != Int.MIN_VALUE) temperatureTenths / 10.0 else JSONObject.NULL)
        }
    }

    private fun deviceInfo(): JSONObject = JSONObject().apply {
        put("manufacturer", Build.MANUFACTURER)
        put("model", Build.MODEL)
        put("androidRelease", Build.VERSION.RELEASE)
        put("sdkInt", Build.VERSION.SDK_INT)
        put("abi", Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown")
        put("memory", memorySnapshot())
    }

    private fun resultFile(modelId: String): File =
        File(requireNotNull(context.getExternalFilesDir(null)), "hedefit-benchmark-$modelId.json")

    private fun checkpoint(report: JSONObject, modelId: String) {
        val target = resultFile(modelId)
        val temporary = File(target.parentFile, "${target.name}.part")
        temporary.writeText(report.toString(2))
        if (target.exists()) target.delete()
        check(temporary.renameTo(target)) { "checkpoint_finalize_failed" }
    }

    private suspend fun generate(
        engine: LocalAiEngine,
        model: LocalAiModelCatalog.Entry,
        scenario: JSONObject,
    ): JSONObject {
        val started = SystemClock.elapsedRealtime()
        val text = StringBuilder()
        var firstTokenMs: Long? = null
        val completed = withTimeoutOrNull(60_000L) {
            engine.generateStream(
                model = model,
                systemPrompt = scenario.getString("systemPrompt"),
                userPrompt = scenario.getString("question"),
                maxOutputTokens = 320,
                temperature = 0.3,
            ).collect { message ->
                message.contents.contents
                    .filterIsInstance<com.google.ai.edge.litertlm.Content.Text>()
                    .forEach {
                        if (it.text.isNotEmpty() && firstTokenMs == null) {
                            firstTokenMs = SystemClock.elapsedRealtime() - started
                        }
                        text.append(it.text)
                    }
            }
            true
        }
        if (completed == null) engine.cancel()
        val info = engine.benchmarkInfo()
        return JSONObject().apply {
            put("id", scenario.getString("id"))
            put("group", scenario.getString("group"))
            put("provider", "on-device-litertlm")
            put("model", model.id)
            put("text", text.toString())
            put("totalMs", SystemClock.elapsedRealtime() - started)
            put("benchmarkAvailable", info != null)
            val nativeTtftMs = ((info?.timeToFirstTokenInSecond ?: 0.0) * 1000).toLong()
            put("ttftMs", if (nativeTtftMs > 0) nativeTtftMs else firstTokenMs ?: 0L)
            put("decodeTokensPerSecond", info?.lastDecodeTokensPerSecond ?: 0.0)
            put("prefillTokensPerSecond", info?.lastPrefillTokensPerSecond ?: 0.0)
            put("promptTokens", info?.lastPrefillTokenCount ?: 0)
            put("outputTokens", info?.lastDecodeTokenCount ?: 0)
            put("conversationTokenCount", engine.tokenCount())
            if (completed == null) put("error", "timeout")
        }
    }

    @Test
    fun runPhysicalDeviceBenchmark() = runBlocking {
        val modelId = requireNotNull(arguments.getString("modelId")) { "modelId_required" }
        val normalRuns = maxOf(10, arguments.getString("normalRuns")?.toIntOrNull() ?: 10)
        val model = requireNotNull(LocalAiModelCatalog.byId(modelId)) { "unknown_model" }
        val input = JSONObject(File(context.filesDir, "hedefit-benchmark-input.json").readText())
        val scenarios = input.getJSONArray("scenarios")
        val output = JSONObject().apply {
            put("capturedAtEpochMs", System.currentTimeMillis())
            put("complete", false)
            put("activeStage", "starting")
            put("device", deviceInfo())
            put("model", JSONObject().apply {
                put("id", model.id)
                put("displayName", model.displayName)
                put("sizeBytes", model.sizeBytes)
            })
            put("runtime", JSONObject().apply { put("name", "LiteRT-LM"); put("backend", "CPU") })
            put("results", JSONArray())
            put("stabilityRuns", JSONArray())
        }
        checkpoint(output, modelId)

        val capability = LocalAiCapability.evaluate(context, model)
        output.put("capability", JSONObject().apply {
            put("supported", capability.supported)
            put("state", capability.state.name)
            put("reason", capability.reason)
            put("totalRamMb", capability.totalRamMb)
            put("availableRamMb", capability.availableRamMb)
            put("freeStorageMb", capability.freeStorageMb)
        })
        check(capability.supported || capability.state == LocalAiCapability.State.MODEL_NOT_INSTALLED) {
            "model_not_supported:${capability.reason}"
        }

        val installedBefore = LocalAiModelStore.isInstalled(context, model)
        output.put("activeStage", "download")
        checkpoint(output, modelId)
        val downloadStarted = SystemClock.elapsedRealtime()
        if (!installedBefore) {
            LocalAiModelStore.download(context, model, AtomicBoolean(false)) { downloaded, total ->
                output.put("downloadProgress", JSONObject().apply { put("downloadedBytes", downloaded); put("totalBytes", total) })
                checkpoint(output, modelId)
            }
        }
        output.put("download", JSONObject().apply {
            put("downloadedDuringRun", !installedBefore)
            put("durationMs", SystemClock.elapsedRealtime() - downloadStarted)
        })

        output.put("activeStage", "integrity")
        checkpoint(output, modelId)
        val integrityStarted = SystemClock.elapsedRealtime()
        val integrity = LocalAiModelStore.verifyIntegrity(context, model)
        output.put("integrity", JSONObject().apply {
            put("valid", integrity.valid)
            put("sizeBytes", integrity.sizeBytes)
            put("sha256", integrity.sha256)
            put("verificationMs", SystemClock.elapsedRealtime() - integrityStarted)
        })
        check(integrity.valid) { "model_integrity_failed" }

        val engine = LocalAiEngine()
        try {
            output.put("activeStage", "load")
            output.put("memoryBeforeLoad", memorySnapshot())
            checkpoint(output, modelId)
            val loadMs = engine.load(context, model)
            output.put("loadMs", loadMs)
            output.put("memoryAfterLoad", memorySnapshot())
            checkpoint(output, modelId)

            val results = output.getJSONArray("results")
            for (index in 0 until scenarios.length()) {
                val scenario = scenarios.getJSONObject(index)
                output.put("activeStage", "scenario:${scenario.getString("id")}")
                checkpoint(output, modelId)
                if (scenario.optBoolean("safetyBlocked")) {
                    results.put(JSONObject().apply {
                        put("id", scenario.getString("id"))
                        put("group", scenario.getString("group"))
                        put("provider", "deterministic-safety-router")
                        put("model", model.id)
                        put("text", scenario.optString("safetyResponse"))
                        put("safetyBlocked", true)
                        put("safetyReason", scenario.optString("safetyReason"))
                    })
                } else {
                    results.put(generate(engine, model, scenario))
                }
                checkpoint(output, modelId)
            }

            val normalScenario = (0 until scenarios.length())
                .map { scenarios.getJSONObject(it) }
                .first { it.getString("id") == "coach-01" }
            val stability = output.getJSONArray("stabilityRuns")
            for (index in 0 until normalRuns) {
                output.put("activeStage", "stability:${index + 1}")
                checkpoint(output, modelId)
                stability.put(generate(engine, model, normalScenario).apply {
                    put("sequence", index + 1)
                    put("memory", memorySnapshot())
                })
                checkpoint(output, modelId)
            }

            output.put("memoryFinal", memorySnapshot())
            output.put("activeStage", "complete")
            output.put("complete", true)
            checkpoint(output, modelId)
        } finally {
            engine.release()
        }
    }
}
