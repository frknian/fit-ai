package com.hedefit.app.steps

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StepRepositoryTest {
    @Test fun healthConnectAlwaysWinsAndIsNeverAddedToLocalSensor() {
        assertEquals(StepSource.HEALTH_CONNECT, preferredStepSource(healthConnectAvailable = true, hasCounter = true, hasDetector = true))
    }

    @Test fun nativeCounterUsesDailyBaselineInsteadOfItsLifetimeTotal() {
        val first = nextNativeStepCounterState(NativeStepCounterState("2026-08-28", 43_200f, 0), "2026-08-28", 48_350f)
        assertEquals(5_150, first.todaySteps)
    }

    @Test fun newDayResetsVisibleCount() {
        val next = nextNativeStepCounterState(NativeStepCounterState("2026-08-28", 48_350f, 5_150), "2026-08-29", 48_400f)
        assertEquals(0, next.todaySteps)
    }

    @Test fun rebootCounterResetNeverCreatesNegativeSteps() {
        val afterReboot = nextNativeStepCounterState(NativeStepCounterState("2026-08-28", 38_000f, 2_400), "2026-08-28", 120f)
        assertEquals(2_400, afterReboot.todaySteps)
        assertTrue(afterReboot.todaySteps >= 0)
    }

    @Test fun unavailableHardwareDoesNotInventSteps() {
        assertEquals(StepSource.UNAVAILABLE, preferredStepSource(false, false, false))
    }
}
