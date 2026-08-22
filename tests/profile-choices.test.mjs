import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { EQUIPMENT_CHOICES, INJURY_CHOICES, formatChoices, parseChoices, toggleChoice } from "../lib/profile-choices.ts";
import { hasEquipment } from "../lib/equipment-match.ts";

test("çoklu seçim değerleri tek dizede saklanıp geri okunur", () => {
  assert.deepEqual(parseChoices(""), []);
  assert.deepEqual(parseChoices("Dambıl · Yoga matı"), ["Dambıl", "Yoga matı"]);
  assert.equal(formatChoices(["Dambıl", "Yoga matı"]), "Dambıl · Yoga matı");
});

test("dışlayıcı cevaplar diğerleriyle birlikte işaretlenemez", () => {
  // "Hiçbiri · Dambıl" kendisiyle çelişen bir değerdi ve plan üretimini
  // yanıltıyordu.
  assert.deepEqual(toggleChoice(["Dambıl", "Kettlebell"], "Hiçbiri"), ["Hiçbiri"]);
  assert.deepEqual(toggleChoice(["Hiçbiri"], "Dambıl"), ["Dambıl"]);
  assert.deepEqual(toggleChoice(["Bel", "Diz"], "Yok"), ["Yok"]);
  // Aynı seçeneğe tekrar basmak seçimi kaldırır.
  assert.deepEqual(toggleChoice(["Dambıl", "Yoga matı"], "Dambıl"), ["Yoga matı"]);
});

test("seçilen ekipman plan üretiminin okuduğu biçimde saklanır", () => {
  // Kaydedilen dize doğrudan hasEquipment'e gider; eşleşmezse kullanıcı
  // dambılını seçmiş olsa bile programda dambıl hareketi çıkmazdı.
  const stored = formatChoices(["Dambıl", "Yoga matı"]);
  assert.equal(hasEquipment(stored, "dambıl"), true);
  assert.equal(hasEquipment(stored, "band"), false);
  assert.equal(hasEquipment(formatChoices(["Direnç bandı"]), "band"), true);
  assert.equal(hasEquipment(formatChoices(["Salon ekipmanı"]), "salon"), true);
  // "Hiçbiri" hiçbir ekipmanı açmamalı.
  assert.equal(hasEquipment(formatChoices(["Hiçbiri"]), "dambıl"), false);
});

test("seçenekler profil testindeki yazımla birebir aynıdır", async () => {
  // İki yerde farklı yazım, aynı kavramı iki ayrı değerle saklardı.
  const tr = await readFile(new URL("../lib/i18n/dictionaries/tr.ts", import.meta.url), "utf8");
  const block = tr.slice(tr.indexOf("answerOptions:"), tr.indexOf("] as string[][]"));
  for (const choice of EQUIPMENT_CHOICES) assert.ok(block.includes(`"${choice}"`), `testte olmayan ekipman: ${choice}`);
  for (const choice of INJURY_CHOICES) assert.ok(block.includes(`"${choice}"`), `testte olmayan sakatlık: ${choice}`);
});

test("profil ekranı kimlik ve ölçüyle sınırlı, ayarlar alt sayfada durur", async () => {
  const [profile, settings] = await Promise.all([
    readFile(new URL("../components/ProfileManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SettingsPanel.tsx", import.meta.url), "utf8"),
  ]);
  // Ayarlara profilin sağ üstündeki dişliden girilir; alt sekme çubuğuna
  // yedinci bir sekme eklenmez.
  assert.match(profile, /className="profile-settings-button"/);
  assert.match(profile, /if \(settingsOpen\) \{\s*\n\s*return <SettingsPanel/);
  // Tercihler, veriler, plan ve hesap yönetimi ayarlarda toplanır.
  for (const part of ["profile-preferences", "retake-test-zone", "progress-reset-zone", "account-danger-zone", "refresh-plan-zone"]) {
    assert.ok(settings.includes(part), `ayarlar sayfasında eksik: ${part}`);
  }
  // Aynı bölümler profil ekranında ARTIK durmamalı: iki yerde duran ayar,
  // hangisinin geçerli olduğunu belirsizleştiriyordu.
  for (const part of ["progress-reset-zone", "account-danger-zone", "profile-preferences"]) {
    assert.ok(!profile.includes(part), `profil ekranında kalmamalı: ${part}`);
  }
  // Çıkış düğmesi ayarların en altında.
  assert.match(settings, /className="profile-signout"><button type="button" onClick=\{\(\) => void onSignOut\(\)\}/);
  assert.ok(settings.indexOf('className="profile-signout"') > settings.indexOf("account-danger-zone"), "çıkış en altta olmalı");
});

test("profil testinin soruları yalnız testin içinde durur", async () => {
  const profile = await readFile(new URL("../components/ProfileManager.tsx", import.meta.url), "utf8");
  // Hedef, ekipman, sakatlık ve ortam soruları profil ekranından kaldırıldı;
  // aynı cevabın iki düzenleme yeri olması hangisinin geçerli olduğunu
  // belirsiz bırakıyordu. Tek kaynak profil testidir.
  for (const marker of ["GOAL_PRESETS", "EQUIPMENT_CHOICES", "INJURY_CHOICES", "TrainingPlaceSwitch"]) {
    assert.ok(!profile.includes(marker), `profil ekranında test sorusu kalmış: ${marker}`);
  }
  // Testi yeniden çözmenin girişi kalır.
  assert.match(profile, /className="profile-test-link"/);
  assert.match(profile, /onClick=\{onRetakeTest\}/);
});

test("sakatlık cevabı yalnız profil testinde tutulur", async () => {
  // Profil ekranı artık sakatlık cevabını düzenlemiyor; plan üretimi tek
  // kaynaktan (profil testi cevapları) okur.
  const app = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");
  assert.ok(!app.includes("injuryAnswer="), "profil ekranına ikinci bir sakatlık girişi bağlanmamalı");
  assert.match(app, /QUESTION\.injuries/);
});
