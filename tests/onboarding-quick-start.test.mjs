import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CHECKPOINT_POSITION,
  ONBOARDING_FLOW,
  QUESTION,
  QUESTION_COUNT,
  QUESTIONS_SHOWN_BY_POSITION,
  QUICK_QUESTIONS,
  REQUIRED_QUESTIONS,
} from "../lib/onboarding-questions.ts";

test("akış her soruyu tam bir kez içerir", () => {
  const questionSlots = ONBOARDING_FLOW.filter((slot) => slot.kind === "question");
  assert.equal(questionSlots.length, QUESTION_COUNT);
  const indexes = questionSlots.map((slot) => slot.index).sort((a, b) => a - b);
  assert.deepEqual(indexes, Array.from({ length: QUESTION_COUNT }, (_, i) => i));
});

test("hızlı beşli akışın en başında ve sırasıyla durur", () => {
  const firstFive = ONBOARDING_FLOW.slice(0, QUICK_QUESTIONS.length);
  assert.deepEqual(firstFive.map((slot) => (slot.kind === "question" ? slot.index : null)), QUICK_QUESTIONS);
});

test("kontrol noktası hızlı beşliden hemen sonra, tek bir kez gelir", () => {
  assert.equal(CHECKPOINT_POSITION, QUICK_QUESTIONS.length);
  assert.deepEqual(ONBOARDING_FLOW[CHECKPOINT_POSITION], { kind: "checkpoint" });
  const checkpoints = ONBOARDING_FLOW.filter((slot) => slot.kind === "checkpoint");
  assert.equal(checkpoints.length, 1);
});

test("plan üretmeye yeten sorular hızlı beşlinin içinde", () => {
  // REQUIRED_QUESTIONS'ın hepsi hızlı sette olmalı, yoksa kontrol noktasında
  // "planı kur" düğmesi planı üretemeyen bir duruma düşerdi.
  for (const index of REQUIRED_QUESTIONS) assert.ok(QUICK_QUESTIONS.includes(index), `eksik: ${index}`);
  // Sakatlık da dahil: cevapsız kalırsa plan riskli hareketleri eleyemez.
  assert.ok(QUICK_QUESTIONS.includes(QUESTION.injuries));
});

test("kalan sorular orijinal sırasını korur", () => {
  const restIndexes = ONBOARDING_FLOW.slice(CHECKPOINT_POSITION + 1)
    .filter((slot) => slot.kind === "question")
    .map((slot) => slot.index);
  const sorted = [...restIndexes].sort((a, b) => a - b);
  assert.deepEqual(restIndexes, sorted, "kalan sorular karışmamalı");
});

test("ilerleme sayacı kontrol noktasında hızlı beşliyi gösterir", () => {
  assert.equal(QUESTIONS_SHOWN_BY_POSITION[CHECKPOINT_POSITION], QUICK_QUESTIONS.length);
  assert.equal(QUESTIONS_SHOWN_BY_POSITION[QUESTIONS_SHOWN_BY_POSITION.length - 1], QUESTION_COUNT);
  assert.equal(QUESTIONS_SHOWN_BY_POSITION[0], 1);
});

test("kontrol noktasında iki seçenek: planı kur ya da devam et", async () => {
  const app = await readFile(new URL("../components/FitAiApp.tsx", import.meta.url), "utf8");
  assert.match(app, /kind === "checkpoint"/);
  // Planı hemen kurmak createPlan'ı çağırır — normal son soru düğmesiyle aynı eylem.
  assert.match(app, /onClick=\{\(\) => void createPlan\(\)\}/);
});
