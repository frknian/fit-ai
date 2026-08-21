#!/usr/bin/env node
// Hedefit yerel AI karşılaştırma koşucusu.
//
// Cihaz modu, hata ayıklama APK'sındaki gerçek Capacitor köprüsüne Chrome
// DevTools Protocol üzerinden bağlanır. Böylece model indirme, bütünlük
// doğrulama, yükleme ve üretim uygulamanın üretimde kullandığı AYNI native
// eklenti/model deposu üzerinden yapılır; ayrı bir örnek motor kullanılmaz.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { evaluateResponse, summarize } from "../lib/ai/benchmark.ts";
import { isTurkishOutputUsable } from "../lib/ai/turkish.ts";
import { evaluateSafety } from "../lib/ai/safety.ts";
import { buildCoachSystemPrompt } from "../lib/ai/prompts.ts";

const run = promisify(execFile);
const DATASET = new URL("../tests/fixtures/ai/hedefit-local-benchmark.json", import.meta.url);
const RESULTS_DIR = new URL("../.benchmark/", import.meta.url);
const APP_ID = "com.hedefit.app";
const argv = process.argv.slice(2);
const args = new Set(argv);
const option = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const modelArg = option("--model");
const instrumentationResultArg = option("--import-instrumentation");
const normalRuns = Math.max(10, Number.parseInt(option("--normal-runs") || "10", 10) || 10);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function adb(...params) {
  const { stdout } = await run("adb", params, { maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim();
}

async function authorizedDeviceCount() {
  try {
    const out = await adb("devices");
    return out.split("\n").slice(1)
      .map((line) => line.trim()).filter(Boolean)
      .filter((line) => line.split(/\s+/)[1] === "device").length;
  } catch {
    return 0;
  }
}

function meminfoValue(text, name) {
  const match = text.match(new RegExp(`^${name}:\\s+(\\d+)\\s+kB`, "mi"));
  return match ? Math.round(Number(match[1]) / 1024) : null;
}

async function deviceInfo() {
  const get = async (prop) => {
    try { return await adb("shell", "getprop", prop); } catch { return "?"; }
  };
  const [manufacturer, model, androidRelease, sdkInt, abi, meminfo] = await Promise.all([
    get("ro.product.manufacturer"),
    get("ro.product.model"),
    get("ro.build.version.release"),
    get("ro.build.version.sdk"),
    get("ro.product.cpu.abi"),
    adb("shell", "cat", "/proc/meminfo").catch(() => ""),
  ]);
  return {
    manufacturer,
    model,
    androidRelease,
    sdkInt: Number.parseInt(sdkInt, 10) || null,
    abi,
    memory: {
      totalMb: meminfoValue(meminfo, "MemTotal"),
      availableMb: meminfoValue(meminfo, "MemAvailable"),
      swapTotalMb: meminfoValue(meminfo, "SwapTotal"),
    },
  };
}

function parseProcessPssMb(text) {
  const summary = text.match(/TOTAL PSS:\s+(\d+)/i);
  if (summary) return Number((Number(summary[1]) / 1024).toFixed(1));
  const table = text.match(/^\s*TOTAL\s+(\d+)\s+/mi);
  return table ? Number((Number(table[1]) / 1024).toFixed(1)) : null;
}

async function runtimeSnapshot() {
  const [meminfo, processMem, thermal, battery] = await Promise.all([
    adb("shell", "cat", "/proc/meminfo").catch(() => ""),
    adb("shell", "dumpsys", "meminfo", APP_ID).catch(() => ""),
    adb("shell", "dumpsys", "thermalservice").catch(() => ""),
    adb("shell", "dumpsys", "battery").catch(() => ""),
  ]);
  const thermalStatus = thermal.match(/Thermal Status:\s*(\d+)/i);
  const batteryTemperature = battery.match(/temperature:\s*(\d+)/i);
  return {
    availableRamMb: meminfoValue(meminfo, "MemAvailable"),
    processPssMb: parseProcessPssMb(processMem),
    thermalStatus: thermalStatus ? Number(thermalStatus[1]) : null,
    batteryTemperatureC: batteryTemperature ? Number((Number(batteryTemperature[1]) / 10).toFixed(1)) : null,
  };
}

async function appProcessId() {
  const value = await adb("shell", "pidof", APP_ID).catch(() => "");
  return value.split(/\s+/).find((part) => /^\d+$/.test(part)) || null;
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("webview_disconnected"));
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("webview_connection_failed")), { once: true });
    });
    return new CdpSession(socket);
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      const description = response.exceptionDetails.exception?.description || response.exceptionDetails.text || "browser_evaluation_failed";
      throw new Error(description);
    }
    return response.result?.value;
  }

  async plugin(method, options = {}) {
    const safeMethod = JSON.stringify(method);
    const safeOptions = JSON.stringify(options);
    return this.evaluate(`(async () => {
      const plugin = globalThis.Capacitor?.Plugins?.HedefitLocalAI ?? globalThis.HedefitLocalAI;
      const method = ${safeMethod};
      if (!plugin || typeof plugin[method] !== "function") throw new Error("native_bridge_unavailable:" + method);
      return await plugin[method](${safeOptions});
    })()`);
  }

  close() { this.socket.close(); }
}

