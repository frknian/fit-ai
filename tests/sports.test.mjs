import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { coreActivityCatalog, estimateActivityCalories, sportCatalog, sportByKey, validActivityDuration } from "../lib/sports.ts";

test("spor kılavuzu en yaygın 15 benzersiz sporu içerir", () => {
  assert.equal(sportCatalog.length, 15);
  assert.equal(new Set(sportCatalog.map((sport) => sport.key)).size, 15);
  // `icon` alanı kaldırıldı: baş harf yerine gerçek çizgi simgesi kullanılıyor
  // (bkz. components/ActivityIcon.tsx).
  assert.ok(sportCatalog.every((sport) => sport.name && sport.guide));
  assert.ok(sportCatalog.every((sport) => !("icon" in sport)), "spor kataloğunda baş harf simgesi kalmamalı");
  assert.equal(sportByKey("swimming")?.name, "Yüzme");
  assert.equal(sportByKey("boxing")?.metrics[0]?.key, "rounds");
  assert.equal(sportByKey("cycling")?.metrics.some((metric) => metric.key === "elevationM"), true);
});

test("aktivite süresi güvenli günlük sınırlar içinde doğrulanır", () => {
  assert.equal(validActivityDuration("30"), true);
  assert.equal(validActivityDuration("0"), false);
  assert.equal(validActivityDuration("1441"), false);
  assert.equal(validActivityDuration("abc"), false);
});

test("ana aktivite kayıtları yalnız mevcut dört kapsamı sunar", () => {
  assert.deepEqual(coreActivityCatalog.map((activity) => activity.key), ["walking", "running", "cycling", "swimming"]);
});

test("aktivite kalorisi kilo, süre ve yoğunluğa göre otomatik hesaplanır", () => {
  assert.equal(estimateActivityCalories("walking", 30, 70, "Orta"), 158);
  assert.ok(estimateActivityCalories("running", 30, 70, "Yüksek") > estimateActivityCalories("running", 30, 70, "Hafif"));
  assert.ok(estimateActivityCalories("cycling", 45, 90, "Orta") > estimateActivityCalories("cycling", 45, 60, "Orta"));
  assert.equal(estimateActivityCalories("walking", 0, 70, "Orta"), 0);
});

test("aktivite günlükleri geçmişe ve seri özetine güvenli biçimde bağlanır", async () => {
  const [component, service, streak, migration] = await Promise.all([
    readFile(new URL("../components/ActivityLogger.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/activity-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/ActivityStreak.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/20260722_sport_activity_entries.sql", import.meta.url), "utf8"),
  ]);
  assert.match(component, /createActivityRepository/);
  assert.match(component, /record_streak_activity/);
  assert.match(component, /t\.activityLogger\.estimatedCalorie/);
  assert.match(component, /estimateActivityCalories/);
  assert.match(component, /t\.activityLogger\.historyTitle/);
  // Sporlar artık "Diğer spor ekle" başlığının altındaki ayrı ızgarada değil,
  // hepsi tek bir dikey listede alt alta duruyor.
  assert.match(component, /allActivityCatalog/);
  assert.match(component, /activity-entry-stacked/);
  assert.doesNotMatch(component, /t\.activityLogger\.guideTitle|sport-guide-grid/);
  assert.doesNotMatch(component, /GPS|Strava|akıllı saat|harita|yakında/i);
  assert.match(service, /interface ActivityRepository/);
  assert.match(service, /externalActivityId/);
  assert.match(service, /routeReference/);
  assert.doesNotMatch(streak, /Yürüyüş ekle|Diğer spor ekle/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /auth\.uid\(\) = user_id/);
  assert.match(migration, /estimated_calories/);
  assert.match(migration, /external_activity_id/);
});

test("hareket kılavuzu alan ile tutarlıdır ve Türkçe küçültmeden etkilenmez", async () => {
  const src = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");
  // Bitiş sınırı "export" olsun olmasın çalışmalı; aksi halde getMotionGuide
  // dışa açıldığında dilime sarkan "export" eval'i SyntaxError'a düşürüyordu.
  const body = src.slice(src.indexOf("function getMotionPattern"), src.search(/\n(?:export )?function getMotionGuide/));
  const pat = eval(`(${body.replace('function getMotionPattern(exercise: { name: string; english: string }): MotionPattern {', "function(exercise){").trimEnd()})`);

  // Türkçe küçültme büyük "I"yı noktasız "ı"ya çevirir; kalıp eşleştirmesi
  // bundan etkilenirse "Inchworm" gibi adlar yanlış kılavuza düşer.
  assert.doesNotMatch(body, /toLocaleLowerCase\("tr-TR"\)/);
  assert.equal(pat({ name: "Inchworm", english: "Inchworm" }), "cardio");
  assert.equal(pat({ name: "Eğimli Şınav", english: "Incline Push-up" }), "pushup");

  // Kas adı taşıyan esnemeler kuvvet kılavuzuna düşmemeli.
  assert.equal(pat({ name: "Triceps Esnetme", english: "Overhead Triceps Stretch" }), "mobility");
  assert.equal(pat({ name: "Baldır Duvar Esnetme", english: "Wall Calf Stretch" }), "mobility");
  assert.equal(pat({ name: "Kürek Çekme", english: "Rowing Machine" }), "cardio");

  const blok = src.slice(src.indexOf("const additionalExerciseDefinitions"), src.indexOf("function buildExerciseInstruction"));
  const defs = [...blok.matchAll(/^  \["([^"]+)", "([^"]+)", "([^"]+)"/gm)].map((m) => ({ name: m[1], english: m[2], area: m[3] }));
  const core = [...src.matchAll(/\{ name: "([^"]+)", english: "([^"]+)", area: "([^"]+)"/g)].map((m) => ({ name: m[1], english: m[2], area: m[3] }));
  const hepsi = [...core, ...defs];
  assert.ok(hepsi.length >= 170, `katalog küçülmüş: ${hepsi.length}`);
  assert.equal(new Set(hepsi.map((e) => e.name)).size, hepsi.length, "yinelenen hareket adı");

  for (const e of hepsi) {
    if (e.area === "Esneklik") assert.equal(pat(e), "mobility", `${e.name} esneklik ama ${pat(e)} kılavuzu aldı`);
    if (e.area === "Kondisyon") assert.ok(["cardio", "plank", "squat", "lunge"].includes(pat(e)), `${e.name} kondisyon ama ${pat(e)} kılavuzu aldı`);
  }

  // Her alanda anlamlı çeşitlilik olsun.
  const sayim = {};
  for (const e of hepsi) sayim[e.area] = (sayim[e.area] || 0) + 1;
  for (const [alan, adet] of Object.entries(sayim)) assert.ok(adet >= 10, `${alan} yalnızca ${adet} hareket içeriyor`);
});
