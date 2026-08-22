import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clampSleepMinutes,
  formatSleepDuration,
  isValidSleepMinutes,
  minutesBetween,
  summarizeSleep,
} from "../lib/sleep-log.ts";

const entry = (localDate, minutes, quality = "orta") => ({
  id: localDate, localDate, minutes, quality, bedTime: null, wakeTime: null, note: null,
});

test("gece yarısını aşan uyku doğru hesaplanır", () => {
  // En yaygın durum: akşam yatıp ertesi sabah kalkmak. Ham çıkarma negatif
  // verir; bir gün eklenmeden süre eksi çıkardı.
  assert.equal(minutesBetween("23:30", "07:00"), 450);
  assert.equal(minutesBetween("00:30", "08:00"), 450);
  // Aynı gün içinde (öğle uykusu) normal çıkarma.
  assert.equal(minutesBetween("13:00", "14:30"), 90);
});

test("geçersiz saat girdisi süre üretmez", () => {
  assert.equal(minutesBetween("25:00", "07:00"), null);
  assert.equal(minutesBetween("23:70", "07:00"), null);
  assert.equal(minutesBetween("", "07:00"), null);
  // Aynı saat: 0 dakikalık uyku diye bir şey yok.
  assert.equal(minutesBetween("07:00", "07:00"), null);
});

test("uyku süresi güvenli sınırlar içinde doğrulanır", () => {
  assert.equal(isValidSleepMinutes(450), true);
  assert.equal(isValidSleepMinutes(15), true);
  assert.equal(isValidSleepMinutes(1440), true);
  assert.equal(isValidSleepMinutes(10), false, "15 dakikanın altı uyku sayılmaz");
  assert.equal(isValidSleepMinutes(1441), false, "24 saatten uzun uyku veri hatasıdır");
  assert.equal(isValidSleepMinutes("abc"), false);
  assert.equal(clampSleepMinutes(9999), 1440);
  assert.equal(clampSleepMinutes(-5), 0);
});

test("süre okunur biçimde yazılır", () => {
  assert.equal(formatSleepDuration(450), "7s 30dk");
  // Tam saatlerde dakika hanesi yazılmaz ("8s 0dk" değil).
  assert.equal(formatSleepDuration(480), "8s");
  assert.equal(formatSleepDuration(45), "45dk");
  assert.equal(formatSleepDuration(450, "en"), "7h 30m");
});

test("ortalama yalnız kayıtlı geceler üzerinden alınır", () => {
  // Kaydedilmemiş gün "0 saat uyudu" demek değildir; boş günleri saymak
  // ortalamayı olduğundan kötü gösterirdi.
  const summary = summarizeSleep([entry("2026-08-20", 480), entry("2026-08-22", 420)]);
  assert.equal(summary.nights, 2);
  assert.equal(summary.averageMinutes, 450);
  // En son kayıt tarihe göre seçilir, dizideki sıraya göre değil.
  assert.equal(summary.lastEntry?.localDate, "2026-08-22");
});

test("önerilen aralıkta kalan geceler sayılır", () => {
  const summary = summarizeSleep([
    entry("2026-08-22", 480), // 8 saat — aralıkta
    entry("2026-08-21", 300), // 5 saat — kısa
    entry("2026-08-20", 600), // 10 saat — uzun
  ]);
  assert.equal(summary.nights, 3);
  assert.equal(summary.nightsInRange, 1);
});

test("kayıt yoksa özet sıfırdır, çökmez", () => {
  const summary = summarizeSleep([]);
  assert.deepEqual(summary, { nights: 0, averageMinutes: 0, nightsInRange: 0, lastEntry: null });
});

test("uyku tablosu kullanıcıya kilitlenir ve günde tek kayıt tutar", async () => {
  const migration = await readFile(new URL("../db/migrations/20260822_sleep_logs.sql", import.meta.url), "utf8");
  assert.match(migration, /enable row level security/);
  for (const action of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp(`for ${action} (using|with check) \\(auth\\.uid\\(\\) = user_id\\)`), `${action} politikası eksik`);
  }
  // Gün başına tek kayıt: "dün kaç saat uyudun" sorusunun iki cevabı olmaz.
  assert.match(migration, /unique \(user_id, local_date\)/);
  assert.match(migration, /minutes > 0 and minutes <= 1440/);
  // İlerleme sıfırlama uyku kayıtlarını da silmeli; aksi hâlde sıfırlanan
  // hesapta eski geceler kalırdı.
  const resetRoute = await readFile(new URL("../app/api/account/reset-progress/route.ts", import.meta.url), "utf8");
  assert.match(resetRoute, /"sleep_logs"/);
});
