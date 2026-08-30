package com.hedefit.app.ui.settings

import kotlin.math.abs
import kotlin.math.ceil

object MeasurementUnits {
    private const val KG_TO_LB = 2.2046226218
    private const val CM_TO_IN = 1.0 / 2.54
    private const val METERS_PER_MILE = 1609.344
    private const val ML_PER_FL_OZ = 29.5735295625

    fun isImperial(system: String) = system == "imperial"

    fun weightValue(kg: Double, system: String) = if (isImperial(system)) kg * KG_TO_LB else kg
    fun weightToKg(value: Double, system: String) = if (isImperial(system)) value / KG_TO_LB else value
    fun weightUnit(system: String) = if (isImperial(system)) "lb" else "kg"
    fun formatWeight(kg: Double, system: String, decimals: Int = 1): String = "%.${decimals}f %s".format(weightValue(kg, system), weightUnit(system))

    fun heightValue(cm: Double, system: String) = if (isImperial(system)) cm * CM_TO_IN else cm
    fun heightToCm(value: Double, system: String) = if (isImperial(system)) value / CM_TO_IN else value
    fun heightUnit(system: String) = if (isImperial(system)) "in" else "cm"

    fun formatLength(cm: Double, system: String, signed: Boolean = false): String {
        val value = heightValue(cm, system)
        val pattern = if (signed) "%+.1f %s" else "%.1f %s"
        return pattern.format(value, heightUnit(system))
    }

    fun formatDistance(meters: Double, system: String): String {
        val safeMeters = meters.takeIf { it.isFinite() && it >= 0.0 } ?: 0.0
        return if (isImperial(system)) "%.2f mi".format(safeMeters / METERS_PER_MILE) else "%.2f km".format(safeMeters / 1_000.0)
    }

    fun formatPace(secondsPerKm: Int?, system: String): String {
        val converted = secondsPerKm?.let { if (isImperial(system)) (it * 1.609344).toInt() else it }
        return converted?.let { "%d:%02d /%s".format(it / 60, it % 60, if (isImperial(system)) "mi" else "km") }
            ?: "— /${if (isImperial(system)) "mi" else "km"}"
    }

    fun formatWater(ml: Int, system: String): String = if (isImperial(system)) "%.0f fl oz".format(ml / ML_PER_FL_OZ) else "%.1f L".format(ml / 1_000.0)
}

fun estimatedGoalWeeks(currentKg: Double?, targetKg: Double?): Int? {
    if (currentKg == null || targetKg == null) return null
    val difference = abs(targetKg - currentKg)
    if (difference < 0.1) return 0
    // Genel yetişkin planında kilo kaybını başlangıç ağırlığının yaklaşık
    // %1'iyle hızlandır, ancak klinik gözetim olmadan 1 kg/haftayı aşma.
    val weeklyKg = if (targetKg < currentKg) (currentKg * 0.01).coerceIn(0.5, 1.0) else (currentKg * 0.003).coerceIn(0.15, 0.4)
    return ceil(difference / weeklyKg).toInt().coerceAtLeast(1)
}
