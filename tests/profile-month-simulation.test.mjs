import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalPlan, profileSignals } from "../app/api/generate-plan/route.ts";
import { getExercisesForProfile } from "../lib/exercise-service.ts";
import { planGoal, projectWeightSeries } from "../lib/goal-plan.ts";
import { QUESTION, emptyHistory } from "../lib/onboarding-questions.ts";

const TODAY = new Date("2026-08-01T12:00:00Z");

function history({ goal, days, minutes, styles, location, equipment, injuries, level = "Başlangıç" }) {
  const answers = emptyHistory();
  answers[QUESTION.goal] = goal;
  answers[QUESTION.level] = level;
  answers[QUESTION.recentFrequency] = "0 gün";
  answers[QUESTION.availableDays] = `${days} gün`;
  answers[QUESTION.sessionMinutes] = `${minutes} dk`;
  answers[QUESTION.trainingStyles] = styles;
  answers[QUESTION.location] = location;
  answers[QUESTION.equipment] = equipment;
  answers[QUESTION.injuries] = injuries;
  answers[QUESTION.dailyMovement] = "Ara sıra hareket";
  answers[QUESTION.sleep] = "7–8 saat";
  return answers;
}

function simulateProfile(config) {
  const answers = history(config);
  const signals = profileSignals({
    history: answers,
    environment: config.location,
    equipment: config.equipment,
    goal: config.goal,
  });
  const catalog = getExercisesForProfile(
    /salon|gym/i.test(config.location),
    config.equipment,
    config.location,
    config.styles,
  );
  const workout = buildLocalPlan(signals, catalog, "tr");
  const nutrition = planGoal({
    targetWeightKg: config.targetWeightKg,
    weeklyDays: config.days,
    sessionMinutes: config.minutes,
    intensity: config.intensity,
  }, { currentWeightKg: config.weightKg, bmr: config.bmr, today: TODAY });
  assert.equal(nutrition.status, "ready");
  const month = projectWeightSeries(config.weightKg, nutrition.weeklyRateKg, config.targetWeightKg, 4).at(-1);
  return { signals, catalog, workout, nutrition, month };
}

test("beş profil bir aylık antrenman ve beslenme simülasyonunda güvenli kısıtlarını korur", () => {
  const homeLoss = simulateProfile({
    goal: "Kilo verme", weightKg: 86, targetWeightKg: 80, bmr: 1650, days: 4, minutes: 45,
    intensity: "steady", styles: "Vücut ağırlığı • HIIT", location: "Evde", equipment: "Ekipman yok", injuries: "Yok",
  });
  assert.equal(homeLoss.workout.weeklySchedule.length, 4);
  assert.ok(homeLoss.workout.workouts.every((item) => {
    const exercise = homeLoss.catalog.find((candidate) => candidate.id === item.id);
    return ["body only", "", "other"].includes(exercise?.equipment ?? "");
  }), "ev profiline salon ekipmanı girmemeli");
  assert.ok(homeLoss.nutrition.dailyIntakeKcal < homeLoss.nutrition.maintenanceKcal, "kilo verme beslenmesi bakımın altında olmalı");
  assert.ok(homeLoss.month.weightKg < 86);

  const gymMuscle = simulateProfile({
    goal: "Kas alma", weightKg: 70, targetWeightKg: 73, bmr: 1700, days: 4, minutes: 60,
    intensity: "steady", styles: "Ağırlık", location: "Spor salonunda", equipment: "Tam salon", injuries: "Yok", level: "Orta",
  });
  assert.equal(gymMuscle.workout.weeklySchedule.length, 4);
  assert.ok(gymMuscle.catalog.some((item) => ["barbell", "cable", "machine"].includes(item.equipment ?? "")), "salon kataloğu tam ekipmanı içermeli");
  assert.ok(gymMuscle.nutrition.dailyIntakeKcal > gymMuscle.nutrition.maintenanceKcal, "kas/kilo alma beslenmesi bakımın üstünde olmalı");
  assert.ok(gymMuscle.month.weightKg > 70);

  const injurySafe = simulateProfile({
    goal: "Formu koruma", weightKg: 78, targetWeightKg: 75, bmr: 1600, days: 3, minutes: 30,
    intensity: "easy", styles: "Vücut ağırlığı", location: "Evde", equipment: "Ekipman yok", injuries: "Diz • Omuz",
  });
  assert.equal(injurySafe.signals.painAreas, "Diz • Omuz");
  assert.ok(injurySafe.workout.workouts.every((item) => !/jump|squat|lunge|leg press|pistol|step-up|overhead|shoulder press|military press|dip|upright row/i.test(item.english)), "diz ve omuz için riskli kalıplar elenmeli");

  const weightGain = simulateProfile({
    goal: "Kilo alma", weightKg: 60, targetWeightKg: 63, bmr: 1500, days: 3, minutes: 45,
    intensity: "steady", styles: "Ağırlık • Vücut ağırlığı", location: "Evde", equipment: "Dambıl", injuries: "Yok",
  });
  assert.ok(weightGain.nutrition.dailyIntakeKcal > weightGain.nutrition.maintenanceKcal);
  assert.ok(weightGain.month.weightKg > 60);

  const outdoorRunner = simulateProfile({
    goal: "Kilo verme", weightKg: 92, targetWeightKg: 88, bmr: 1800, days: 3, minutes: 15,
    intensity: "steady", styles: "Koşu", location: "Açık havada", equipment: "Ekipman yok", injuries: "Yok",
  });
  assert.ok(outdoorRunner.workout.workouts.length >= 3);
  assert.ok(outdoorRunner.workout.workouts.every((item) => /run|jog|sprint|walk/i.test(item.english)), "açık hava koşu profiline yalnız koşu/yürüyüş kalıpları gelmeli");
  assert.equal(outdoorRunner.workout.weeklySchedule.length, 3);
});
