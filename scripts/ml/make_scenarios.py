#!/usr/bin/env python3
"""Hedefit distilasyon senaryolarını üretir (öğretmene sorulacak girdiler).

TASARIM: 48 senaryoluk benchmark kümesi TUTULAN (held-out) settir; buradaki
üretim ondan tamamen ayrıktır. Benchmark sorularının metni bu dosyada geçmez ve
üretilen her senaryo, benchmark sorularıyla birebir çakışmadığı kontrol edilerek
kabul edilir.

Çeşitlilik programatiktir: profil, hedef, günlük veri, trend, hafıza ve soru
kalıpları çaprazlanır. Amaç modelin ezberlemesi değil, DAVRANIŞI öğrenmesi:
verilen sayıyı kullan, olmayan veriyi uydurma, tercihe uy, kısa ve Türkçe yaz.
"""
import argparse, hashlib, json, pathlib, random

ROOT = pathlib.Path(__file__).resolve().parents[2]
BENCH = ROOT / ".benchmark" / "hedefit-benchmark-input.json"

# --- Soru kalıpları (benchmark sorularından FARKLI ifadeler) ------------------
Q_COACH = [
    "Bugün antrenman yapayım mı?", "Şu an ne yapmamı önerirsin?",
    "Bugünkü durumum nasıl görünüyor?", "Akşam için bir plan verir misin?",
    "Yarına nasıl hazırlanmalıyım?", "Bugün ağırlık mı kardiyo mu?",
    "Kendimi iyi hissediyorum, yükü artırayım mı?", "Bugün dinlenmeli miyim?",
    "Antrenmana başlamadan önce ne yapmalıyım?", "Haftayı nasıl kapatayım?",
]
Q_CAL = [
    "Beslenmem bugün nasıl gidiyor?", "Ne kadar kalorim kaldı?",
    "Akşam yemeğinde ne kadar alan var?", "Proteinimi tutturabildim mi?",
    "Bugün fazla mı yedim?", "Kalori hedefime yaklaştım mı?",
    "Ara öğün alabilir miyim?", "Makrolarım dengeli mi?",
]
Q_WEIGHT = [
    "Kilo değişimim nasıl?", "İlerlemem yeterli mi?",
    "Hedefime ne kadar kaldı?", "Bu tempo sağlıklı mı?",
    "Tartı kıpırdamıyor, sorun ne?", "Son haftalarda ne değişti?",
]
Q_ACT = [
    "Bugün yeterince hareket ettim mi?", "Adım hedefimi tutturdum mu?",
    "Bu hafta kaç antrenman yaptım?", "Yürüyüş yeterli mi?",
]
Q_MOT = [
    "Hiç enerjim yok.", "Motivasyonum düştü.", "Devam etmek zor geliyor.",
    "Bugün canım istemiyor.", "Sürekli aksatıyorum.", "Kendimi yetersiz hissediyorum.",
]
Q_PREF = [
    "Bana uygun bir kardiyo öner.", "Ne tür antrenman yapayım?",
    "Hangi hareketleri seçmeliyim?", "Protein için ne yiyebilirim?",
    "Evde ne yapabilirim?", "Programımı nasıl kurayım?",
]

SEX = ["male", "female"]
GOALS = ["lose", "fatLoss", "maintain", "gain"]

MEMORY_POOL = [
    ("exercise_preference", "koşu", "dislike"), ("exercise_preference", "yürüyüş", "like"),
    ("exercise_preference", "bisiklet", "like"), ("exercise_preference", "burpee", "dislike"),
    ("exercise_preference", "yüzme", "like"), ("exercise_preference", "ip atlama", "dislike"),
    ("food_preference", "kırmızı et", "dislike"), ("food_preference", "vejetaryen", "like"),
    ("food_preference", "balık", "like"), ("food_preference", "süt ürünleri", "dislike"),
    ("schedule_preference", "sabah", "like"), ("schedule_preference", "akşam", "like"),
    ("equipment", "dambıl", "var"), ("equipment", "direnç bandı", "var"), ("equipment", "salon üyeliği", "yok"),
    ("constraint", "diz", "sakatlık"), ("constraint", "bel", "hassas"), ("constraint", "omuz", "eski sakatlık"),
    ("habit", "akşam yürüyüşü", "düzenli"), ("motivation_pattern", "kısa hedefler", "işe yarıyor"),
]


# Eksik veri senaryolarında soru, eksik olan alanı DOĞRUDAN hedeflemelidir.
#
# İlk sürümde soru rastgele havuzdan seçiliyordu; "adım verisi yok" senaryosuna
# "Bugün antrenman yapayım mı?" sorusu düşüyordu. Koçun o soruda adımdan hiç
# söz etmemesi DOĞRU davranıştır — yani veri, öğrenciye yanlış şey öğretiyordu.
# Benchmark'ın E grubunda soru her zaman eksik alanı sorar; eğitim verisi de
# aynı durumu temsil etmeli.
MISSING_QUESTIONS = {
    "steps": ["Bugün kaç adım attım?", "Adım sayım ne durumda?", "Adımlarım nasıl gidiyor?"],
    "calories": ["Bugün kaç kalori aldım?", "Kalori durumum ne?", "Bugün ne kadar yedim?"],
    "weight": ["Kilom ne durumda?", "Şu an kaç kiloyum?", "Kilo değişimim ne oldu?"],
    "workouts": ["Bu hafta kaç antrenman yaptım?", "Antrenman sayım kaç?"],
    "protein": ["Bugün ne kadar protein aldım?", "Protein durumum nasıl?"],
}


