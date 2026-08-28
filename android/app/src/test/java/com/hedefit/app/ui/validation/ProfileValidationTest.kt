package com.hedefit.app.ui.validation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProfileValidationTest {
    @Test fun impossibleProfileValuesAreRejected() {
        assertEquals(ProfileValidationError.NAME, validateProfileFields("", "30", "180", 180.0, "80", 80.0, ""))
        assertEquals(ProfileValidationError.AGE, validateProfileFields("Sporcu", "250", "180", 180.0, "80", 80.0, ""))
        assertEquals(ProfileValidationError.HEIGHT, validateProfileFields("Sporcu", "30", "999", 999.0, "80", 80.0, ""))
        assertEquals(ProfileValidationError.WEIGHT, validateProfileFields("Sporcu", "30", "180", 180.0, "0", 0.0, ""))
    }

    @Test fun optionalAndRealisticValuesPass() {
        assertNull(validateProfileFields("Uzman Sporcu", "", "", null, "82.5", 82.5, ""))
    }
}
