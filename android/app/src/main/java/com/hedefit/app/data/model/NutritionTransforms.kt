package com.hedefit.app.data.model

fun FavoriteMealData.asRepeatFood(): FoodSearchData {
    val ratio = 100.0 / grams.coerceAtLeast(1.0)
    return FoodSearchData(
        id = "",
        name = name,
        brand = null,
        servingGrams = 100.0,
        calories = (calories * ratio).toInt(),
        protein = protein * ratio,
        carbs = carbs * ratio,
        fat = fat * ratio,
        fiber = fiber * ratio,
        sugar = (micros["sugar"] ?: 0.0) * ratio,
        sodiumMg = (micros["sodiumMg"] ?: 0.0) * ratio,
        potassiumMg = (micros["potassiumMg"] ?: 0.0) * ratio,
        calciumMg = (micros["calciumMg"] ?: 0.0) * ratio,
        ironMg = (micros["ironMg"] ?: 0.0) * ratio,
        vitaminCMg = (micros["vitaminCMg"] ?: 0.0) * ratio,
        verified = true,
        source = "favorite",
    )
}
