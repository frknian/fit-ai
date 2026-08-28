package com.hedefit.app.route

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteTrackingStateTest {
    private val start = RoutePoint(41.0082, 28.9784, 0.0, 1_000L, 4.0)

    @Test fun impossibleGpsJumpIsRejectedForRunning() {
        val jump = RoutePoint(41.0182, 28.9784, 0.0, 3_000L, 4.0)
        assertNull(acceptedRouteSegmentMeters(start, jump, "Koşu"))
    }

    @Test fun plausibleMovementIsAcceptedAndJitterAddsNoDistance() {
        val next = RoutePoint(41.00825, 28.9784, 0.0, 3_000L, 4.0)
        assertNotNull(acceptedRouteSegmentMeters(start, next, "Koşu"))
        val jitter = RoutePoint(41.008201, 28.9784, 0.0, 3_000L, 8.0)
        assertEquals(0.0, acceptedRouteSegmentMeters(start, jitter, "Koşu")!!, 0.001)
    }

    @Test fun emptyRouteCannotBeSaved() {
        assertFalse(canSaveRoute(RouteSnapshot(tracking = true)))
        assertTrue(canSaveRoute(RouteSnapshot(distanceMeters = 10.0, points = listOf(start, start.copy(recordedAt = 3_000L)))))
    }

    @Test fun legacyOrInvalidAccuracyIsSafeToPersist() {
        assertEquals(0.0, normalizeAccuracyMeters(Double.NaN), 0.0)
        assertEquals(0.0, normalizeAccuracyMeters(Double.POSITIVE_INFINITY), 0.0)
        assertEquals(5.5, normalizeAccuracyMeters(5.5), 0.0)
    }

    @Test fun routeOnlyAcceptsFreshGpsQualityAccuracy() {
        assertTrue(isPreciseRouteLocation(4.5f))
        assertTrue(isPreciseRouteLocation(MAX_ROUTE_ACCURACY_METERS))
        assertFalse(isPreciseRouteLocation(20.1f))
        assertFalse(isPreciseRouteLocation(Float.NaN))
        assertFalse(isPreciseRouteLocation(5f, hasAccuracy = false))
    }

    @Test fun movingDurationExcludesPausedTime() {
        val snapshot = RouteSnapshot(tracking = false, startedAt = 1_000L, stoppedAt = 11_000L, pausedDurationMs = 3_000L)
        assertEquals(7, snapshot.durationSeconds)
        assertEquals(10, snapshot.elapsedDurationSeconds)
    }

    @Test fun liveSpeedUsesRollingMedianInsteadOfLastPointSpike() {
        val points = listOf(
            RoutePoint(41.00000, 29.00000, 0.0, 1_000L),
            RoutePoint(41.00005, 29.00000, 0.0, 3_000L),
            RoutePoint(41.00010, 29.00000, 0.0, 5_000L),
            RoutePoint(41.00110, 29.00000, 0.0, 7_000L),
            RoutePoint(41.00115, 29.00000, 0.0, 9_000L),
            RoutePoint(41.00120, 29.00000, 0.0, 11_000L),
        )
        val speed = RouteSnapshot(points = points).currentSpeedKmh
        assertTrue(speed in 7.0..12.0)
    }

    @Test fun activityStateIsDerivedWithoutInvalidCombinations() {
        assertEquals(ActivitySessionStatus.IDLE, RouteSnapshot().status)
        assertEquals(ActivitySessionStatus.ACTIVE, RouteSnapshot(tracking = true).status)
        assertEquals(ActivitySessionStatus.PAUSED, RouteSnapshot(tracking = true, paused = true).status)
        assertEquals(ActivitySessionStatus.COMPLETED, RouteSnapshot(stoppedAt = 2_000L, points = listOf(start)).status)
    }
}
