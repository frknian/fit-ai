package com.hedefit.app.data.model

data class ActivityVariant(val key: String, val titleTr: String, val titleEn: String, val met: Double)
data class ManualActivityType(val key: String, val emoji: String, val titleTr: String, val titleEn: String, val fallbackMet: Double, val variants: List<ActivityVariant> = emptyList())
data class ManualActivityInput(val activityKey: String, val durationMinutes: Int, val distanceKm: Double? = null, val inclinePercent: Double = 0.0, val variantKey: String? = null, val notes: String)
data class ActivityEnergyEstimate(val activeCalories: Int, val met: Double, val confidence: String, val method: String)

val manualActivityTypes = listOf(
    ManualActivityType("walking", "🚶", "Yürüyüş", "Walking", 3.8),
    ManualActivityType("running", "🏃", "Koşu", "Running", 8.0),
    ManualActivityType("cycling", "🚴", "Bisiklet", "Cycling", 6.8),
    ManualActivityType("swimming", "🏊", "Yüzme", "Swimming", 6.0, listOf(ActivityVariant("freestyle", "Serbest stil", "Freestyle", 5.8), ActivityVariant("breaststroke", "Kurbağalama", "Breaststroke", 5.3), ActivityVariant("backstroke", "Sırtüstü", "Backstroke", 4.8), ActivityVariant("butterfly", "Kelebek", "Butterfly", 13.8), ActivityVariant("open_water", "Açık su", "Open water", 6.0))),
    ManualActivityType("strength", "🏋️", "Kuvvet", "Strength", 5.0, listOf(ActivityVariant("traditional", "Geleneksel set", "Traditional sets", 5.0), ActivityVariant("circuit", "Devre antrenmanı", "Circuit training", 8.0))),
    ManualActivityType("yoga", "🧘", "Yoga", "Yoga", 2.5, listOf(ActivityVariant("hatha", "Hatha / klasik", "Hatha / traditional", 2.5), ActivityVariant("power", "Power yoga", "Power yoga", 4.0))),
    ManualActivityType("football", "⚽", "Futbol", "Football", 7.0, listOf(ActivityVariant("training", "Antrenman", "Training", 7.0), ActivityVariant("match", "Maç", "Match", 10.0))),
    ManualActivityType("basketball", "🏀", "Basketbol", "Basketball", 7.5, listOf(ActivityVariant("shooting", "Şut çalışması", "Shooting practice", 5.0), ActivityVariant("training", "Antrenman", "Training", 7.5), ActivityVariant("match", "Maç", "Game", 8.0))),
    ManualActivityType("tennis", "🎾", "Tenis", "Tennis", 7.0, listOf(ActivityVariant("doubles", "Çiftler", "Doubles", 5.0), ActivityVariant("singles", "Tekler", "Singles", 8.0))),
    ManualActivityType("boxing", "🥊", "Boks", "Boxing", 7.8, listOf(ActivityVariant("bag", "Kum torbası", "Punching bag", 5.8), ActivityVariant("sparring", "Sparring", "Sparring", 7.8), ActivityVariant("ring", "Maç", "Bout", 12.3))),
    ManualActivityType("volleyball", "🏐", "Voleybol", "Volleyball", 4.0, listOf(ActivityVariant("recreational", "Rekreasyon", "Recreational", 3.0), ActivityVariant("match", "Maç", "Match", 6.0))),
    ManualActivityType("pilates", "🤸", "Pilates", "Pilates", 3.0), ManualActivityType("hiking", "🥾", "Doğa Yürüyüşü", "Hiking", 6.0),
    ManualActivityType("rowing", "🚣", "Kürek", "Rowing", 5.8), ManualActivityType("dancing", "💃", "Dans", "Dancing", 5.5),
    ManualActivityType("hiit", "🔥", "HIIT", "HIIT", 9.0), ManualActivityType("snowboard", "🏂", "Snowboard", "Snowboard", 5.3),
)

fun estimateManualActivityEnergy(activity: ManualActivityType, input: ManualActivityInput, weightKg: Double?): ActivityEnergyEstimate {
    val minutes = input.durationMinutes.coerceIn(1, 600)
    val distance = input.distanceKm?.takeIf { it.isFinite() && it > 0.0 }
    val speedKmh = distance?.let { it / (minutes / 60.0) }
    val variantMet = activity.variants.firstOrNull { it.key == input.variantKey }?.met
    val measuredMet = when (activity.key) {
        "walking" -> speedKmh?.let { walkingMet(it, input.inclinePercent) }
        "running" -> speedKmh?.let { runningMet(it, input.inclinePercent) }
        "cycling" -> speedKmh?.let(::cyclingMet)
        "swimming" -> speedKmh?.let { swimmingMet(it * 1_000 / 60.0, input.variantKey) }
        "hiking" -> speedKmh?.let { walkingMet(it, input.inclinePercent).coerceAtLeast(5.3) }
        "rowing" -> speedKmh?.let { if (it < 6.4) 2.8 else if (it < 9.7) 5.8 else 12.5 }
        else -> null
    }
    val met = (measuredMet ?: variantMet ?: activity.fallbackMet).coerceIn(1.3, 23.0)
    val kg = (weightKg ?: 70.0).coerceIn(35.0, 250.0)
    val calories = (((met - 1.0).coerceAtLeast(0.0) * 3.5 * kg / 200.0) * minutes).toInt().coerceIn(1, 10_000)
    return ActivityEnergyEstimate(calories, met, if (measuredMet != null) "high" else if (variantMet != null) "medium" else "low", if (measuredMet != null) "distance_pace" else if (variantMet != null) "activity_variant" else "duration_fallback")
}

private fun walkingMet(speed: Double, incline: Double): Double = when { incline >= 6.0 -> 7.0; incline >= 1.0 -> 5.3; speed < 3.2 -> 2.3; speed < 4.5 -> 3.0; speed < 5.6 -> 3.8; speed < 6.4 -> 4.8; else -> 5.5 }
private fun runningMet(speed: Double, incline: Double): Double { val base = when { speed < 6.4 -> 6.0; speed < 8.0 -> 7.8; speed < 8.9 -> 8.5; speed < 9.7 -> 9.0; speed < 10.7 -> 9.3; speed < 11.3 -> 10.5; speed < 12.1 -> 11.0; speed < 12.9 -> 11.8; speed < 13.8 -> 12.0; speed < 14.6 -> 12.5; else -> 14.8 }; return if (incline >= 5.0) base + 3.0 else base }
private fun cyclingMet(speed: Double): Double = when { speed < 16 -> 4.0; speed < 19 -> 6.8; speed < 22 -> 8.0; speed < 26 -> 10.0; else -> 12.0 }
private fun swimmingMet(metersPerMinute: Double, variant: String?): Double { if (variant == "butterfly") return 13.8; if (variant == "breaststroke" && metersPerMinute >= 45) return 10.3; if (variant == "backstroke" && metersPerMinute >= 45) return 9.5; return when { metersPerMinute < 30 -> 5.8; metersPerMinute < 50 -> 8.0; metersPerMinute < 70 -> 9.8; else -> 10.5 } }
