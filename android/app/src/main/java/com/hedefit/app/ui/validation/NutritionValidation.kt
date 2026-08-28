package com.hedefit.app.ui.validation

fun validateFoodGrams(value: String): String? {
    val grams = value.toDoubleOrNull() ?: return "Geçerli bir gramaj yaz."
    return if (grams <= 0 || grams > 5_000) "Gramaj 0 ile 5000 arasında olmalı." else null
}
