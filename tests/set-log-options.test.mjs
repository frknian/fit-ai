import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Kullanıcının isteği: antrenman sırasında set kaydı özelleştirilebilir olsun —
// veri girmek zorunlu olmasın, set sayısı değiştirilebilsin, yazılan değer
// kendiliğinden kaydedilsin (Kaydet düğmesi olmasın) ve süre sayacı da isteğe
// bağlı olsun.
const app = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");
const logger = await readFile(new URL("../components/WorkoutSetLogger.tsx", import.meta.url), "utf8");

const { applySetDraftPatch, buildCompletedExerciseLog, createWorkoutSetDrafts, resizeWorkoutSetDrafts, setDraftHasData } =
  await import("../lib/workout-log.ts");

test("değer yazılan set kendiliğinden kaydedilir, boşaltılınca geri alınır", () => {
  const [draft] = createWorkoutSetDrafts(1, "10 tekrar");
  assert.equal(draft.completed, false, "set, kullanıcı dokunmadan kaydedilmiş sayılmaz");

  const withWeight = applySetDraftPatch(draft, { weightKg: "40" });
  assert.equal(withWeight.completed, true);

  const cleared = applySetDraftPatch(applySetDraftPatch(withWeight, { weightKg: "" }), { reps: "" });
  assert.equal(cleared.completed, false);

  // Yalnız kısa not da bir kayıttır.
  assert.equal(applySetDraftPatch(cleared, { note: "Form bozuldu" }).completed, true);
});

test("completed doğrudan verildiğinde türetme atlanır", () => {
  const [draft] = createWorkoutSetDrafts(1, "10 tekrar");
  assert.equal(applySetDraftPatch(draft, { completed: true }).completed, true);
  assert.equal(setDraftHasData({ ...draft, reps: "", weightKg: "", durationSeconds: "", rpe: "", note: "" }), false);
});

test("boş bırakılan setler kayda girmez", () => {
  const drafts = createWorkoutSetDrafts(3, "10 tekrar").map((draft, index) =>
    index === 0 ? applySetDraftPatch(draft, { weightKg: "40" }) : draft);
  const log = buildCompletedExerciseLog({ exerciseName: "Barbell Row", exerciseOrder: 1, isBodyweight: false, drafts });
  assert.equal(log.sets.length, 1);
  assert.equal(log.sets[0].setNumber, 1);
});

test("hiç veri girilmezse hareket için kayıt oluşmaz", () => {
  const drafts = createWorkoutSetDrafts(3, "10 tekrar");
  assert.equal(buildCompletedExerciseLog({ exerciseName: "Plank", exerciseOrder: 1, isBodyweight: true, drafts }), null);
});

test("set sayısı antrenman sırasında değiştirilebilir", () => {
  const drafts = createWorkoutSetDrafts(3, "10 tekrar").map((draft, index) =>
    index === 0 ? applySetDraftPatch(draft, { weightKg: "40" }) : draft);

  const grown = resizeWorkoutSetDrafts(drafts, 5, "10 tekrar");
  assert.equal(grown.length, 5);
  assert.deepEqual(grown.map((draft) => draft.setNumber), [1, 2, 3, 4, 5]);
  assert.equal(grown[0].weightKg, "40", "var olan kayıt korunur");
  assert.equal(grown[4].completed, false, "yeni set boş başlar");

  const shrunk = resizeWorkoutSetDrafts(grown, 2, "10 tekrar");
  assert.equal(shrunk.length, 2);
  assert.equal(shrunk[0].weightKg, "40");

  // Sınırlar: en az bir set, en çok yirmi.
  assert.equal(resizeWorkoutSetDrafts(drafts, 0, "10 tekrar").length, 1);
  assert.equal(resizeWorkoutSetDrafts(drafts, 99, "10 tekrar").length, 20);
});

test("set satırında Kaydet düğmesi yoktur", () => {
  assert.doesNotMatch(logger, /t\.setLogger\.save\b/);
  assert.match(logger, /<span className=\{set\.completed \? "set-status complete" : "set-status"\}/);
  assert.match(logger, /t\.setLogger\.autoSaveHint/);
});

test("zorluk alanı RPE yerine 10 üzerinden anlaşılır bir adla gösterilir", () => {
  assert.doesNotMatch(logger, /<span>RPE<\/span>/);
  assert.match(logger, /t\.setLogger\.effortLabel/);
  assert.match(logger, /t\.setLogger\.effortAria\(set\.setNumber\)/);
});

test("set kaydı ve süre sayacı kapatılabilir", () => {
  assert.match(app, /const setLoggingEnabled = useSetLoggingEnabled\(\);/);
  assert.match(app, /const timerEnabled = useWorkoutTimerEnabled\(\);/);
  assert.match(app, /\{setLoggingEnabled && <WorkoutSetLogger/);
  assert.match(app, /\{timerEnabled && <div className=\{`timer-card phase-\$\{workoutPhase\}`\}/);
  // Sayaç kapalıyken de seans süresi ve kalori işler; kayıt "1 saniye" düşmez.
  assert.match(app, /const counting = timerEnabled \? isRunning : workoutPhase !== "done";/);
  assert.match(app, /if \(timerEnabled\) setTimer\(\(current\) => \{/);
});

test("set sayısı denetimi oynatıcıdaki set şeridinde durur", () => {
  assert.match(app, /function changeSetCount\(delta: number\)/);
  assert.match(app, /resizeWorkoutSetDrafts\(current\[activeWorkout\] \|\| \[\], nextTotal, prescription\.target\)/);
  assert.match(app, /onClick=\{\(\) => changeSetCount\(1\)\}/);
  assert.match(app, /onClick=\{\(\) => changeSetCount\(-1\)\}/);
});
