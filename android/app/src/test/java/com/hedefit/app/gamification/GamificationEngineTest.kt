package com.hedefit.app.gamification

import com.hedefit.app.data.model.DailyStepData
import com.hedefit.app.data.model.RouteActivityData
import com.hedefit.app.data.model.WorkoutSessionData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class GamificationEngineTest {
    private val monday = LocalDate.of(2026, 8, 24)
    private val zone = ZoneId.of("Europe/Istanbul")

    @Test fun `duplicate source is rewarded once`() {
        val workout = workout("same", "2026-08-24T06:00:00Z")
        val snapshot = snapshot(sessions = listOf(workout, workout))
        assertEquals(40, snapshot.totalXp)
    }

    @Test fun `workout step and full route kilometers award configured xp`() {
        val snapshot = snapshot(
            sessions = listOf(workout("w1", "2026-08-24T06:00:00Z")),
            steps = listOf(DailyStepData(monday, 8_000)),
            routes = listOf(route("r1", "2026-08-24T07:00:00Z", 2_950.0)),
            todaySteps = 8_000,
        )
        assertEquals(100, snapshot.totalXp)
    }

    @Test fun `level curve retains permanent xp progress`() {
        assertEquals(LevelProgress(1, 299, 300, 299f / 300f), GamificationEngine.levelFor(299))
        assertEquals(2, GamificationEngine.levelFor(300).level)
        assertEquals(0, GamificationEngine.levelFor(300).currentXp)
        assertEquals(350, GamificationEngine.levelFor(300).nextLevelXp)
    }

    @Test fun `planned rest days do not break a reachable weekly streak`() {
        val active = setOf(monday, monday.plusDays(2), monday.plusDays(4))
        val friday = monday.plusDays(4)
        assertEquals(5, GamificationEngine.goalAwareStreak(friday, active, weeklyGoal = 3))
    }

    @Test fun `missed completed week breaks streak`() {
        val currentMonday = monday.plusWeeks(1)
        val active = setOf(monday, currentMonday)
        assertEquals(1, GamificationEngine.goalAwareStreak(currentMonday, active, weeklyGoal = 3))
    }

    @Test fun `habit strength is always bounded`() {
        assertTrue(snapshot().habitStrength in 0..100)
        val denseSteps = (0L..29L).map { DailyStepData(monday.minusDays(it), 20_000) }
        assertTrue(snapshot(steps = denseSteps).habitStrength in 0..100)
    }

    @Test fun `achievement and weekly challenge have one stable completion`() {
        val routes = listOf(
            route("r1", "2026-08-24T06:00:00Z", 8_000.0),
            route("r1", "2026-08-24T06:00:00Z", 8_000.0),
            route("r2", "2026-08-25T06:00:00Z", 7_000.0),
        )
        val result = snapshot(routes = routes)
        assertTrue(result.challenge.completed)
        assertEquals(1, result.achievements.count { it.id == "first_activity" && it.unlockedAt != null })
        assertEquals(1, GamificationEngine.xpEvents(input(routes = routes)).distinctBy { it.source to it.sourceId }.count { it.source == XpSource.WEEKLY_CHALLENGE_COMPLETED })
    }

    @Test fun `daily task rotation always totals one hundred xp`() {
        val today = monday.plusDays(2)
        val result = GamificationEngine.snapshot(input(today = today))
        assertEquals(100, result.dailyQuests.sumOf { it.xp })
        val tomorrow = GamificationEngine.snapshot(input(today = today.plusDays(1)))
        assertTrue(result.dailyQuests.map { it.id } != tomorrow.dailyQuests.map { it.id })
    }

    @Test fun `ai question rewards follow transparent xp thresholds`() {
        assertEquals(0, GamificationEngine.aiRewardFor(299).extraQuestions)
        assertEquals(1, GamificationEngine.aiRewardFor(300).extraQuestions)
        assertEquals(2, GamificationEngine.aiRewardFor(500).extraQuestions)
        assertEquals(3, GamificationEngine.aiRewardFor(750).extraQuestions)
    }

    @Test fun `achievement catalogue contains twenty four rewards of one hundred xp`() {
        val result = snapshot()
        assertEquals(24, result.achievements.size)
        assertTrue(result.achievements.all { it.rewardXp == 100 })
    }

    @Test fun `timezone and monday boundary keep events in correct week`() {
        val lateSundayUtc = route("sun", "2026-08-23T21:30:00Z", 1_000.0) // Monday 00:30 in Istanbul.
        val result = snapshot(routes = listOf(lateSundayUtc))
        assertEquals(10, result.weeklyXp)
        assertEquals(monday, GamificationEngine.xpEvents(input(routes = listOf(lateSundayUtc))).single().occurredOn)
    }

    private fun snapshot(
        sessions: List<WorkoutSessionData> = emptyList(),
        routes: List<RouteActivityData> = emptyList(),
        steps: List<DailyStepData> = emptyList(),
        todaySteps: Int = 0,
    ) = GamificationEngine.snapshot(input(sessions, routes, steps, todaySteps))

    private fun input(
        sessions: List<WorkoutSessionData> = emptyList(),
        routes: List<RouteActivityData> = emptyList(),
        steps: List<DailyStepData> = emptyList(),
        todaySteps: Int = 0,
        today: LocalDate = monday.plusDays(4),
    ) = GamificationInput(
        sessions = sessions,
        routes = routes,
        stepHistory = steps,
        todaySteps = todaySteps,
        todayWaterMl = 0,
        schedule = emptyList(),
        dailyStepGoal = 8_000,
        dailyWaterGoalMl = 2_500,
        weeklyActivityGoal = 3,
        today = today,
        zoneId = zone,
    )

    private fun workout(id: String, completedAt: String) = WorkoutSessionData(id, completedAt, 1_800, 200, 3, 3, 3)
    private fun route(id: String, startedAt: String, distance: Double) = RouteActivityData(id, "Koşu", "Koşu", startedAt, startedAt, 1_800, 1_700, distance)
}
