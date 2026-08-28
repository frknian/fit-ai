package com.hedefit.app.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NutritionTransformsTest {
    @Test fun favoriteIdIsNotReusedAsFoodForeignKey() {
        val favorite = FavoriteMealData(
            id = "543d5bed-6880-47b4-b0ff-7ba15141b455",
            name = "Yumurta",
            meal = "Kahvaltı",
            grams = 50.0,
            calories = 74,
            protein = 6.2,
            carbs = .5,
            fat = 5.0,
            fiber = 0.0,
            micros = mapOf("ironMg" to .9),
        )

        val repeat = favorite.asRepeatFood()
        assertEquals("", repeat.id)
        assertEquals(148, repeat.calories)
        assertEquals(12.4, repeat.protein, .001)
        assertTrue(repeat.verified)
    }
}