def facts_full(rng: random.Random) -> dict:
    weight = round(rng.uniform(52, 108), 1)
    height = rng.randint(152, 194)
    target = round(weight - rng.uniform(-6, 12), 1)
    calorie_target = rng.choice([1600, 1750, 1800, 1900, 2000, 2100, 2200, 2400, 2600, 2800])
    consumed = rng.randint(300, calorie_target + 400)
    protein_target = int(weight * rng.choice([1.6, 1.8, 2.0, 2.2]))
    return {
        "profile": {"age": rng.randint(18, 64), "sex": rng.choice(SEX), "heightCm": height,
                     "weightKg": weight, "bmi": round(weight / ((height / 100) ** 2), 1)},
        "goals": {"goalType": rng.choice(GOALS), "targetWeightKg": target,
                   "calorieTarget": calorie_target, "proteinTargetGrams": protein_target,
                   "weightToGoalKg": round(weight - target, 1)},
        "today": {"caloriesConsumed": consumed, "remainingCalories": max(0, calorie_target - consumed),
                   "steps": rng.randint(800, 19000), "proteinGrams": rng.randint(10, protein_target + 30)},
        "trends": {"weightChange7dKg": round(rng.uniform(-1.4, 0.9), 1),
                    "averageSteps7d": rng.randint(2000, 16000),
                    "averageCalories7d": calorie_target + rng.randint(-350, 350)},
        "activity": {"workoutsThisWeek": rng.randint(0, 6),
                      "walkingDistanceKm": round(rng.uniform(0, 9), 1)},
    }


def facts_missing(rng: random.Random, missing: list[str]) -> dict:
    """Eksik veri senaryosu: ilgili alanlar HİÇ yok, 'unavailable' ile işaretli."""
    base = facts_full(rng)
    for field in missing:
        if field == "steps":
            base["today"].pop("steps", None); base["trends"].pop("averageSteps7d", None)
        elif field == "calories":
            base["today"].pop("caloriesConsumed", None); base["today"].pop("remainingCalories", None)
            base["goals"].pop("calorieTarget", None)
        elif field == "weight":
            base["profile"].pop("weightKg", None); base["profile"].pop("bmi", None)
            base["trends"].pop("weightChange7dKg", None); base["goals"].pop("weightToGoalKg", None)
        elif field == "workouts":
            base["activity"].pop("workoutsThisWeek", None)
        elif field == "protein":
            base["today"].pop("proteinGrams", None); base["goals"].pop("proteinTargetGrams", None)
    base = {k: v for k, v in base.items() if v}
    base["unavailable"] = missing
    return base


def build(count: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    banned = {s["question"].strip().lower() for s in json.loads(BENCH.read_text())["scenarios"]}
    out, seen = [], set()

    kinds = (
        [("coach", Q_COACH, "simple_coaching")] * 5
        + [("calorie", Q_CAL, "nutrition_explanation")] * 5
        + [("weight", Q_WEIGHT, "goal_progress")] * 4
        + [("activity", Q_ACT, "activity_summary")] * 3
        + [("motivation", Q_MOT, "motivation")] * 3
        + [("preference", Q_PREF, "simple_coaching")] * 4
        + [("missing", Q_COACH + Q_CAL + Q_WEIGHT + Q_ACT, "simple_coaching")] * 5
    )

    while len(out) < count:
        kind, pool, category = rng.choice(kinds)
        question = rng.choice(pool)

        if kind == "missing":
            # Tek alan eksik + o alanı soran soru: benchmark E grubuyla aynı durum.
            field = rng.choice(list(MISSING_QUESTIONS))
            missing = [field]
            question = rng.choice(MISSING_QUESTIONS[field])
            facts = facts_missing(rng, missing)
        else:
            facts = facts_full(rng)

        memories = []
        if kind == "preference" or rng.random() < 0.45:
            memories = [{"type": t, "key": k, "value": v}
                        for t, k, v in rng.sample(MEMORY_POOL, rng.randint(1, 3))]

        if question.strip().lower() in banned:
            continue

        key = hashlib.sha256(
            (question + json.dumps(facts, sort_keys=True) + json.dumps(memories, sort_keys=True)).encode()
        ).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        out.append({"id": f"{kind}-{len(out):05d}", "kind": kind, "category": category,
                     "question": question, "facts": facts, "memories": memories})
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=4000)
    ap.add_argument("--seed", type=int, default=20260819)
    ap.add_argument("--out", default=".hedefit-ml/data/scenarios.json")
    args = ap.parse_args()
    data = build(args.count, args.seed)
    p = pathlib.Path(args.out); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    from collections import Counter
    print(f"{len(data)} senaryo → {p}")
    print("dağılım:", dict(Counter(d["kind"] for d in data)))
