import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { HOUSEHOLD_PORTION_UNITS, PRIMARY_PORTION_UNITS, detectPieceCount, fromGrams, parseAmount, referenceGrams, toGrams } from "../lib/portion-unit.ts";

test("miktar ayrıştırma virgüllü ondalığı kabul eder", () => {
  assert.equal(parseAmount("1,5"), 1.5);
  assert.equal(parseAmount("200"), 200);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("0"), null);
  assert.equal(parseAmount("-3"), null);
  assert.equal(parseAmount("abc"), null);
});

test("gram birimi olduğu gibi kullanılır", () => {
  assert.equal(toGrams("250", "g", 1), 250);
  assert.equal(toGrams("250", "g", 60), 250, "gram modunda referans ağırlık yok sayılır");
});

test("porsiyon ve adet referans ağırlıkla çarpılır", () => {
  assert.equal(toGrams("2", "portion", 320), 640);
  assert.equal(toGrams("3", "piece", 60), 180);
  assert.equal(toGrams("1,5", "portion", 200), 300);
});

test("referans bilinmiyorsa gram üretilmez", () => {
  // Uydurma bir ağırlıkla devam etmek sessizce yanlış kalori kaydeder.
  assert.equal(toGrams("2", "portion", null), null);
  assert.equal(toGrams("2", "piece", 0), null);
});

test("adet sayısı yemek tarifinden okunur", () => {
  assert.equal(detectPieceCount("3 yumurta"), 3);
  assert.equal(detectPieceCount("2 dilim ekmek"), 2);
  assert.equal(detectPieceCount("1,5 kase çorba"), 1.5);
});

test("ölçü birimli ifadeler adet sayılmaz", () => {
  // "500 g tavuk" → 500 adet tavuk gibi saçma bir referans çıkarırdı.
  assert.equal(detectPieceCount("500 g tavuk"), null);
  assert.equal(detectPieceCount("250 ml süt"), null);
  assert.equal(detectPieceCount("tavuklu pilav"), null);
  assert.equal(detectPieceCount("100 gram yoğurt"), null);
});

test("porsiyon referansı standart porsiyon ağırlığından gelir", () => {
  // Yemek adı tabloda varsa standart kazanır: 1 porsiyon çorba, analiz
  // kutusunda ne yazdığından bağımsız olarak 250 g'dır.
  assert.equal(referenceGrams("portion", null, "mercimek çorbası"), 250);
  assert.equal(referenceGrams("portion", 100, "mercimek çorbası"), 250);
  assert.equal(referenceGrams("portion", null, "tavuklu pilav"), 150);
  assert.equal(referenceGrams("g", 320, "tavuklu pilav"), 1);
});

test("adet referansı standart adet ağırlığından gelir", () => {
  assert.equal(referenceGrams("piece", null, "yumurta"), 50);
  assert.equal(referenceGrams("piece", null, "3 yumurta"), 50);
  assert.equal(referenceGrams("piece", null, "elma"), 150);
  assert.equal(referenceGrams("piece", null, "2 dilim ekmek"), 25);
});

test("tabloda olmayan yemekte adet referansı analize düşer", () => {
  // "3 kumpir = 900 g" analiz edildiyse 1 adet 300 g'dır.
  assert.equal(referenceGrams("piece", 900, "3 kumpir"), 300);
  assert.equal(referenceGrams("piece", 900, "kumpir"), 900);
});

test("birim değişince miktar karşılığına çevrilir", () => {
  assert.equal(fromGrams(180, "g", 1), "180");
  assert.equal(fromGrams(180, "piece", 60), "3");
  assert.equal(fromGrams(640, "portion", 320), "2");
  assert.equal(fromGrams(300, "portion", 200), "1.5");
  assert.equal(fromGrams(180, "piece", null), "", "referanssız birim gösterilemez");
});

test("gidiş dönüş dönüşümü tutarlıdır", () => {
  for (const unit of ["portion", "piece"]) {
    assert.equal(toGrams(fromGrams(240, unit, 80), unit, 80), 240, unit);
  }
});

