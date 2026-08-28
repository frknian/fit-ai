// Deterministik antrenman kararları. Model yalnızca sonuçları açıklar.
export type PerformanceSet = { weightKg?: number; reps?: number; rpe?: number };
export type RecentSession = { completedAt: string; fatigue?: number; durationMinutes?: number };

export function progressionSuggestion(sets: PerformanceSet[], prescribedReps?: string) {
  const usable = sets.filter((set) => typeof set.reps === "number" && set.reps > 0);
  if (!usable.length) return undefined;
  const latest = usable[usable.length - 1];
  const target = prescribedReps?.match(/(\d+)\D+(\d+)/);
  const low = target ? Number(target[1]) : 8;
  const high = target ? Number(target[2]) : 12;
  const reachedTop = usable.every((set) => (set.reps ?? 0) >= high) && (latest.rpe ?? 8) <= 8;
  if (reachedTop && latest.weightKg && latest.weightKg > 0) {
    const increment = latest.weightKg >= 50 ? 2.5 : 1.25;
    return { action: "increase_weight", suggestedWeightKg: Math.round((latest.weightKg + increment) * 100) / 100, targetReps: `${low}–${high}`, reason: "Son çalışma setleri hedef tekrarın üst sınırına kontrollü ulaştı." };
  }
  if ((latest.reps ?? 0) < high) return { action: "add_reps", targetReps: `${Math.min(high, (latest.reps ?? low) + 1)}–${high}`, reason: "Önce aynı yükte tekrar kalitesini artır." };
  return { action: "hold", suggestedWeightKg: latest.weightKg, targetReps: `${low}–${high}`, reason: "Yükü sabitle; aynı form ve eforla tekrar et." };
}

export function recoveryScore(input: { sleepMinutes?: number; steps?: number; sessions?: RecentSession[]; todayVolumeSets?: number; fatigue?: number }) {
  let score = 72;
  if (input.sleepMinutes !== undefined) score += input.sleepMinutes >= 420 ? 12 : input.sleepMinutes >= 360 ? 3 : input.sleepMinutes >= 300 ? -8 : -18;
  const fatigue = input.fatigue ?? input.sessions?.[0]?.fatigue;
  if (fatigue !== undefined) score -= Math.max(0, fatigue - 3) * 7;
  const last = input.sessions?.[0]?.completedAt ? new Date(input.sessions[0].completedAt).getTime() : undefined;
  if (last && Date.now() - last < 18 * 3_600_000) score -= 12;
  if ((input.todayVolumeSets ?? 0) >= 18) score -= 8;
  if ((input.steps ?? 0) > 18_000) score -= 5;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const decision = score >= 75 ? "heavy" : score >= 50 ? "moderate" : "rest";
  const reason = decision === "heavy" ? "Toparlanma sinyalleri ağır çalışma için yeterli." : decision === "moderate" ? "Bugün hacmi veya yükü biraz azaltarak ilerle." : "Toparlanma öncelikli; dinlenme ya da çok hafif hareket seç.";
  return { score, decision, reason };
}

const areaKey = (area = "") => area.toLocaleLowerCase("tr-TR").replaceAll("ı", "i");
export function weeklyVolume(exercises: Array<{ area?: string; sets?: number }>) {
  const totals: Record<string, number> = {};
  for (const exercise of exercises) {
    const key = areaKey(exercise.area) || "diğer";
    totals[key] = (totals[key] ?? 0) + Math.max(0, Math.min(20, exercise.sets ?? 0));
  }
  return Object.entries(totals).map(([area, sets]) => ({ area, sets, status: sets < 8 ? "low" : sets > 20 ? "high" : "balanced" }));
}
