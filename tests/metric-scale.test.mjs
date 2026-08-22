import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("kalan canlı sayaçlarda rakamlar tabular-nums kullanır", () => {
  // Rakamlar tasarım öğesidir: bir sayı güncellenirken (özellikle antrenman
  // oynatıcısının saniyelik geri sayımı) hane genişlikleri değişip metin
  // zıplamamalı (bkz. docs/MOBIL_TASARIM_PLANI.md 3.5).
  assert.match(css, /\.progress-cards strong,\s*\n\.timer-card strong,\s*\n\.activity-daily-summaries strong,\s*\n\.monthly-numbers strong \{\s*\n\s*font-variant-numeric: tabular-nums;/);
});

test("kullanılmayan .stats-row'a dokunulmadı", async () => {
  // Ölü CSS: hiçbir bileşen bu sınıfı render etmiyor; kapsam dışı bırakıldı.
  const app = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");
  assert.ok(!app.includes('className="stats-row"'));
});
