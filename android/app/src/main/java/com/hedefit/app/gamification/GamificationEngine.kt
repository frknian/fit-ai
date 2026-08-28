package com.hedefit.app.gamification

import com.hedefit.app.data.model.DailyStepData
import com.hedefit.app.data.model.NutritionGoalData
import com.hedefit.app.data.model.NutritionLogData
import com.hedefit.app.data.model.RouteActivityData
import com.hedefit.app.data.model.WorkoutScheduleData
import com.hedefit.app.data.model.WorkoutSessionData
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters
import kotlin.math.floor
import kotlin.math.roundToInt

const val ACHIEVEMENT_XP = 100

enum class XpSource { WORKOUT_COMPLETED, STEP_GOAL_COMPLETED, ROUTE_DISTANCE, NUTRITION_TARGET_COMPLETED, SLEEP_GOAL_COMPLETED, WEEKLY_GOAL_COMPLETED, WEEKLY_CHALLENGE_COMPLETED, ACHIEVEMENT_UNLOCKED }
data class XpEvent(val source: XpSource, val sourceId: String, val amount: Int, val occurredOn: LocalDate)
data class LevelProgress(val level: Int, val currentXp: Int, val nextLevelXp: Int, val progress: Float)
data class DailyQuest(val id: String, val title: String, val xp: Int, val completed: Boolean)
enum class AchievementRarity { COMMON, RARE, EPIC }
data class Achievement(val id: String, val title: String, val description: String, val icon: String, val progress: Double, val target: Double, val unlockedAt: LocalDate?, val rarity: AchievementRarity, val rewardXp: Int = ACHIEVEMENT_XP)
data class HabitDay(val date: LocalDate, val active: Boolean, val today: Boolean)
data class WeeklyChallenge(val type: String, val title: String, val progress: Double, val target: Double, val rewardXp: Int, val completed: Boolean)
data class AiReward(val extraQuestions: Int, val nextThreshold: Int?)
data class GamificationSnapshot(val streakDays: Int, val totalXp: Int, val level: LevelProgress, val habitStrength: Int, val habitWeek: List<HabitDay>, val dailyQuests: List<DailyQuest>, val challenge: WeeklyChallenge, val achievements: List<Achievement>, val weeklyXp: Int, val dailyXpCap: Int, val aiReward: AiReward, val motivation: String)

data class GamificationInput(
    val sessions: List<WorkoutSessionData>, val routes: List<RouteActivityData>, val stepHistory: List<DailyStepData>, val todaySteps: Int,
    val todayWaterMl: Int = 0, val sleepMinutes: Int = 0, val nutritionLogs: List<NutritionLogData> = emptyList(), val nutritionGoal: NutritionGoalData = NutritionGoalData(),
    val schedule: List<WorkoutScheduleData>, val dailyStepGoal: Int, val dailyWaterGoalMl: Int = 2_000, val weeklyActivityGoal: Int,
    val authoritativeTotalXp: Int? = null, val authoritativeWeeklyXp: Int? = null, val unlockedAchievements: Map<String, LocalDate> = emptyMap(), val today: LocalDate = LocalDate.now(), val zoneId: ZoneId = ZoneId.systemDefault(),
)

/** Pure domain service: task rotation and rewards are deterministic for a given day. */
object GamificationEngine {
    const val DAILY_XP_CAP = 100
    private const val XP_PER_WORKOUT = 40
    private const val XP_STEP_GOAL = 40
    private const val XP_PER_ROUTE_KM = 10
    private const val XP_WEEKLY_GOAL = 100
    private const val XP_WEEKLY_CHALLENGE = 250
    private const val CHALLENGE_DISTANCE_KM = 15.0

