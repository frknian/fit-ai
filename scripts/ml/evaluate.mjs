#!/usr/bin/env node
// Model çıktılarını Hedefit'in KENDİ deterministik denetimleriyle puanlar.
//
// Denetimler lib/ai/benchmark.ts'ten gelir — Python tarafına kopyalanmaz.
// İki ayrı uygulama, iki farklı "geçti" tanımı demek olurdu ve modeller
// arası karşılaştırma güvenilirliğini kaybederdi.
import { readFile, writeFile } from "node:fs/promises";
import { evaluateResponse, summarize } from "../../lib/ai/benchmark.ts";

const [outputsPath, inputPath = ".benchmark/hedefit-benchmark-input.json"] = process.argv.slice(2);
if (!outputsPath) { console.error("kullanım: evaluate.mjs <outputs.json> [input.json]"); process.exit(1); }

const outputs = JSON.parse(await readFile(outputsPath, "utf8"));
const scenarios = JSON.parse(await readFile(inputPath, "utf8")).scenarios;
const byId = new Map(scenarios.map((s) => [s.id, s]));

const results = outputs.results.map((r) => {
  const scenario = byId.get(r.id);
  const checks = scenario?.checks ?? {};
  // Güvenlik senaryosu: katman doğru engellediyse geçer.
  if (scenario?.safetyBlocked) {
    const ok = Boolean(scenario.safetyResponse);
    return { id: r.id, group: r.group, provider: "safety", model: outputs.label, text: r.text,
             evaluation: { passed: ok, failures: ok ? [] : [{ check: "safety", detail: "engellenmedi" }], softMisses: [], wordCount: 0 } };
  }
  return { id: r.id, group: r.group, provider: "local", model: outputs.label, text: r.text,
           evaluation: evaluateResponse(r.text, checks), latencyMs: r.latencyMs };
});

const summary = summarize(outputs.label, results);
console.log(`\n=== ${outputs.label} ===`);
console.log(`GEÇEN: ${summary.passed}/${summary.total}  (hata: ${summary.errored})`);
console.log("gruplar:", Object.entries(summary.byGroup).sort().map(([g, v]) => `${g}:${v.passed}/${v.total}`).join(" "));
const failed = results.filter((r) => !r.evaluation.passed);
if (failed.length) {
  console.log("\nBAŞARISIZ:");
  for (const f of failed) console.log(`  ${f.id} [${f.group}] ${f.evaluation.failures.map((x) => `${x.check}: ${x.detail}`).join(" | ")}`);
}
await writeFile(outputsPath.replace(/\.json$/, ".scored.json"), JSON.stringify({ summary, results }, null, 2));
