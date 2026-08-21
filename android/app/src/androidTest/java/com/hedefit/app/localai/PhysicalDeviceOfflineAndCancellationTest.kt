package com.hedefit.app.localai

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.ai.edge.litertlm.Content
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Physical-device proof for the two native properties that desktop router
 * tests cannot establish: inference while Android has no validated network,
 * and prompt cancellation actually stopping LiteRT-LM work.
 *
 * The host disables Wi-Fi and mobile data before launching this test. The
 * report deliberately contains no device identifier.
 */
@RunWith(AndroidJUnit4::class)
class PhysicalDeviceOfflineAndCancellationTest {

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context = instrumentation.targetContext
    private val arguments = InstrumentationRegistry.getArguments()

    private fun reportFile(modelId: String): File =
        File(requireNotNull(context.getExternalFilesDir(null)), "hedefit-offline-$modelId.json")

    private fun hasValidatedNetwork(): Boolean {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    @Test
    fun verifyOfflineGenerationAndCancellation() = runBlocking {
        val modelId = requireNotNull(arguments.getString("modelId")) { "modelId_required" }
        val model = requireNotNull(LocalAiModelCatalog.byId(modelId)) { "unknown_model" }
        check(LocalAiModelStore.verifyIntegrity(context, model).valid) { "model_integrity_failed" }
        check(!hasValidatedNetwork()) { "validated_network_still_available" }

        val input = JSONObject(File(context.filesDir, "hedefit-benchmark-input.json").readText())
        val allScenarios = input.getJSONArray("scenarios")
        val approvedIds = setOf("coach-01", "fact-01", "miss-01")
        val approved = (0 until allScenarios.length())
            .map(allScenarios::getJSONObject)
            .filter { it.getString("id") in approvedIds }

        val report = JSONObject().apply {
            put("modelId", modelId)
            put("validatedNetworkAvailable", false)
            put("runtime", "LiteRT-LM")
            put("backend", "CPU")
            put("responses", JSONArray())
        }

        val engine = LocalAiEngine()
        try {
            report.put("loadMs", engine.load(context, model))
            val responses = report.getJSONArray("responses")
            for (scenario in approved) {
                val started = SystemClock.elapsedRealtime()
                val text = StringBuilder()
                val completed = withTimeoutOrNull(60_000L) {
                    engine.generateStream(
                        model = model,
                        systemPrompt = scenario.getString("systemPrompt"),
                        userPrompt = scenario.getString("question"),
                        maxOutputTokens = 160,
                        temperature = 0.3,
                    ).collect { message ->
                        message.contents.contents.filterIsInstance<Content.Text>().forEach { text.append(it.text) }
                    }
                    true
                }
                responses.put(JSONObject().apply {
                    put("id", scenario.getString("id"))
                    put("completed", completed == true)
                    put("text", text.toString())
                    put("totalMs", SystemClock.elapsedRealtime() - started)
                    put("provider", "local")
                    put("nativeProvider", "on-device-litertlm")
                    put("fallbackUsed", false)
                })
                check(completed == true) { "offline_generation_timeout:${scenario.getString("id")}" }
                check(text.isNotBlank()) { "offline_generation_empty:${scenario.getString("id")}" }
            }

            val cancellationStarted = SystemClock.elapsedRealtime()
            val generation = async {
                runCatching {
                    engine.generateStream(
                        model = model,
                        systemPrompt = approved.first().getString("systemPrompt"),
                        userPrompt = "Bana ayrıntılı ve uzun bir haftalık antrenman planı yaz.",
                        maxOutputTokens = 320,
                        temperature = 0.3,
                    ).collect { }
                }
            }
            delay(1_500L)
            engine.cancel()
            val stopped = withTimeoutOrNull(10_000L) { generation.await(); true } == true
            report.put("cancellation", JSONObject().apply {
                put("stopped", stopped)
                put("stopLatencyMs", SystemClock.elapsedRealtime() - cancellationStarted - 1_500L)
                put("remoteFallbackAttempted", false)
            })
            check(stopped) { "cancellation_did_not_stop" }
        } finally {
            engine.release()
            reportFile(modelId).writeText(report.toString(2))
        }
    }
}
