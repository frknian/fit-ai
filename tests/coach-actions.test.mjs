import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COACH_ACTIONS_INSTRUCTION,
  MAX_COACH_ACTIONS,
  parseCoachActions,
} from "../lib/ai/coach-actions.ts";

const block = (json) => `Bugün 25 dakika yürüyüş öneriyorum.\n\n\`\`\`hedefit-actions\n${json}\n\`\`\``;

test("eylem bloğu ayıklanır, metin temiz kalır", () => {
  const { text, actions } = parseCoachActions(block('[{"type":"openWorkout"}]'));
  assert.equal(text, "Bugün 25 dakika yürüyüş öneriyorum.");
  assert.deepEqual(actions, [{ type: "openWorkout" }]);
});

test("blok yoksa metin olduğu gibi döner", () => {
  const { text, actions } = parseCoachActions("Sadece bir açıklama.");
  assert.equal(text, "Sadece bir açıklama.");
  assert.deepEqual(actions, []);
});

test("bozuk JSON kullanıcıya ham blok olarak gösterilmez", () => {
  // Yanıtın sonunda çalışmayan bir kod parçası görmek, özelliğin hiç
  // olmamasından kötü.
  const { text, actions } = parseCoachActions(block("{bozuk"));
  assert.equal(text, "Bugün 25 dakika yürüyüş öneriyorum.");
  assert.ok(!text.includes("hedefit-actions"));
  assert.deepEqual(actions, []);
});

test("tanınmayan eylem sessizce atılır", () => {
  const { actions } = parseCoachActions(block('[{"type":"deleteAccount"},{"type":"openWorkout"}]'));
  assert.deepEqual(actions, [{ type: "openWorkout" }], "uydurulmuş eylem geçmemeli");
});

test("bölge katalogdan doğrulanır", () => {
  assert.deepEqual(parseCoachActions(block('[{"type":"createWorkout","region":"Sırt"}]')).actions,
    [{ type: "createWorkout", region: "Sırt" }]);
  // Katalogda olmayan bölge kabul edilmez.
  assert.deepEqual(parseCoachActions(block('[{"type":"createWorkout","region":"Kanat"}]')).actions, []);
  assert.deepEqual(parseCoachActions(block('[{"type":"createWorkout"}]')).actions, []);
});

test("makul olmayan kalori hedefi taşınmaz", () => {
  // Sayı modelin uydurduğu bir değer olabilir; ekran kendi hesabını gösterir.
  assert.deepEqual(parseCoachActions(block('[{"type":"suggestMeal","targetKcal":450}]')).actions,
    [{ type: "suggestMeal", targetKcal: 450 }]);
  assert.deepEqual(parseCoachActions(block('[{"type":"suggestMeal","targetKcal":99999}]')).actions,
    [{ type: "suggestMeal" }], "aralık dışı değer düşer, eylem kalır");
  assert.deepEqual(parseCoachActions(block('[{"type":"suggestMeal","targetKcal":"çok"}]')).actions,
    [{ type: "suggestMeal" }]);
});

test("aynı eylem iki kez önerilmez", () => {
  const { actions } = parseCoachActions(block('[{"type":"remind"},{"type":"remind"}]'));
  assert.equal(actions.length, 1);
  // Farklı bölgeler ayrı eylemlerdir.
  const regions = parseCoachActions(block('[{"type":"createWorkout","region":"Kol"},{"type":"createWorkout","region":"Bacak"}]'));
  assert.equal(regions.actions.length, 2);
});

test("eylem sayısı sınırlanır", () => {
  const many = '[{"type":"openWorkout"},{"type":"startOutdoor"},{"type":"remind"},{"type":"changeGoal"}]';
  assert.equal(parseCoachActions(block(many)).actions.length, MAX_COACH_ACTIONS);
});

test("nesne biçimindeki blok da okunur", () => {
  const { actions } = parseCoachActions(block('{"actions":[{"type":"startOutdoor"}]}'));
  assert.deepEqual(actions, [{ type: "startOutdoor" }]);
});

test("metin dışı girdi çökertmez", () => {
  assert.deepEqual(parseCoachActions(undefined), { text: "", actions: [] });
  assert.deepEqual(parseCoachActions(null), { text: "", actions: [] });
});

test("talimat yalnız geçerli eylemleri sayar", async () => {
  // Prompt ile ayrıştırıcının eylem listesi birbirinden sürüklenirse model
  // hiç tanınmayan eylemler önerir ve kullanıcı hiçbir düğme görmez.
  const source = await readFile(new URL("../lib/ai/coach-actions.ts", import.meta.url), "utf8");
  const types = [...source.matchAll(/case "(\w+)":/g)].map((match) => match[1]).filter((name) => name !== "default");
  for (const type of types) {
    assert.ok(COACH_ACTIONS_INSTRUCTION.tr.includes(type), `Türkçe talimatta eksik eylem: ${type}`);
    assert.ok(COACH_ACTIONS_INSTRUCTION.en.includes(type), `İngilizce talimatta eksik eylem: ${type}`);
  }
});

test("eylemler yalnız gerçek modelden ayrıştırılır", async () => {
  // Yerel yedek şablon yanıt üretir; oradan yapılandırılmış çağrı beklemek,
  // model onaylamamışken kullanıcıya "plana ekle" düğmesi göstermek olurdu.
  const route = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
  assert.match(route, /servedLocally \? \{ text: result\.text, actions: \[\] \} : parseCoachActions\(result\.text\)/);
  // Eylem alanı yalnız doluysa gönderilir.
  assert.match(route, /\.\.\.\(parsed\.actions\.length \? \{ actions: parsed\.actions \} : \{\}\)/);
});

test("eylem talimatı cihaz üstü modele gönderilmez", async () => {
  // Küçük model yapılandırılmış çıktıda güvenilir değil; ayrıca her ek
  // talimat prefill süresine doğrudan yansıyor.
  const prompts = await readFile(new URL("../lib/ai/prompts.ts", import.meta.url), "utf8");
  assert.match(prompts, /input\.compact \? "" : COACH_ACTIONS_INSTRUCTION\[locale\]/);
  // Prompt değişti: sürüm artmalı, yoksa eski ölçümler yenisiyle karışır.
  assert.match(prompts, /AI_COACH_PROMPT_VERSION = "v2"/);
});

test("eylem kullanıcı onayı olmadan uygulanmaz", async () => {
  const [chat, app] = await Promise.all([
    readFile(new URL("../components/AiCoachChat.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8"),
  ]);
  // Eylem yalnızca düğmeye BASILINCA çalışır; otomatik tetikleyen bir efekt yok.
  assert.match(chat, /onClick=\{\(\) => onAction\?\.\(action\)\}/);
  assert.doesNotMatch(chat, /useEffect\([^)]*onAction/);
  // İşleyici verilmezse düğme hiç gösterilmez.
  assert.match(chat, /onAction && result\.actions\?\.length/);
  // Uygulama tarafı yalnız GEZİNME yapar; kalıcı değişiklik ikinci bir karara bağlı.
  assert.match(app, /function applyCoachAction\(action: CoachAction\)/);
  assert.doesNotMatch(app, /case "changeGoal": set(GoalText|TargetWeight)/);
});
