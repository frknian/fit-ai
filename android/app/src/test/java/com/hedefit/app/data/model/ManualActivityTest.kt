package com.hedefit.app.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ManualActivityTest {
    @Test
    fun `walking is first and distance increases confidence`() {
        val walking = manualActivityTypes.first()
        assertEquals("walking", walking.key)
        val estimate = estimateManualActivityEnergy(walking, ManualActivityInput("walking", 60, distanceKm = 5.8, notes = ""), 70.0)
        assertEquals("high", estimate.confidence)
        assertEquals("distance_pace", estimate.method)
        assertEquals(4.8, estimate.met, 0.01)
    }

    @Test
    fun `running pace selects a higher MET than brisk walking`() {
        val walking = manualActivityTypes.first { it.key == "walking" }
        val running = manualActivityTypes.first { it.key == "running" }
        val walk = estimateManualActivityEnergy(walking, ManualActivityInput("walking", 45, distanceKm = 4.0, notes = ""), 75.0)
        val run = estimateManualActivityEnergy(running, ManualActivityInput("running", 45, distanceKm = 7.5, notes = ""), 75.0)
        assertTrue(run.met > walk.met)
        assertTrue(run.activeCalories > walk.activeCalories)
    }

    @Test
    fun `swimming stroke and pace determine MET without effort question`() {
        val swimming = manualActivityTypes.first { it.key == "swimming" }
        val estimate = estimateManualActivityEnergy(swimming, ManualActivityInput("swimming", 30, distanceKm = 1.5, variantKey = "freestyle", notes = ""), 70.0)
        assertEquals(9.8, estimate.met, 0.01)
    }

    @Test
    fun `active calorie formula excludes one resting MET`() {
        val football = manualActivityTypes.first { it.key == "football" }
        val estimate = estimateManualActivityEnergy(football, ManualActivityInput("football", 60, variantKey = "match", notes = ""), 70.0)
        assertEquals(661, estimate.activeCalories)
        assertEquals("medium", estimate.confidence)
    }
}
