import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_OUTDOOR_GOAL_MINUTES,
  isOutdoorActivity,
  outdoorBadge,
  outdoorWeeklyStreak,
  summarizeOutdoorWeek,
  weekStartKey,
} from "../lib/outdoor.ts";

// 21 Ağustos 2026 Cuma; haftanın pazartesisi 17 Ağustos.
const NOW = new Date("2026-08-21T09:00:00Z");
const ZONE = "Europe/Istanbul";
const options = { now: NOW, timeZone: ZONE };

const entry = (localDate, activityKey, durationMinutes, source = "manual") => ({
  localDate, activityKey, durationMinutes, source,
});

test("haftanın başlangıcı pazartesidir", () => {
  assert.equal(weekStartKey(NOW, ZONE), "2026-08-17");
});

test("açık hava sayılan aktiviteler gerekçesiyle sınırlıdır", () => {
  assert.equal(isOutdoorActivity({ activityKey: "running", source: "manual" }), true);
  assert.equal(isOutdoorActivity({ activityKey: "hiking", source: "manual" }), true);
  // Havuz, salon ve stüdyo sporları "doğada" sayılmaz; sayılsaydı hedef
  // anlamını yitirirdi.
  assert.equal(isOutdoorActivity({ activityKey: "swimming", source: "manual" }), false);
  assert.equal(isOutdoorActivity({ activityKey: "yoga", source: "manual" }), false);
  assert.equal(isOutdoorActivity({ activityKey: "boxing", source: "manual" }), false);
  // GPS yalnız dışarıda çalışır: kaynağı GPS olan her kayıt açık havadır.
  assert.equal(isOutdoorActivity({ activityKey: "yoga", source: "gps" }), true);
});

test("haftalık özet yalnız bu haftanın açık hava kayıtlarını sayar", () => {
  const week = summarizeOutdoorWeek([
    entry("2026-08-18", "running", 40),
    entry("2026-08-20", "hiking", 50),
    entry("2026-08-20", "yoga", 60),          // açık hava değil
    entry("2026-08-16", "running", 90),        // geçen hafta
  ], options);
  assert.equal(week.weekStart, "2026-08-17");
  assert.equal(week.minutes, 90);
  assert.equal(week.days, 2, "aynı gün iki kayıt tek gün sayılır");
  assert.equal(week.goalMinutes, DEFAULT_OUTDOOR_GOAL_MINUTES);
  assert.equal(week.remainingMinutes, 60);
  assert.equal(week.percent, 60);
});

test("hedef aşıldığında yüzde 100'de durur ve kalan sıfırlanır", () => {
  const week = summarizeOutdoorWeek([entry("2026-08-19", "cycling", 400)], options);
  assert.equal(week.percent, 100, "%267 gibi bir ilerleme çubuğu anlamsız olurdu");
  assert.equal(week.remainingMinutes, 0);
});

test("rozet haftalık süreye göre verilir", () => {
  const badge = (minutes) => outdoorBadge({ minutes, goalMinutes: 150 });
  assert.equal(badge(0), "none");
  assert.equal(badge(40), "seed");
  assert.equal(badge(80), "sprout");
  assert.equal(badge(150), "tree");
  assert.equal(badge(320), "forest");
});

test("içinde bulunulan hafta hedefi tutturmasa bile seriyi kırmaz", () => {
  // Pazartesi sabahı herkesin serisi sıfırlanmış görünseydi, seri hiçbir zaman
  // bir haftadan uzun olamazdı.
  const previousWeeks = [
    entry("2026-08-11", "running", 160), // 10–16 Ağustos haftası
    entry("2026-08-05", "running", 160), // 3–9 Ağustos haftası
  ];
  assert.equal(outdoorWeeklyStreak(previousWeeks, options), 2);
  // Bu hafta da tutturulursa seriye eklenir.
  assert.equal(outdoorWeeklyStreak([...previousWeeks, entry("2026-08-18", "running", 160)], options), 3);
  // Arada boş bir hafta seriyi keser.
  assert.equal(outdoorWeeklyStreak([entry("2026-08-05", "running", 160)], options), 0);
});

test("doğa çağrısı bildirime ve ana sayfaya bağlanır", async () => {
  const [card, app, dictionary] = await Promise.all([
    readFile(new URL("../components/OutdoorGoalCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/i18n/dictionaries/tr.ts", import.meta.url), "utf8"),
  ]);
  // Kart ana sayfada durur ve tek dokunuşla Hedefit Rota'yı başlatır.
  assert.match(app, /<OutdoorGoalCard userId=\{authUser\.id\} onStartRoute=/);
  assert.match(app, /setGpsTrackerOpen\(true\)/);
  assert.match(card, /outdoorWeeklyStreak/);
  // Kayıt eklenince kart kendini tazeler; yoksa hedef eski hâlinde kalırdı.
  assert.match(card, /addEventListener\("fit-ai-activity-recorded"/);
  // Sabah bildirimindeki doğa çağrıları sözlükte tanımlı.
  assert.match(dictionary, /natureTips: \[/);
});
