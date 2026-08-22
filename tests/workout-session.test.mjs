import assert from "node:assert/strict";
import test from "node:test";
import {
  completedForFinish,
  initialSessionState,
  isCounting,
  sessionReducer,
} from "../lib/workout-session.ts";

const PRESCRIPTION = { totalSets: 3, workSeconds: 45, restSeconds: 60 };
const run = (state, ...actions) => actions.reduce(sessionReducer, state);
const open = (queueLength = 3, index = 0) => sessionReducer(initialSessionState, { type: "open", index, queueLength, prescription: PRESCRIPTION });
const complete = (timerEnabled = true) => ({ type: "completePhase", prescription: PRESCRIPTION, timerEnabled });
const tick = (timerEnabled = true, caloriesPerSecond = 0.1) => ({ type: "tick", prescription: PRESCRIPTION, timerEnabled, caloriesPerSecond });

test("oynatıcı açılınca ilk setin başında ve duruyor", () => {
  const state = open();
  assert.equal(state.activeIndex, 0);
  assert.equal(state.phase, "work");
  assert.equal(state.currentSet, 1);
  assert.equal(state.timer, 45);
  assert.equal(state.running, false, "kendiliğinden başlamamalı");
  assert.deepEqual(state.completed, []);
  assert.equal(state.elapsedSeconds, 0);
});

test("set bitince dinlenmeye, dinlenme bitince sonraki sete geçer", () => {
  const afterSet = sessionReducer(open(), complete());
  assert.equal(afterSet.phase, "rest");
  assert.equal(afterSet.timer, 60);
  assert.equal(afterSet.currentSet, 1, "set sayacı dinlenme bitince artar");

  const afterRest = sessionReducer(afterSet, complete());
  assert.equal(afterRest.phase, "work");
  assert.equal(afterRest.currentSet, 2);
  assert.equal(afterRest.timer, 45);
});

test("son set bitince hareket tamamlanır", () => {
  // 1. set → dinlenme → 2. set → dinlenme → 3. set → bitti
  const state = run(open(), complete(), complete(), complete(), complete(), complete());
  assert.equal(state.phase, "done");
  assert.equal(state.timer, 0);
  assert.deepEqual(state.completed, [0], "tamamlanan hareket listeye girmeli");
});

test("süre sayacı kapalıyken dinlenme fazı hiç görünmez", () => {
  // Sayaç kapalı kullanıcı yalnız "seti tamamla"ya basar; beklenecek geri
  // sayım yok, doğrudan sonraki sete geçilir.
  const afterSet = sessionReducer(open(), complete(false));
  assert.equal(afterSet.phase, "work", "dinlenme fazına girilmemeli");
  assert.equal(afterSet.currentSet, 2);
  assert.equal(afterSet.timer, 0);
});

test("hareket atlanınca sıradaki açılır, atlananlar işaretlenir", () => {
  const state = sessionReducer(open(3, 0), { type: "skip", prescription: PRESCRIPTION });
  assert.deepEqual(state.skipped, [0]);
  assert.equal(state.activeIndex, 1);
  assert.equal(state.phase, "work");
  assert.equal(state.currentSet, 1);
});

test("son hareket atlanınca seans biter", () => {
  const state = sessionReducer(open(3, 2), { type: "skip", prescription: PRESCRIPTION });
  assert.deepEqual(state.skipped, [2]);
  assert.equal(state.activeIndex, 2, "ileride hareket yok");
  assert.equal(state.phase, "done");
  assert.equal(state.running, false);
});

test("harekete geçiş ilerlemeyi korur, açılış sıfırlar", () => {
  const progressed = run(open(), complete(), complete(), complete(), complete(), complete());
  assert.deepEqual(progressed.completed, [0]);

  const moved = sessionReducer(progressed, { type: "goTo", index: 1, prescription: PRESCRIPTION });
  assert.deepEqual(moved.completed, [0], "seans içinde ilerleme korunmalı");
  assert.equal(moved.currentSet, 1);

  const reopened = sessionReducer(moved, { type: "open", index: 0, queueLength: 3, prescription: PRESCRIPTION });
  assert.deepEqual(reopened.completed, [], "yeni seans ilerlemeyi sıfırlar");
  assert.equal(reopened.elapsedSeconds, 0);
});

// --- Saniyelik sayaç --------------------------------------------------------

