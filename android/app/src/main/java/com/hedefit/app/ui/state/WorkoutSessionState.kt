package com.hedefit.app.ui.state

import com.hedefit.app.data.model.WorkoutSetInput
import java.nio.charset.StandardCharsets
import java.util.Base64

fun prescribedStartingReps(prescription: String?): Int =
    Regex("\\d+").find(prescription.orEmpty())?.value?.toIntOrNull()?.coerceIn(1, 100) ?: 10

fun validateWorkoutSets(value: String): String? =
    if (value.toIntOrNull() in 1..10) null else "Set sayısı 1 ile 10 arasında olmalı."

fun validateWorkoutReps(value: String): String? =
    if (value.trim().isNotEmpty() && value.trim().length <= 12) null else "Tekrar hedefini yaz."

fun validateWorkoutRest(value: String): String? =
    if (value.toIntOrNull() in 15..300) null else "Dinlenme 15 ile 300 saniye arasında olmalı."

fun canFinishWorkout(completedSetCount: Int): Boolean = completedSetCount > 0

private fun encodeText(value: String): String = Base64.getUrlEncoder().withoutPadding().encodeToString(value.toByteArray(StandardCharsets.UTF_8))
private fun decodeText(value: String): String = String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8)

fun WorkoutSetInput.toSavedWorkoutSet(): String = listOf(
    encodeText(exerciseId),
    encodeText(exerciseName),
    exerciseOrder.toString(),
    setNumber.toString(),
    weightKg?.toString().orEmpty(),
    reps?.toString().orEmpty(),
    durationSeconds?.toString().orEmpty(),
    rpe?.toString().orEmpty(),
    encodeText(setType),
    encodeText(note),
).joinToString("|")

fun savedWorkoutSet(value: String): WorkoutSetInput? = runCatching {
    val fields = value.split('|')
    require(fields.size == 10)
    WorkoutSetInput(
        exerciseId = decodeText(fields[0]),
        exerciseName = decodeText(fields[1]),
        exerciseOrder = fields[2].toInt(),
        setNumber = fields[3].toInt(),
        weightKg = fields[4].toDoubleOrNull(),
        reps = fields[5].toIntOrNull(),
        durationSeconds = fields[6].toIntOrNull(),
        rpe = fields[7].toIntOrNull(),
        setType = decodeText(fields[8]),
        note = decodeText(fields[9]),
    )
}.getOrNull()
