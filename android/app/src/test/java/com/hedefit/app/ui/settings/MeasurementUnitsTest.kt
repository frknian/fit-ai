package com.hedefit.app.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Test

class MeasurementUnitsTest {
    @Test
    fun `weight loss duration uses a gradual but not excessively slow range`() {
        assertEquals(7, estimatedGoalWeeks(60.0, 56.0))
        assertEquals(6, estimatedGoalWeeks(100.0, 94.0))
    }

    @Test
    fun `equal weights need no additional week`() {
        assertEquals(0, estimatedGoalWeeks(75.0, 75.0))
    }
}
