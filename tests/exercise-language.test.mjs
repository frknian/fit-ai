import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Kullanıcının bildirdiği iki sorun:
//   1) Uygulama dili İngilizce yapıldığında bölge etiketleri, set/dinlenme
//      reçeteleri ve anlatımlar Türkçe kalıyordu. (Hareket ADLARI ise dilden
//      bağımsız: her zaman İngilizce gösterilir.)
//   2) Katalogda aynı hareket iki ayrı kayıt olarak duruyordu (ör. "Side
//      Plank" ve "Yan Plank"), bu yüzden aynı hareket bir plana iki kez
//      girebiliyordu.
const app = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");
const programs = await readFile(new URL("../components/TrainingPrograms.tsx", import.meta.url), "utf8");

const { movementArea, movementName, movementPrescription } = await import("../lib/workout-localization.ts");

/** Kaynaktaki katalog kayıtlarını (Türkçe ad, İngilizce ad) çıkarır. */
function catalogEntries() {
  const core = [...app.matchAll(/\{ name: "([^"]+)", english: "([^"]+)", area: "([^"]+)"/g)];
  const extra = [...app.matchAll(/\["([^"]+)", "([^"]+)", "([^"]+)", "(?:orange|blue|purple)"/g)];
  return [...core, ...extra].map((match) => ({ name: match[1], english: match[2], area: match[3] }));
}

function normalize(value) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

test("katalogda aynı hareket iki kez bulunmaz", () => {
  const entries = catalogEntries();
  assert.ok(entries.length > 100, "katalog okunamadı");
  for (const key of ["name", "english"]) {
    const seen = new Map();
    for (const entry of entries) {
      const normalized = normalize(entry[key]);
      assert.equal(seen.has(normalized), false, `tekrar eden hareket: ${entry.name} / ${entry.english}`);
      seen.set(normalized, entry);
    }
  }
});

test("hareket adları dil ayarından bağımsız olarak İngilizce gösterilir", () => {
  const item = { name: "Yan Plank", english: "Side Plank" };
  assert.equal(movementName(item), "Side Plank");
  // İngilizce karşılığı olmayan kayıt (ör. AI'ın ürettiği hareket) düşmez.
  assert.equal(movementName({ name: "Kettlebell Swing" }), "Kettlebell Swing");
});

test("bölge etiketleri çevrilir", () => {
  assert.equal(movementArea("Göğüs", "tr"), "Göğüs");
  assert.equal(movementArea("Göğüs", "en"), "Chest");
  assert.equal(movementArea("Esneklik", "en"), "Mobility");
  assert.equal(movementArea("", "en"), "");
});

test("set ve dinlenme reçetesi çevrilir", () => {
  assert.equal(movementPrescription("3 set · 10 tekrar", "tr"), "3 set · 10 tekrar");
  assert.equal(movementPrescription("3 set · 10 tekrar", "en"), "3 sets · 10 reps");
  assert.equal(movementPrescription("1 set · 1 tekrar", "en"), "1 set · 1 rep");
  assert.equal(movementPrescription("3 set · 30 sn", "en"), "3 sets · 30 s");
  assert.equal(movementPrescription("60 sn dinlenme", "en"), "60 s rest");
});

test("hareket kartları adı İngilizce, bölge ve reçeteyi dile göre çizer", () => {
  assert.match(app, /<strong>\{movementName\(item\)\}<\/strong><small>\{movementPrescription\(item\.sets, locale\)\}/);
  assert.match(app, /<h1>\{movementName\(currentWorkout\)\}<\/h1>/);
  assert.match(programs, /<small>\{movementArea\(item\.area, locale\)\} · \{movementPrescription\(item\.sets, locale\)\}/);
});

test("hareket kılavuzu ve anlatımı İngilizce kipte İngilizce gelir", () => {
  assert.match(app, /const motionGuidesEn: Record<MotionPattern/);
  assert.match(app, /if \(locale === "en"\) return motionGuidesEn\[pattern\]/);
  assert.match(app, /export function movementInstructions\(/);
  assert.match(app, /<li>\{movementInstructions\(currentWorkout, locale\)\}<\/li>/);
});
