package com.hedefit.app.ui.validation

enum class ProfileValidationError { NAME, AGE, HEIGHT, WEIGHT, GENDER }

fun validateProfileFields(
    name: String,
    ageText: String,
    heightText: String,
    heightCm: Double?,
    weightText: String,
    weightKg: Double?,
    gender: String,
): ProfileValidationError? = when {
    name.trim().length !in 2..60 -> ProfileValidationError.NAME
    ageText.isNotBlank() && ageText.toIntOrNull() !in 13..100 -> ProfileValidationError.AGE
    heightText.isNotBlank() && heightCm?.let { it in 100.0..250.0 } != true -> ProfileValidationError.HEIGHT
    weightText.isNotBlank() && weightKg?.let { it in 20.0..400.0 } != true -> ProfileValidationError.WEIGHT
    gender.length > 40 -> ProfileValidationError.GENDER
    else -> null
}