    fun snapshot(input: GamificationInput): GamificationSnapshot {
        val sessionDates = input.sessions.mapNotNull { instantDate(it.completedAt, input.zoneId) }
        val routeDates = input.routes.mapNotNull { instantDate(it.startedAt, input.zoneId) }
        val activeDates = (sessionDates + routeDates).toSet()
        val quests = dailyQuests(input, sessionDates, routeDates)
        check(quests.sumOf(DailyQuest::xp) == DAILY_XP_CAP) { "Daily task rewards must total $DAILY_XP_CAP XP." }
        val achievements = achievements(input, sessionDates, routeDates, activeDates)
        val events = xpEvents(input, achievements).distinctBy { it.source to it.sourceId }
        val totalXp = input.authoritativeTotalXp ?: events.sumOf(XpEvent::amount)
        val weekStart = input.today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val thisWeekXp = input.authoritativeWeeklyXp ?: events.filter { !it.occurredOn.isBefore(weekStart) && !it.occurredOn.isAfter(input.today) }.sumOf(XpEvent::amount)
        val distance = input.routes.filter { route -> instantDate(route.startedAt, input.zoneId)?.let { !it.isBefore(weekStart) && !it.isAfter(input.today) } == true }.sumOf { it.distanceMeters } / 1_000.0
        val streak = goalAwareStreak(input.today, activeDates, input.weeklyActivityGoal)
        return GamificationSnapshot(streak, totalXp, levelFor(totalXp), habitStrength(input, activeDates), (0L..6L).map { offset -> weekStart.plusDays(offset).let { HabitDay(it, it in activeDates, it == input.today) } }, quests, WeeklyChallenge("DISTANCE", "15 km Koş/Yürü", distance, CHALLENGE_DISTANCE_KM, XP_WEEKLY_CHALLENGE, distance >= CHALLENGE_DISTANCE_KM), achievements, thisWeekXp, DAILY_XP_CAP, aiRewardFor(totalXp), motivation(quests, streak, achievements, input.today))
    }