async function connectToApp() {
  await adb("shell", "am", "start", "-n", `${APP_ID}/.MainActivity`);
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(1_000);
    const pid = await appProcessId();
    if (!pid) continue;
    let port;
    try {
      port = await adb("forward", "tcp:0", `localabstract:webview_devtools_remote_${pid}`);
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
      if (!page) throw new Error("webview_page_not_found");
      const wsUrl = new URL(page.webSocketDebuggerUrl);
      wsUrl.hostname = "127.0.0.1";
      wsUrl.port = String(port);
      const session = await CdpSession.connect(wsUrl.toString());
      await session.call("Runtime.enable");
      const models = await session.plugin("listModels");
      if (!Array.isArray(models?.models)) throw new Error("native_bridge_invalid_response");
      return { session, port };
    } catch (error) {
      lastError = error;
      if (port) await adb("forward", "--remove", `tcp:${port}`).catch(() => {});
    }
  }
  throw new Error(`native_bridge_unavailable:${lastError?.message || "webview_not_ready"}`);
}

function buildPrompt(scenario) {
  return buildCoachSystemPrompt({
    locale: "tr",
    factsJson: JSON.stringify(scenario.facts ?? {}),
    memoryLines: (scenario.memories ?? []).map((memory) => `${memory.type}/${memory.key}: ${memory.value}`),
    knowledgeLines: [],
  });
}

function safetyResult(scenario, model, decision) {
  const passed = decision.blocked && decision.reason === scenario.checks.expectSafetyReason;
  return {
    id: scenario.id,
    group: scenario.group,
    provider: "deterministic-safety-router",
    model,
    text: decision.blocked ? decision.response : "",
    evaluation: {
      passed,
      failures: passed ? [] : [{ check: "expectSafetyBlock", detail: "beklenen güvenlik yönlendirmesi oluşmadı" }],
      softMisses: [],
      wordCount: decision.blocked ? decision.response.trim().split(/\s+/).length : 0,
    },
    safetyBlocked: Boolean(decision.blocked),
    safetyReason: decision.reason ?? null,
  };
}

function generationOptions(modelId, scenario) {
  return {
    modelId,
    systemPrompt: buildPrompt(scenario),
    userPrompt: scenario.question,
    maxOutputTokens: 320,
    temperature: 0.3,
    timeoutMs: 60_000,
    stream: false,
  };
}

