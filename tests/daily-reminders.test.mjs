import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_DAILY_REMINDER, normalizeDailyReminder, planDailyReminders } from "../lib/daily-reminders.ts";

const labels = {
  greeting: "Günaydın",
  workoutDay: "Bugün antrenman günün.",
  restDay: "Bugün planlı antrenman yok.",
  hydrationTips: ["Su 1", "Su 2"],
  natureTips: ["Doğa 1", "Doğa 2"],
};

// Sabit bir an: 21 Ağustos 2026 Cuma, 12:00 (Europe/Istanbul).
const NOW = new Date("2026-08-21T09:00:00Z");
const ZONE = "Europe/Istanbul";

const plan = (preferences, workoutDays = [], days = 7) =>
  planDailyReminders({ preferences, workoutDays, labels, now: NOW, timeZone: ZONE, days });

test("hatırlatma varsayılan olarak kapalıdır", () => {
  // İstenmeden gönderilen bildirim, izni kalıcı olarak reddettiren en hızlı yol.
  assert.equal(DEFAULT_DAILY_REMINDER.enabled, false);
  assert.equal(plan(DEFAULT_DAILY_REMINDER).length, 0);
});

test("kapalıyken hiç bildirim kurulmaz", () => {
  assert.equal(plan({ ...DEFAULT_DAILY_REMINDER, enabled: false }, [1, 3, 5]).length, 0);
});

test("saati geçmiş güne bildirim kurulmaz", () => {
  // Şu an 12:00; 08:00 hatırlatması bugün için geçmişte kaldı.
  const entries = plan({ ...DEFAULT_DAILY_REMINDER, enabled: true, hour: 8 }, [], 3);
  assert.ok(entries.every((entry) => entry.at.getTime() > NOW.getTime()));
  assert.ok(!entries.some((entry) => entry.dateKey === "2026-08-21"), "bugünün geçmiş saati atlanmalı");
  assert.equal(entries[0].dateKey, "2026-08-22");
});

test("antrenman günü ve dinlenme günü farklı metin alır", () => {
  // 2026-08-22 Cumartesi (ISO 6), 2026-08-24 Pazartesi (ISO 1).
  const entries = plan({ ...DEFAULT_DAILY_REMINDER, enabled: true, hydration: false, nature: false }, [1], 7);
  const saturday = entries.find((entry) => entry.dateKey === "2026-08-22");
  const monday = entries.find((entry) => entry.dateKey === "2026-08-24");
  assert.equal(saturday.workoutDay, false);
  assert.equal(saturday.body, labels.restDay);
  assert.equal(monday.workoutDay, true);
  assert.equal(monday.body, labels.workoutDay);
  assert.equal(monday.title, labels.greeting);
});

test("su ve doğa önerileri açıkken eklenir, kapalıyken eklenmez", () => {
  const withTips = plan({ ...DEFAULT_DAILY_REMINDER, enabled: true, hydration: true, nature: true }, [], 3)[0];
  assert.ok(withTips.body.includes("Su "), "su önerisi eklenmeli");
  assert.ok(withTips.body.includes("Doğa "), "doğa önerisi eklenmeli");
  const withoutNature = plan({ ...DEFAULT_DAILY_REMINDER, enabled: true, hydration: true, nature: false }, [], 3)[0];
  assert.ok(withoutNature.body.includes("Su "));
  assert.ok(!withoutNature.body.includes("Doğa "), "kapalı öneri eklenmemeli");
});

test("öneriler günden güne dönüşümlü kullanılır", () => {
  // Aynı cümle her sabah tekrarlanırsa bildirim okunmadan kapatılan bir
  // gürültüye dönüşür.
  const entries = plan({ ...DEFAULT_DAILY_REMINDER, enabled: true }, [], 5);
  const bodies = entries.slice(0, 2).map((entry) => entry.body);
  assert.notEqual(bodies[0], bodies[1], "art arda iki gün aynı öneriyi almamalı");
});

test("bozuk tercih kaydı güvenli varsayılana düşer", () => {
  assert.deepEqual(normalizeDailyReminder(null), DEFAULT_DAILY_REMINDER);
  assert.deepEqual(normalizeDailyReminder("bozuk"), DEFAULT_DAILY_REMINDER);
  // Sabah selamı: saat 5–12 dışına çıkamaz.
  assert.equal(normalizeDailyReminder({ enabled: true, hour: 23 }).hour, DEFAULT_DAILY_REMINDER.hour);
  assert.equal(normalizeDailyReminder({ enabled: true, hour: 7 }).hour, 7);
  assert.equal(normalizeDailyReminder({ enabled: true, minute: 45 }).minute, 0, "yalnız :00 ve :30 geçerli");
  assert.equal(normalizeDailyReminder({ enabled: true, minute: 30 }).minute, 30);
});

test("günlük bildirimler antrenman bildirimlerinden ayrı iptal edilir", async () => {
  const mobile = await readFile(new URL("../lib/mobile.ts", import.meta.url), "utf8");
  // İki akış aynı bayrağı kullansaydı, günlük hatırlatmayı kapatmak antrenman
  // saati bildirimlerini de silerdi.
  assert.match(mobile, /notification\.extra\?\.hedefitDaily === true/);
  assert.match(mobile, /notification\.extra\?\.fitAiWorkout === true/);
  const settings = await readFile(new URL("../components/DailyReminderSettings.tsx", import.meta.url), "utf8");
  // Açarken izin istenmezse kullanıcı "açtım ama gelmiyor" durumunda kalır.
  assert.match(settings, /requestMobileNotificationPermission\(\)/);
  assert.match(settings, /permission !== "granted"/);
});