    fun xpEvents(input: GamificationInput, achievements: List<Achievement> = emptyList()): List<XpEvent> = buildList {
        input.sessions.forEach { session -> instantDate(session.completedAt, input.zoneId)?.let { add(XpEvent(XpSource.WORKOUT_COMPLETED, session.id, XP_PER_WORKOUT, it)) } }
        input.routes.forEach { route ->
            val km = floor(route.distanceMeters.coerceAtLeast(0.0) / 1_000.0).toInt()
            if (km > 0) instantDate(route.startedAt, input.zoneId)?.let { add(XpEvent(XpSource.ROUTE_DISTANCE, route.id, km * XP_PER_ROUTE_KM, it)) }
        }
        input.stepHistory.filter { it.steps >= input.dailyStepGoal }.forEach { add(XpEvent(XpSource.STEP_GOAL_COMPLETED, it.localDate.toString(), XP_STEP_GOAL, it.localDate)) }
        val sessionDates = input.sessions.mapNotNull { instantDate(it.completedAt, input.zoneId) }
        sessionDates.groupBy { it.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)) }.forEach { (week, dates) -> if (dates.distinct().size >= input.weeklyActivityGoal) add(XpEvent(XpSource.WEEKLY_GOAL_COMPLETED, week.toString(), XP_WEEKLY_GOAL, week.plusDays(6))) }
        input.routes.groupBy { instantDate(it.startedAt, input.zoneId)?.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)) }.forEach { (week, routes) -> if (week != null && routes.sumOf { it.distanceMeters } >= CHALLENGE_DISTANCE_KM * 1_000) add(XpEvent(XpSource.WEEKLY_CHALLENGE_COMPLETED, "distance:$week", XP_WEEKLY_CHALLENGE, week.plusDays(6))) }
        achievements.filter { it.id in input.unlockedAchievements }.forEach { achievement -> add(XpEvent(XpSource.ACHIEVEMENT_UNLOCKED, achievement.id, achievement.rewardXp, requireNotNull(achievement.unlockedAt))) }
    }

    fun aiRewardFor(totalXp: Int): AiReward {
        val xp = totalXp.coerceAtLeast(0)
        val questions = when { xp < 300 -> 0; xp < 500 -> 1; else -> 2 + ((xp - 500) / 250) }.coerceAtMost(5)
        val next = when { questions >= 5 -> null; xp < 300 -> 300; xp < 500 -> 500; else -> 500 + ((questions - 1) * 250) + 250 }
        return AiReward(questions, next)
    }

    fun levelFor(totalXp: Int): LevelProgress {
        var level = 1; var remaining = totalXp.coerceAtLeast(0); var required = xpForLevel(level)
        while (remaining >= required) { remaining -= required; level += 1; required = xpForLevel(level) }
        return LevelProgress(level, remaining, required, remaining.toFloat() / required)
    }

    fun goalAwareStreak(today: LocalDate, activeDates: Set<LocalDate>, weeklyGoal: Int): Int {
        if (activeDates.isEmpty()) return 0
        val goal = weeklyGoal.coerceIn(1, 7); var week = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)); var earliest = today; var first = true
        while (true) {
            val effectiveEnd = if (first) today else week.plusDays(6); val count = activeDates.count { !it.isBefore(week) && !it.isAfter(effectiveEnd) }; val remainingDays = if (first) 7 - today.dayOfWeek.value else 0
            if (count < goal && (!first || count + remainingDays < goal)) break
            if (count == 0 && first) break
            earliest = week; week = week.minusWeeks(1); first = false
        }
        return if (earliest == today && today !in activeDates) 0 else (today.toEpochDay() - earliest.toEpochDay() + 1).toInt().coerceAtLeast(1)
    }

    private fun dailyQuests(input: GamificationInput, sessionDates: List<LocalDate>, routeDates: List<LocalDate>): List<DailyQuest> {
        val workout = input.today in sessionDates; val route = input.today in routeDates; val sleep = input.sleepMinutes >= 420; val meals = input.nutritionLogs.size >= 3
        val protein = input.nutritionLogs.sumOf { it.protein } >= input.nutritionGoal.protein * .85; val calories = input.nutritionLogs.sumOf { it.calories } >= input.nutritionGoal.calories * .75; val steps = input.todaySteps >= input.dailyStepGoal
        return when (input.today.dayOfYear % 4) {
            0 -> listOf(DailyQuest("steps", "${formatInt(input.dailyStepGoal)} adıma ulaş", 40, steps), DailyQuest("sleep", "En az 7 saat uyu", 25, sleep), DailyQuest("meals", "3 öğününü kaydet", 15, meals), DailyQuest("pushups", "5 şınavlık antrenmanını tamamla", 20, workout))
            1 -> listOf(DailyQuest("steps", "${formatInt(input.dailyStepGoal)} adıma ulaş", 35, steps), DailyQuest("protein", "Protein hedefinin %85'ine ulaş", 25, protein), DailyQuest("workout", "Antrenmanını tamamla", 40, workout))
            2 -> listOf(DailyQuest("steps", "${formatInt(input.dailyStepGoal)} adıma ulaş", 35, steps), DailyQuest("nutrition", "Günlük enerji hedefinin %75'ini kaydet", 25, calories), DailyQuest("sleep", "En az 7 saat uyu", 30, sleep), DailyQuest("route", "15 dk yürüyüş/koşu yap", 10, route))
            else -> listOf(DailyQuest("sleep", "En az 7 saat uyu", 30, sleep), DailyQuest("meals", "3 öğününü kaydet", 20, meals), DailyQuest("route", "15 dk yürüyüş/koşu yap", 20, route), DailyQuest("workout", "Antrenmanını tamamla", 30, workout))
        }
    }

    private fun habitStrength(input: GamificationInput, activeDates: Set<LocalDate>): Int {
        val start = input.today.minusDays(29); val recent = activeDates.count { !it.isBefore(start) && !it.isAfter(input.today) }; val expected = (input.weeklyActivityGoal.coerceIn(1, 7) * (30.0 / 7.0)).coerceAtLeast(1.0)
        return (recent / expected * 100).roundToInt().coerceIn(0, 100)
    }

    private fun achievements(input: GamificationInput, sessionDates: List<LocalDate>, routeDates: List<LocalDate>, activeDates: Set<LocalDate>): List<Achievement> {
        val workouts = input.sessions.size.toDouble(); val steps = input.stepHistory.sumOf { it.steps }.toDouble(); val km = input.routes.sumOf { it.distanceMeters } / 1_000.0
        val times = input.sessions.map { it.completedAt } + input.routes.map { it.startedAt }; val early = times.count { localHour(it, input.zoneId)?.let { hour -> hour < 8 } == true }.toDouble(); val night = times.count { localHour(it, input.zoneId)?.let { hour -> hour >= 20 } == true }.toDouble(); val streak = goalAwareStreak(input.today, activeDates, input.weeklyActivityGoal).toDouble()
        fun item(id: String, title: String, description: String, progress: Double, target: Double, rarity: AchievementRarity): Achievement { val unlockedAt = input.unlockedAchievements[id] ?: if (progress >= target) input.today else null; return Achievement(id, title, description, id, if (unlockedAt != null) target else progress.coerceAtMost(target), target, unlockedAt, rarity) }
        return listOf(
            item("first_activity", "İlk Adım", "İlk aktiviteni tamamla", workouts + input.routes.size, 1.0, AchievementRarity.COMMON), item("workouts_3", "Ritmi Bul", "3 antrenman tamamla", workouts, 3.0, AchievementRarity.COMMON), item("workouts_10", "Kararlı", "10 antrenman tamamla", workouts, 10.0, AchievementRarity.COMMON), item("workouts_25", "Güçleniyor", "25 antrenman tamamla", workouts, 25.0, AchievementRarity.RARE), item("workouts_50", "Demir İrade", "50 antrenman tamamla", workouts, 50.0, AchievementRarity.EPIC), item("workouts_100", "Yüzlük Kulüp", "100 antrenman tamamla", workouts, 100.0, AchievementRarity.EPIC),
            item("steps_10k", "Hareket Et", "Toplam 10.000 adıma ulaş", steps, 10_000.0, AchievementRarity.COMMON), item("steps_50k", "50K Adım", "Toplam 50.000 adıma ulaş", steps, 50_000.0, AchievementRarity.COMMON), item("steps_100k", "100K Club", "Toplam 100.000 adıma ulaş", steps, 100_000.0, AchievementRarity.RARE), item("steps_250k", "Çeyrek Milyon", "Toplam 250.000 adıma ulaş", steps, 250_000.0, AchievementRarity.RARE), item("steps_500k", "Yarım Milyon", "Toplam 500.000 adıma ulaş", steps, 500_000.0, AchievementRarity.EPIC),
            item("route_5", "Yola Çık", "Toplam 5 km yürü/koş", km, 5.0, AchievementRarity.COMMON), item("route_half", "21.1", "Toplam 21,1 km yürü/koş", km, 21.1, AchievementRarity.RARE), item("marathon_distance", "42.2", "Toplam 42,2 km yürü/koş", km, 42.2, AchievementRarity.EPIC), item("route_100", "Yolcu", "Toplam 100 km yürü/koş", km, 100.0, AchievementRarity.EPIC), item("route_250", "Ufuk Çizgisi", "Toplam 250 km yürü/koş", km, 250.0, AchievementRarity.EPIC),
            item("early_once", "Erken Kuş", "08:00 öncesi bir aktivite", early, 1.0, AchievementRarity.COMMON), item("early_5", "Gün Doğumu", "08:00 öncesi 5 aktivite", early, 5.0, AchievementRarity.RARE), item("early_bird", "Sabah Disiplini", "08:00 öncesi 10 aktivite", early, 10.0, AchievementRarity.EPIC), item("night_once", "Gece Modu", "20:00 sonrası bir aktivite", night, 1.0, AchievementRarity.COMMON), item("night_5", "Gece Sporcusu", "20:00 sonrası 5 aktivite", night, 5.0, AchievementRarity.RARE), item("streak_3", "3 Günlük Seri", "3 gün ritmini koru", streak, 3.0, AchievementRarity.COMMON), item("streak_7", "Haftalık Seri", "7 gün ritmini koru", streak, 7.0, AchievementRarity.RARE), item("streak_21", "Alışkanlık", "21 gün ritmini koru", streak, 21.0, AchievementRarity.EPIC),
        )
    }

    private fun motivation(quests: List<DailyQuest>, streak: Int, achievements: List<Achievement>, today: LocalDate) = when { achievements.any { it.unlockedAt == today } -> "Yeni başarımın +$ACHIEVEMENT_XP XP kazandırdı."; quests.all { it.completed } -> "Bugünün $DAILY_XP_CAP XP'lik görevlerinin tamamını bitirdin."; streak > 0 && streak % 7 == 0 -> "$streak günlük ritmin sağlamlaşıyor."; else -> "Bugün küçük ama gerçek bir adım at." }
    private fun xpForLevel(level: Int) = 300 + (level - 1) * 50
    private fun instantDate(value: String, zoneId: ZoneId) = runCatching { Instant.parse(value).atZone(zoneId).toLocalDate() }.getOrNull()
    private fun localHour(value: String, zoneId: ZoneId) = runCatching { Instant.parse(value).atZone(zoneId).hour }.getOrNull()
    private fun formatInt(value: Int) = "%,d".format(value).replace(',', '.')
}