test("sayaç yalnız çalışırken işler", () => {
  const idle = open();
  assert.equal(isCounting(idle, true), false, "duruyorken sayaç işlememeli");
  assert.equal(sessionReducer(idle, tick()), idle);

  const running = sessionReducer(idle, { type: "toggleRunning" });
  assert.equal(isCounting(running, true), true);
  const ticked = sessionReducer(running, tick());
  assert.equal(ticked.timer, 44);
  assert.equal(ticked.elapsedSeconds, 1);
});

test("süre sayacı kapalıyken geri sayım yok ama seans süresi işler", () => {
  // Aksi hâlde kaydedilen antrenman "1 saniye" olarak düşerdi.
  const state = open();
  assert.equal(isCounting(state, false), true, "sayaç kapalıyken de süre işlemeli");
  const ticked = sessionReducer(state, tick(false));
  assert.equal(ticked.elapsedSeconds, 1);
  assert.equal(ticked.calories > 0, true);
  assert.equal(ticked.timer, 45, "geri sayım olmamalı");
});

test("seans bitince süre sayacı kapalıyken de durur", () => {
  const done = run(open(), complete(false), complete(false), complete(false));
  assert.equal(done.phase, "done");
  assert.equal(isCounting(done, false), false);
  assert.equal(sessionReducer(done, tick(false)), done);
});

test("geri sayım bitince faz kendiliğinden ilerler", () => {
  const running = run(open(), { type: "toggleRunning" });
  // Sayacı 1'e indir, sonraki tık fazı çevirir.
  const atOne = { ...running, timer: 1 };
  const toRest = sessionReducer(atOne, tick());
  assert.equal(toRest.phase, "rest");
  assert.equal(toRest.timer, 60);
  assert.equal(toRest.running, true, "dinlenme geri sayımı sürer");

  const restDone = sessionReducer({ ...toRest, timer: 1 }, tick());
  assert.equal(restDone.phase, "work");
  assert.equal(restDone.currentSet, 2);
  assert.equal(restDone.running, false, "yeni set kendiliğinden başlamamalı");
});

test("son setin geri sayımı bitince hareket tamamlanır", () => {
  const lastSet = { ...open(), currentSet: 3, running: true, timer: 1 };
  const done = sessionReducer(lastSet, tick());
  assert.equal(done.phase, "done");
  assert.equal(done.running, false);
  assert.equal(done.timer, 0);
  assert.deepEqual(done.completed, [0]);
});

test("kalori her sayan saniyede birikir", () => {
  const running = run(open(), { type: "toggleRunning" });
  const after = run(running, tick(true, 0.25), tick(true, 0.25), tick(true, 0.25));
  assert.equal(after.elapsedSeconds, 3);
  assert.equal(Math.round(after.calories * 100) / 100, 0.75);
});

// --- Kayda giden liste ------------------------------------------------------

test("kaydederken bitmiş son hareket de sayılır", () => {
  // Kullanıcı son hareketi bitirip "Antrenmanı kaydet"e bastığında o hareket
  // henüz `completed` listesine girmemiş olabilir.
  const done = run(open(), complete(false), complete(false), complete(false));
  assert.equal(done.phase, "done");
  assert.deepEqual(completedForFinish(done), [0]);
});

test("atlanan hareket tamamlanmış sayılmaz", () => {
  const skipped = { ...open(3, 2), phase: "done", skipped: [2] };
  assert.deepEqual(completedForFinish(skipped), []);
});

test("bitmemiş seansta liste olduğu gibi kalır", () => {
  const midway = run(open(), complete());
  assert.equal(midway.phase, "rest");
  assert.deepEqual(completedForFinish(midway), []);
});

test("set sayısı azaltılınca aktif set geri çekilir", () => {
  const state = { ...open(), currentSet: 5 };
  assert.equal(sessionReducer(state, { type: "clampSet", totalSets: 3 }).currentSet, 3);
  // Artırmak aktif seti ileri taşımaz.
  assert.equal(sessionReducer(state, { type: "clampSet", totalSets: 8 }).currentSet, 5);
  // Değişiklik yoksa aynı nesne döner.
  const same = sessionReducer(state, { type: "clampSet", totalSets: 8 });
  assert.equal(same, state);
});

test("süre sayacı kapatılınca geri sayım durur, hareket bırakılmaz", () => {
  const running = run(open(), { type: "toggleRunning" });
  const stopped = sessionReducer(running, { type: "stop" });
  assert.equal(stopped.running, false);
  assert.equal(stopped.activeIndex, 0, "hareket açık kalmalı");
  // Zaten duruyorsa yeni nesne üretmez.
  assert.equal(sessionReducer(stopped, { type: "stop" }), stopped);
});
