package com.hedefit.app.ui.validation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NutritionValidationTest {
    @Test fun emptyAndOutOfRangeGramsAreRejected() {
        assertEquals("Geçerli bir gramaj yaz.", validateFoodGrams(""))
        assertEquals("Gramaj 0 ile 5000 arasında olmalı.", validateFoodGrams("0"))
        assertEquals("Gramaj 0 ile 5000 arasında olmalı.", validateFoodGrams("5001"))
    }

    @Test fun realisticDecimalGramsPass() {
        assertNull(validateFoodGrams("62.5"))
    }
}