async function runScenario(session, modelId, scenario) {
  const safety = evaluateSafety(scenario.question, "tr");
  if (scenario.checks?.expectSafetyBlock) return safetyResult(scenario, modelId, safety);

  try {
    const generated = await session.plugin("generate", generationOptions(modelId, scenario));
    return {
      id: scenario.id,
      group: scenario.group,
      provider: "on-device-litertlm",
      model: generated.modelId,
      text: generated.text,
      evaluation: evaluateResponse(generated.text, scenario.checks ?? {}, scenario.facts),
      latencyMs: generated.totalMs,
      ttftMs: generated.ttftMs,
      decodeTokensPerSecond: generated.decodeTokensPerSecond,
      prefillTokensPerSecond: generated.prefillTokensPerSecond,
      promptTokens: generated.promptTokens,
      outputTokens: generated.outputTokens,
      loadMs: generated.loadMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: scenario.id,
      group: scenario.group,
      provider: "on-device-litertlm",
      model: modelId,
      text: "",
      evaluation: { passed: false, failures: [{ check: "generation", detail: message }], softMisses: [], wordCount: 0 },
      error: /timeout/i.test(message) ? "timeout" : "generation_failed",
      processAliveAfterError: Boolean(await appProcessId()),
    };
  }
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

function thermalAssessment(stabilityRuns) {
  const rates = stabilityRuns.map((result) => result.decodeTokensPerSecond).filter(Number.isFinite);
  if (rates.length < 6) return { reliablyMeasured: false, obviousDegradation: null };
  const first = median(rates.slice(0, 3));
  const last = median(rates.slice(-3));
  const ratio = first ? Number((last / first).toFixed(3)) : null;
  const statuses = stabilityRuns.map((result) => result.runtime?.thermalStatus ?? result.memory?.thermalStatus).filter(Number.isFinite);
  return {
    reliablyMeasured: true,
    firstThreeMedianTokensPerSecond: first,
    lastThreeMedianTokensPerSecond: last,
    lastToFirstRatio: ratio,
    maximumThermalStatus: statuses.length ? Math.max(...statuses) : null,
    obviousDegradation: ratio != null ? ratio < 0.8 : null,
  };
}

async function prepareInstrumentationInput(dataset) {
  const prepared = {
    version: dataset.version,
    scenarios: dataset.scenarios.map((scenario) => {
      const safety = evaluateSafety(scenario.question, "tr");
      return {
        ...scenario,
        systemPrompt: buildPrompt(scenario),
        safetyBlocked: Boolean(safety.blocked),
        safetyReason: safety.reason ?? null,
        safetyResponse: safety.blocked ? safety.response : null,
      };
    }),
  };
  await mkdir(RESULTS_DIR, { recursive: true });
  const target = new URL("hedefit-benchmark-input.json", RESULTS_DIR);
  await writeFile(target, JSON.stringify(prepared));
  console.log("Instrumentation girdisi: .benchmark/hedefit-benchmark-input.json");
}

async function importInstrumentationResult(dataset, sourcePath) {
  const raw = JSON.parse(await readFile(sourcePath, "utf8"));
  const scenarios = new Map(dataset.scenarios.map((scenario) => [scenario.id, scenario]));
  const results = raw.results.map((result) => {
    const scenario = scenarios.get(result.id);
    if (!scenario) throw new Error(`unknown_result_scenario:${result.id}`);
    const evaluation = scenario.checks?.expectSafetyBlock
      ? {
          passed: Boolean(result.safetyBlocked) && result.safetyReason === scenario.checks.expectSafetyReason,
          failures: [], softMisses: [],
          wordCount: result.text.trim().split(/\s+/).filter(Boolean).length,
        }
      : evaluateResponse(result.text, scenario.checks ?? {}, scenario.facts);
    if (!evaluation.passed && !evaluation.failures.length) {
      evaluation.failures.push({ check: "expectSafetyBlock", detail: "beklenen güvenlik yönlendirmesi oluşmadı" });
    }
    return {
      ...result,
      latencyMs: result.totalMs,
      evaluation,
    };
  });
  const stabilityRuns = raw.stabilityRuns.map((result) => ({ ...result, latencyMs: result.totalMs }));
  const errors = [...results, ...stabilityRuns].filter((result) => result.error);
  const report = {
    capturedAt: new Date(raw.capturedAtEpochMs).toISOString(),
    complete: Boolean(raw.complete),
    activeStage: raw.activeStage,
    device: raw.device,
    model: { ...raw.model, integrity: raw.integrity, download: raw.download },
    nativePlugin: { loaded: true, runtime: raw.runtime?.name ?? "LiteRT-LM", backend: raw.runtime?.backend ?? "CPU", capabilities: raw.capability },
    load: { loadMs: raw.loadMs, before: raw.memoryBeforeLoad, after: raw.memoryAfterLoad },
    summary: summarize(raw.model.id, results),
    results,
    stability: {
      requestedRuns: normalRuns,
      completedRuns: stabilityRuns.length,
      failures: stabilityRuns.filter((result) => result.error).length,
      runs: stabilityRuns,
    },
    reliability: {
      generationsAttempted: results.filter((result) => result.provider === "on-device-litertlm").length + stabilityRuns.length,
      failures: errors.length,
      timeouts: errors.filter((result) => result.error === "timeout").length,
      crashes: raw.complete ? 0 : 1,
    },
    memory: { beforeLoad: raw.memoryBeforeLoad, afterLoad: raw.memoryAfterLoad, final: raw.memoryFinal },
    thermal: thermalAssessment(stabilityRuns),
  };
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(new URL(`${raw.model.id}.json`, RESULTS_DIR), JSON.stringify(report, null, 2));
  await writeFile(new URL("local-ai-results.json", RESULTS_DIR), JSON.stringify(report, null, 2));
  console.log(`Instrumentation sonucu içe aktarıldı: .benchmark/${raw.model.id}.json`);
}

async function runDeviceBenchmark(dataset, info) {
  if (!modelArg) throw new Error("--device için --model zorunlu");
  const { session, port } = await connectToApp();
  try {
    const catalog = await session.plugin("listModels");
    const model = catalog.models.find((entry) => entry.id === modelArg);
    if (!model) throw new Error(`unknown_model:${modelArg}`);

    const capabilities = await session.plugin("getCapabilities", { modelId: modelArg });
    console.log(`Native köprü: yüklendi · durum ${capabilities.state} · RAM ${capabilities.totalRamMb ?? "?"} MB`);
    if (!capabilities.supported && !["LOCAL_MODEL_NOT_DOWNLOADED", "MODEL_NOT_INSTALLED"].includes(capabilities.state)) {
      throw new Error(`model_not_supported:${capabilities.reason || capabilities.state}`);
    }

    const statusBefore = await session.plugin("getModelStatus", { modelId: modelArg });
    if (!statusBefore.installed) {
      console.log(`Model indiriliyor: ${modelArg} (${(model.sizeBytes / 1_000_000_000).toFixed(2)} GB)`);
      await session.plugin("downloadModel", { modelId: modelArg });
      console.log("Model indirme tamamlandı; native SHA-256 doğrulaması geçti.");
    } else {
      console.log("Model daha önce kurulmuş; tam SHA-256 yeniden doğrulanıyor.");
    }

    const integrityStarted = Date.now();
    const integrity = await session.plugin("verifyModelIntegrity", { modelId: modelArg });
    const integrityMs = Date.now() - integrityStarted;
    if (!integrity.valid || integrity.sizeBytes !== model.sizeBytes) throw new Error("model_integrity_failed");
    console.log(`Bütünlük: geçti (${integrityMs} ms)`);

    await session.plugin("unloadModel");
    const beforeLoad = await runtimeSnapshot();
    const loaded = await session.plugin("loadModel", { modelId: modelArg, timeoutMs: 180_000 });
    const afterLoad = await runtimeSnapshot();
    console.log(`Model yüklendi: ${loaded.loadMs} ms · süreç PSS ${afterLoad.processPssMb ?? "?"} MB`);

    const results = [];
    for (const [index, scenario] of dataset.scenarios.entries()) {
      const result = await runScenario(session, modelArg, scenario);
      results.push(result);
      const state = result.error ? result.error : result.evaluation.passed ? "geçti" : "kaldı";
      console.log(`[${index + 1}/${dataset.scenarios.length}] ${scenario.id}: ${state}`);
      if (!await appProcessId()) throw new Error(`app_crashed_after:${scenario.id}`);
    }

    const stabilityScenario = dataset.scenarios.find((scenario) => scenario.id === "coach-01");
    const stabilityRuns = [];
    console.log(`${normalRuns} ardışık normal koçluk üretimi başlıyor.`);
    for (let index = 0; index < normalRuns; index += 1) {
      const result = await runScenario(session, modelArg, stabilityScenario);
      const runtime = await runtimeSnapshot();
      stabilityRuns.push({ ...result, sequence: index + 1, runtime });
      console.log(`[normal ${index + 1}/${normalRuns}] ${result.error || `${result.decodeTokensPerSecond?.toFixed?.(2) ?? "?"} tok/sn`}`);
      if (!await appProcessId()) throw new Error(`app_crashed_during_stability_run:${index + 1}`);
    }

    const finalRuntime = await runtimeSnapshot();
    const summary = summarize(modelArg, results);
    const errors = [...results, ...stabilityRuns].filter((result) => result.error);
    const report = {
      capturedAt: new Date().toISOString(),
      device: info,
      model: {
        id: modelArg,
        displayName: model.displayName,
        sizeBytes: model.sizeBytes,
        downloadedDuringRun: !statusBefore.installed,
        integrity: { valid: integrity.valid, sizeBytes: integrity.sizeBytes, sha256: integrity.sha256, verificationMs: integrityMs },
      },
      nativePlugin: { loaded: true, runtime: "LiteRT-LM", backend: "CPU", capabilities },
      load: { loadMs: loaded.loadMs, before: beforeLoad, after: afterLoad },
      summary,
      results,
      stability: {
        requestedRuns: normalRuns,
        completedRuns: stabilityRuns.length,
        failures: stabilityRuns.filter((result) => result.error).length,
        runs: stabilityRuns,
      },
      reliability: {
        generationsAttempted: results.filter((result) => result.provider === "on-device-litertlm").length + stabilityRuns.length,
        failures: errors.length,
        timeouts: errors.filter((result) => result.error === "timeout").length,
        crashes: errors.filter((result) => result.processAliveAfterError === false).length,
      },
      memory: { beforeLoad, afterLoad, final: finalRuntime },
      thermal: thermalAssessment(stabilityRuns),
    };

    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(new URL(`${modelArg}.json`, RESULTS_DIR), JSON.stringify(report, null, 2));
    await writeFile(new URL("local-ai-results.json", RESULTS_DIR), JSON.stringify(report, null, 2));
    console.log(`Sonuçlar: .benchmark/${modelArg}.json`);
    return report;
  } finally {
    session.close();
    await adb("forward", "--remove", `tcp:${port}`).catch(() => {});
  }
}

async function main() {
  const dataset = JSON.parse(await readFile(DATASET, "utf8"));
  const scenarios = dataset.scenarios;
  console.log(`Hedefit yerel AI karşılaştırması — ${scenarios.length} senaryo, ${Object.keys(dataset.groups).length} grup`);

  let safetyChecked = 0;
  let safetyFailed = 0;
  for (const scenario of scenarios) {
    const decision = evaluateSafety(scenario.question, "tr");
    const expected = Boolean(scenario.checks?.expectSafetyBlock);
    if (expected) {
      safetyChecked += 1;
      if (!decision.blocked || decision.reason !== scenario.checks.expectSafetyReason) safetyFailed += 1;
    } else if (decision.blocked) safetyFailed += 1;
  }
  console.log(`Güvenlik yönlendirmesi: ${safetyChecked} engellenmeli senaryo, ${safetyFailed} hata`);

  const { LOCAL_PROMPT_CHAR_BUDGET } = await import("../lib/ai/local-policy.ts");
  const oversized = scenarios.filter((scenario) => buildPrompt(scenario).length > LOCAL_PROMPT_CHAR_BUDGET);
  console.log(`İstem bütçesi: ${oversized.length} senaryo ${LOCAL_PROMPT_CHAR_BUDGET} karakteri aşıyor`);

  // Türkçe ses dizimi denetiminin GERÇEKTEN çalıştığını her koşumdan önce
  // doğrula. Bu denetim bozulursa (ör. bir düzenli ifade hatası) benchmark
  // sessizce eski, iyimser skorları üretmeye döner — hatanın ilk çıktığı
  // durum tam olarak buydu: "yümç" mustBeTurkish'ten geçiyordu.
  const turkishSelfTest = [
    ["Bugün yümç ve kşrt yapman iyi olur.", false],
    ["Bugün 30 dakikalık tempolu bir yürüyüş veya yüzme iyi bir seçim olur.", true],
    ["İmkânsız değil; orkestra provası gibi düzenli çalışırsan stres de azalır.", true],
  ];
  const turkishFailures = turkishSelfTest.filter(([sample, expected]) => isTurkishOutputUsable(sample) !== expected);
  console.log(`Türkçe biçim denetimi: ${turkishSelfTest.length} örnek, ${turkishFailures.length} hata`);

  if (args.has("--check")) process.exit(safetyFailed || oversized.length || turkishFailures.length ? 1 : 0);
  if (args.has("--prepare-instrumentation")) {
    await prepareInstrumentationInput(dataset);
    return;
  }
  if (instrumentationResultArg) {
    await importInstrumentationResult(dataset, instrumentationResultArg);
    return;
  }
  if (!args.has("--device")) throw new Error("Cihaz ölçümü için --device kullanın; yalnız veri kümesi için --check kullanın.");

  const count = await authorizedDeviceCount();
  if (count !== 1) {
    console.log("");
    console.log("PHYSICAL_DEVICE_BENCHMARK_BLOCKED");
    console.log(count === 0 ? "Bağlı ve yetkilendirilmiş Android cihaz yok." : "Birden fazla cihaz bağlı; hedef belirsiz.");
    process.exit(2);
  }

  const info = await deviceInfo();
  console.log(`Cihaz: ${info.manufacturer} ${info.model} · Android ${info.androidRelease} (SDK ${info.sdkInt}) · ${info.abi}`);
  console.log(`Bellek: toplam ${info.memory.totalMb ?? "?"} MB · kullanılabilir ${info.memory.availableMb ?? "?"} MB · swap ${info.memory.swapTotalMb ?? "?"} MB`);
  await runDeviceBenchmark(dataset, info);
}

main().catch((error) => {
  console.error("karşılaştırma başarısız:", error?.message ?? error);
  process.exit(1);
});