test("öğün alanları mobilde ızgarayı taşırmaz", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  // 1fr'in örtük alt sınırı auto'dur; uzun yemek adı sütunu kabın dışına
  // genişletip yatay kaydırma yaratıyordu. Tüm izler minmax(0,1fr) olmalı.
  const rules = [...css.matchAll(/\.manual-fields \{ grid-template-columns:([^;]+);/g)].map((m) => m[1]);
  assert.ok(rules.length >= 3, `beklenenden az kural: ${rules.length}`);
  for (const rule of rules) {
    // minmax(0,1fr) doğrudur; yalnız korumasız kalan 1fr izleri aranır.
    const bare = rule.replace(/minmax\([^)]*\)/g, "");
    assert.doesNotMatch(bare, /\b1fr/, `korumasız 1fr taşmaya yol açar: ${rule}`);
  }
  assert.match(css, /\.ai-estimate-card strong[^{]*\{[^}]*overflow-wrap:anywhere/);
});

test("ev ölçüleri sabit gram karşılığı taşır", async () => {
  const { referenceGrams, toGrams } = await import("../lib/portion-unit.ts");
  // Bir su bardağının hacmi yemekten yemeğe değişmez.
  assert.equal(referenceGrams("waterGlass", null), 200);
  assert.equal(referenceGrams("teaGlass", null), 110);
  assert.equal(referenceGrams("mug", null), 250);
  assert.equal(referenceGrams("plate", null), 350);
  assert.equal(referenceGrams("bowl", null), 250);
  assert.equal(referenceGrams("ml", null), 1);
  assert.equal(toGrams("2", "waterGlass", referenceGrams("waterGlass", null)), 400);
});

test("porsiyon ve adet artık tahmin istemez", async () => {
  const { referenceGrams, toGrams, DEFAULT_PORTION_GRAMS, DEFAULT_PIECE_GRAMS } = await import("../lib/portion-unit.ts");
  // Eskiden tahmin yokken null dönüyor ve arayüz birimi kilitliyordu.
  // Artık tabloda karşılığı olmayan yemekte bile genel bir karşılık verilir.
  assert.equal(referenceGrams("portion", null, "zerdeçallı kumpir"), DEFAULT_PORTION_GRAMS);
  assert.equal(referenceGrams("piece", null, "kumpir"), DEFAULT_PIECE_GRAMS);
  assert.equal(referenceGrams("portion", null, ""), DEFAULT_PORTION_GRAMS);
  assert.equal(toGrams("2", "portion", referenceGrams("portion", null, "çorba")), 500);
});

test("standart tablo Türkçe eklerle ve tamlamanın ana ismiyle eşleşir", async () => {
  const { standardPortionGrams, standardPieceGrams } = await import("../lib/portion-unit.ts");
  // Ekler sona geldiği için kelime başından eşleşmek yeterlidir.
  assert.equal(standardPortionGrams("çorbası"), 250);
  assert.equal(standardPortionGrams("yoğurt"), 200);
  // Türkçede ana isim sonda durur: mercimek çorbası bir çorbadır.
  assert.equal(standardPortionGrams("mercimek çorbası"), 250);
  assert.equal(standardPortionGrams("mercimek yemeği"), 200);
  // Kelime ortasında aranmaz; yoksa "omlet" içindeki "et" eşleşirdi.
  assert.equal(standardPortionGrams("omlet"), 150);
  // Ünsüz yumuşaması: kök "ekmek" ama yemek adı "ekmeği" diye yazılır.
  assert.equal(standardPortionGrams("tam buğday ekmeği"), 50);
  assert.equal(standardPortionGrams("somon balığı"), 150, "bal değil balık eşleşmeli");
  assert.equal(standardPieceGrams("2 dilim ekmeği"), 25);
  // Uzun kalıntı ek değil, yeni bir köktür: "zeytinyağlı" bir zeytin porsiyonu
  // değildir, sebze yemeği varsayılanına düşmeli.
  assert.equal(standardPortionGrams("zeytinyağlı enginar"), null);
  assert.equal(standardPortionGrams("bilinmeyen bir şey"), null);
  // Porsiyon ve adet ayrı tablolardır: 1 porsiyon yumurta 2 adettir.
  assert.equal(standardPortionGrams("yumurta"), 100);
  assert.equal(standardPieceGrams("yumurta"), 50);
});

test("birim seçici mobilde kırpılmaz", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  // Tek satırlık pill + overflow:hidden, 9 birimden yalnız 2'sini gösteriyordu
  // (ölçüldü: kap 131px, içerik 491px).
  const rule = css.match(/\.portion-unit-switch \{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /flex-wrap:wrap/, "çipler sarmalanmalı");
  assert.doesNotMatch(rule, /overflow:hidden/, "kırpma geri gelmiş");
  assert.match(css, /\.manual-fields > label:has\(\.portion-unit-switch\) \{ grid-column:1\/-1; \}/, "porsiyon alanı mobilde tam satır olmalı");
});

