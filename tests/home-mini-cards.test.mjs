import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [app, hydration, sleepCard] = await Promise.all([
  readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/HydrationFasting.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/SleepSummaryCard.tsx", import.meta.url), "utf8"),
]);

test("su ve uyku ana ekranda mini kart olarak durur", () => {
  // Tam deneyimleri kendi sekmelerinde kalır (Beslenme, Aktivite); ana ekranda
  // yalnız özet görünür (bkz. docs/MOBIL_TASARIM_PLANI.md 3.3).
  assert.match(app, /<HydrationFasting compact userId=\{authUser\?\.id\} weightKg=\{Number\(weight\) \|\| null\} onOpen=\{\(\) => setActiveView\("nutrition"\)\}/);
  assert.match(app, /<SleepSummaryCard userId=\{authUser\.id\} onOpen=\{\(\) => setActiveView\("activity"\)\}/);
});

test("mini kartlar veri girmez, yalnız gezinir", () => {
  // Ana ekranda yanlışlıkla su eklemek ya da uyku kaydetmek istemiyoruz;
  // dokunmak yalnız ilgili sekmeyi açar.
  assert.match(hydration, /if \(compact\) \{/);
  assert.doesNotMatch(hydration.slice(hydration.indexOf("if (compact) {"), hydration.indexOf("if (compact) {") + 400), /changeWater|toggleFast/);
  assert.match(hydration, /className="hydration-mini" onClick=\{onOpen\}/);
  assert.match(sleepCard, /className="sleep-mini" onClick=\{onOpen\}/);
});

test("uyku mini kartı yüklenene kadar ya da kayıt yoksa hiç çizilmez", () => {
  // Tablo kurulmamışsa (migration çalıştırılmadıysa) sessizce kaybolur;
  // ana ekranın geri kalanı etkilenmez.
  assert.match(sleepCard, /if \(!loaded \|\| !summary\.nights\) return null;/);
});

test("su mini kartı tablo eksikken de sessizce kaybolur", () => {
  assert.match(hydration, /return compact \? null : <section className="hydration-card"/);
});
