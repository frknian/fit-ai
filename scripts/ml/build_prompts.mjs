#!/usr/bin/env node
// Senaryolara Hedefit'in GERÇEK sistem istemini ekler.
//
// İstem metnini Python tarafında yeniden yazmak ikinci bir gerçek kaynağı
// yaratırdı: uygulama promptu değiştiğinde eğitim verisi sessizce eskimiş
// olurdu. Bu yüzden lib/ai/prompts.ts doğrudan kullanılır.
import { readFile, writeFile } from "node:fs/promises";
import { buildCoachSystemPrompt } from "../../lib/ai/prompts.ts";
import { evaluateSafety } from "../../lib/ai/safety.ts";

const [inPath, outPath] = process.argv.slice(2);
const scenarios = JSON.parse(await readFile(inPath, "utf8"));

let blocked = 0;
const built = scenarios.flatMap((s) => {
  // Güvenlik katmanının engellediği bir senaryo modele hiç gitmez; eğitim
  // verisine de girmemeli (güvenlik davranışı katmanda, modelde değil).
  if (evaluateSafety(s.question, "tr").blocked) { blocked += 1; return []; }
  return [{
    ...s,
    systemPrompt: buildCoachSystemPrompt({
      locale: "tr",
      factsJson: JSON.stringify(s.facts),
      memoryLines: (s.memories ?? []).map((m) => `${m.type}/${m.key}: ${m.value}`),
      knowledgeLines: [],
    }),
  }];
});

await writeFile(outPath, JSON.stringify(built, null, 1));
console.log(`${built.length} istem yazıldı (güvenlik katmanınca elenen: ${blocked}) → ${outPath}`);
