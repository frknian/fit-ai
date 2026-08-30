package com.hedefit.app.health

import org.junit.Assert.assertEquals
import org.junit.Test

class HealthConnectStepSelectionTest {
    @Test
    fun `Samsung Health total wins over combined aggregate`() {
        assertEquals(3_700, preferredHealthStepCount(samsungSteps = 3_700, allSteps = 6_300))
    }

    @Test
    fun `combined aggregate is fallback when Samsung has no data`() {
        assertEquals(6_300, preferredHealthStepCount(samsungSteps = null, allSteps = 6_300))
    }

    @Test
    fun `invalid totals are safely bounded`() {
        assertEquals(0, preferredHealthStepCount(samsungSteps = -5, allSteps = null))
        assertEquals(Int.MAX_VALUE, preferredHealthStepCount(samsungSteps = Long.MAX_VALUE, allSteps = null))
    }
}
