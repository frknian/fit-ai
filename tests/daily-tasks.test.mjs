import assert from "node:assert/strict";
import test from "node:test";
import {
  WEIGH_IN_INTERVAL_DAYS,
  buildDailyTasks,
  daysBetween,
  summarizeDailyTasks,
} from "../lib/daily-tasks.ts";

const base = {
  isWorkoutDay: false,
  workoutDone: false,
  steps: 0,
  stepGoal: 8000,
  outdoorMinutes: 0,
  outdoorGoalMet: true,
  daysSinceWeighIn: 0,
};
const ids = (tasks) => tasks.map((task) => task.id);

test("antrenman yalnız planlı günlerde görev olur", () => {
  // Plansız günde "antrenman yap" demek, dinlenmeyi ihmal edilmiş bir görev
  // gibi gösterirdi.
  assert.ok(!ids(buildDailyTasks(base)).includes("workout"));
  assert.ok(ids(buildDailyTasks({ ...base, isWorkoutDay: true })).includes("workout"));
});

test("tamamlanan antrenman işaretli gelir", () => {
  const [workout] = buildDailyTasks({ ...base, isWorkoutDay: true, workoutDone: true });
  assert.equal(workout.id, "workout");
  assert.equal(workout.done, true);
});

test("adım görevi hedefe ulaşınca tamamlanır", () => {
  const under = buildDailyTasks({ ...base, steps: 5420 }).find((task) => task.id === "steps");
  assert.equal(under.done, false);
  assert.equal(under.target, 8000);
  assert.equal(under.current, 5420);

  const met = buildDailyTasks({ ...base, steps: 8000 }).find((task) => task.id === "steps");
  assert.equal(met.done, true, "hedefe tam ulaşmak yeterli olmalı");
  assert.equal(buildDailyTasks({ ...base, steps: 9000 }).find((t) => t.id === "steps").done, true);
});

test("bozuk adım hedefi listeyi çökertmez", () => {
  const task = buildDailyTasks({ ...base, stepGoal: 0, steps: 10 }).find((t) => t.id === "steps");
  assert.equal(task.target, 1, "sıfır hedef her adımı tamamlanmış gösterirdi");
  assert.equal(task.done, true);
});

test("doğa görevi haftalık hedef tutturulduysa düşer", () => {
  // Amaç biriktirmek değil, her hafta dışarı çıkma alışkanlığı.
  assert.ok(!ids(buildDailyTasks({ ...base, outdoorGoalMet: true })).includes("outdoor"));
  const open = buildDailyTasks({ ...base, outdoorGoalMet: false }).find((t) => t.id === "outdoor");
  assert.equal(open.done, false);
  // Bugün dışarıda geçirilen herhangi bir süre görevi tamamlar.
  const done = buildDailyTasks({ ...base, outdoorGoalMet: false, outdoorMinutes: 20 }).find((t) => t.id === "outdoor");
  assert.equal(done.done, true);
  assert.equal(done.current, 20);
});

test("tartılma yalnız zamanı geldiyse görev olur", () => {
  assert.ok(!ids(buildDailyTasks({ ...base, daysSinceWeighIn: 3 })).includes("weighIn"));
  assert.ok(ids(buildDailyTasks({ ...base, daysSinceWeighIn: WEIGH_IN_INTERVAL_DAYS })).includes("weighIn"));
  // Hiç tartılmamış kullanıcıdan da beklenir.
  assert.ok(ids(buildDailyTasks({ ...base, daysSinceWeighIn: null })).includes("weighIn"));
});

test("liste her koşulda kısa kalır", () => {
  // Ana ekranın işi "bugün ne yapmalıyım"ı bir bakışta yanıtlamak; on maddelik
  // bir liste o soruyu yanıtlamaz, erteletir.
  const everything = buildDailyTasks({
    isWorkoutDay: true, workoutDone: false, steps: 0, stepGoal: 8000,
    outdoorMinutes: 0, outdoorGoalMet: false, daysSinceWeighIn: null,
  });
  assert.equal(everything.length, 4);
  assert.deepEqual(ids(everything), ["workout", "steps", "outdoor", "weighIn"]);
  // En sade gün: yalnız adım.
  assert.deepEqual(ids(buildDailyTasks(base)), ["steps"]);
});

test("ilerleme özeti tamamlananları sayar", () => {
  const tasks = buildDailyTasks({ ...base, isWorkoutDay: true, workoutDone: true, steps: 9000 });
  assert.deepEqual(summarizeDailyTasks(tasks), { done: 2, total: 2, percent: 100 });
  const partial = buildDailyTasks({ ...base, isWorkoutDay: true, workoutDone: true, steps: 10 });
  assert.deepEqual(summarizeDailyTasks(partial), { done: 1, total: 2, percent: 50 });
  assert.deepEqual(summarizeDailyTasks([]), { done: 0, total: 0, percent: 0 });
});

test("gün farkı saat dilimi taşımadan hesaplanır", () => {
  assert.equal(daysBetween("2026-08-15", "2026-08-22"), 7);
  assert.equal(daysBetween("2026-08-22", "2026-08-22"), 0);
  // Yaz saati geçişini kapsayan aralık: Date farkı almak bir gün kaydırabiliyor.
  assert.equal(daysBetween("2026-03-25", "2026-04-01"), 7);
  assert.equal(daysBetween("bozuk", "2026-08-22"), null);
});