test("porsiyon ve adet gram/ml'nin yanında, ev ölçüleri ikinci katmanda", () => {
  assert.deepEqual(PRIMARY_PORTION_UNITS, ["g", "ml", "portion", "piece"]);
  assert.deepEqual(HOUSEHOLD_PORTION_UNITS, ["teaGlass", "waterGlass", "mug", "plate", "bowl"]);
  for (const unit of PRIMARY_PORTION_UNITS) assert.ok(!HOUSEHOLD_PORTION_UNITS.includes(unit), `${unit} iki grupta birden olmamalı`);
});

test("birim çipleri kilitli render edilmez", async () => {
  const { readFile } = await import("node:fs/promises");
  const tsx = await readFile(new URL("../components/CalorieTracker.tsx", import.meta.url), "utf8");
  const block = tsx.slice(tsx.indexOf("PRIMARY_PORTION_UNITS.map"), tsx.indexOf("portion-unit-household"));
  assert.doesNotMatch(block, /disabled=/, "porsiyon ve adet artık kilitlenmemeli");
  assert.doesNotMatch(tsx, /needsAnalysis/, "kilit mantığı tamamen kalkmalı");
});

test("dokunulmamış porsiyon alanı birim değişince 1 birime oturur", async () => {
  const { readFile } = await import("node:fs/promises");
  const tsx = await readFile(new URL("../components/CalorieTracker.tsx", import.meta.url), "utf8");
  const fn = tsx.slice(tsx.indexOf("function switchPortionUnit"), tsx.indexOf("function updateGrams"));
  // Varsayılan 100 g, "0,4 porsiyon çorba" gibi anlamsız bir değere çevriliyordu.
  assert.match(fn, /if \(!portionTouched && !aiEstimate\) \{/);
  assert.match(fn, /setUnitAmount\("1"\)/);
  assert.match(fn, /updateGrams\(String\(Math\.round\(reference\)\)\)/);
  // Kullanıcının kendi girdiği ya da AI'ın analiz ettiği gramaj korunur.
  assert.match(fn, /setUnitAmount\(fromGrams\(/);
  assert.match(tsx, /setPortionTouched\(true\)/, "porsiyon alanına yazmak işaretlenmeli");
  assert.match(tsx, /setPortionTouched\(false\)/, "kayıt sonrası sıfırlanmalı");
});

test("kalori takipçisinde iki ayrı birim grubu render edilir", async () => {
  const { readFile } = await import("node:fs/promises");
  const tsx = await readFile(new URL("../components/CalorieTracker.tsx", import.meta.url), "utf8");
  assert.match(tsx, /PRIMARY_PORTION_UNITS\.map/, "birincil birimler (g, ml, porsiyon, adet) ayrı render edilmeli");
  assert.match(tsx, /HOUSEHOLD_PORTION_UNITS\.map/, "ev ölçüleri ayrı render edilmeli");
  assert.match(tsx, /portion-unit-household/, "ev ölçüleri grubu ikincil stille işaretlenmeli");
  // Ev ölçüsü çiplerindeki "110 g" gibi gram karşılığı metni kaldırıldı;
  // çipler artık sade, referenceGrams yalnız hesap için kullanılır.
  const householdBlock = tsx.slice(tsx.indexOf("portion-unit-household"));
  assert.doesNotMatch(householdBlock.slice(0, householdBlock.indexOf("</span>")), /Math\.round\(grams\)/, "gram metni ev ölçülerinde kalmamalı");
});

test("ev ölçüsü grubunun CSS'i tanımlı", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.portion-unit-household \{/, "ikinci grup için stil bulunmalı");
});

test("profilden planı yenilemek panelde kalır", async () => {
  const { readFile } = await import("node:fs/promises");
  // "Planı yenile" ayarlar alt sayfasına taşındı (bkz. components/SettingsPanel.tsx);
  // profil ekranı yalnız kimlik ve ölçü tutuyor.
  const [app, manager] = await Promise.all([
    readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SettingsPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /await createPlan\(\{ keepOnDashboard: true \}\)/);
  // Yenilemede onboarding ekranlarına geçilmemeli.
  assert.match(app, /if \(!keepOnDashboard\) setStep\(STEP\.building\)/);
  assert.match(app, /if \(keepOnDashboard\) return;\s*\n\s*setPlanReport\(/);
  assert.match(manager, /onRefreshPlan\(\)\.finally/);
  assert.match(app, /onRefreshPlan=\{refreshPlanFromProfile\}/);
});
