package com.hedefit.app.data.repository

import com.hedefit.app.data.auth.AuthRepository
import com.hedefit.app.data.model.BodyMeasurementData
import com.hedefit.app.data.model.ChatReplyData
import com.hedefit.app.data.model.DashboardData
import com.hedefit.app.data.model.NutritionEstimateData
import com.hedefit.app.data.model.NutritionGoalData
import com.hedefit.app.data.model.NutritionLogData
import com.hedefit.app.data.model.ProfileData
import com.hedefit.app.data.model.ProfileUpdateData
import com.hedefit.app.data.model.WorkoutExerciseData
import com.hedefit.app.data.model.WorkoutSessionData
import com.hedefit.app.data.model.RouteActivityData
import com.hedefit.app.data.model.ActivityRoutePointData
import com.hedefit.app.data.model.WorkoutSetInput
import com.hedefit.app.data.model.WorkoutFeedbackData
import com.hedefit.app.data.model.WorkoutScheduleData
import com.hedefit.app.data.model.WorkoutProgramData
import com.hedefit.app.data.model.FavoriteMealData
import com.hedefit.app.data.model.MealPlanItemData
import com.hedefit.app.data.model.asRepeatFood
import com.hedefit.app.data.model.FoodSearchData
import com.hedefit.app.data.model.ExerciseCatalogData
import com.hedefit.app.data.model.DailyStepData
import com.hedefit.app.data.model.PreviousSetData
import com.hedefit.app.data.model.WorkoutExercisePerformanceData
import com.hedefit.app.data.model.WorkoutSetPerformanceData
import com.hedefit.app.data.model.ManualActivityInput
import com.hedefit.app.data.model.manualActivityTypes
import com.hedefit.app.health.HealthSnapshot
import com.hedefit.app.data.network.HedefitApiClient
import com.hedefit.app.data.network.SupabaseRestClient
import com.hedefit.app.data.network.doubleOrNull
import com.hedefit.app.data.network.intOrNull
import com.hedefit.app.data.network.requireSuccess
import com.hedefit.app.data.network.stringOrNull
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import com.hedefit.app.route.RouteSnapshot
import java.util.UUID
import android.util.Base64
import kotlin.math.roundToInt

class HedefitRepository(
    private val auth: AuthRepository,
    private val rest: SupabaseRestClient,
    private val api: HedefitApiClient,
) {
    private val rawHttp = com.hedefit.app.data.network.JsonHttpClient()
    suspend fun saveRoute(snapshot: RouteSnapshot, activityType: String, title: String) {
        saveRoutePayload(routePayload(snapshot, activityType, title))
    }

    fun routePayload(snapshot: RouteSnapshot, activityType: String, title: String): JSONObject {
        val points = JSONArray().also { array -> snapshot.points.forEach { point -> array.put(JSONObject().put("lat", point.latitude).put("lng", point.longitude).put("alt", point.altitude).put("time", point.recordedAt).put("accuracy", point.accuracyMeters).put("speed", point.speedMetersPerSecond ?: JSONObject.NULL).put("bearing", point.bearingDegrees ?: JSONObject.NULL)) } }
        val calories = ((snapshot.distanceMeters / 1_000.0) * when (activityType) { "Bisiklet" -> 28.0; "Koşu", "Trail Koşusu" -> 62.0; else -> 45.0 }).toInt().coerceAtLeast(0)
        return JSONObject()
            .put("id", snapshot.id).put("activity_type", activityType)
            .put("title", title.trim().take(80))
            .put("started_at", Instant.ofEpochMilli(snapshot.startedAt).toString()).put("ended_at", Instant.ofEpochMilli(snapshot.stoppedAt).toString())
            .put("duration_seconds", snapshot.elapsedDurationSeconds).put("moving_duration_seconds", snapshot.durationSeconds)
            .put("distance_meters", snapshot.distanceMeters).put("average_pace_seconds_per_km", snapshot.paceSecondsPerKm ?: JSONObject.NULL)
            .put("average_speed_kmh", snapshot.averageSpeedKmh).put("calories", calories).put("status", "completed").put("route_points", points)
    }

    suspend fun saveRoutePayload(payload: JSONObject) {
        rest.insert("route_activities", JSONObject(payload.toString()).put("user_id", requireNotNull(auth.userId())))
    }

    suspend fun deleteRoute(id: String) {
        require(id.matches(Regex("^[0-9a-fA-F-]{36}$"))) { "Geçersiz rota kaydı." }
        rest.delete("route_activities", "id=eq.$id&user_id=eq.${requireNotNull(auth.userId())}")
    }
    suspend fun loadDashboard(date: LocalDate = LocalDate.now()): DashboardData = coroutineScope {
        val userId = requireNotNull(auth.userId())
        val profileCall = async { rest.select("profiles", "select=*&id=eq.$userId&limit=1") }
        val planCall = async { rest.select("workout_plans", "select=workouts&user_id=eq.$userId&limit=1") }
        val sessionsCall = async { rest.select("workout_sessions", "select=*&user_id=eq.$userId&order=completed_at.desc&limit=40") }
        val nutritionCall = async { api.get("/api/nutrition/logs?date=$date").requireSuccess("Beslenme günlüğü yüklenemedi.").jsonObject() }
        val goalCall = async { optionalSelect("nutrition_goals", "select=*&user_id=eq.$userId&limit=1") }
        val stepsCall = async { optionalSelect("daily_steps", "select=steps&user_id=eq.$userId&local_date=eq.$date&limit=1") }
        val stepHistoryCall = async { optionalSelect("daily_steps", "select=local_date,steps&user_id=eq.$userId&local_date=gte.${date.minusDays(29)}&local_date=lte.$date&order=local_date.asc") }
        val waterCall = async { optionalSelect("water_logs", "select=milliliters&user_id=eq.$userId&local_date=eq.$date&limit=1") }
        val sleepCall = async { optionalSelect("sleep_logs", "select=minutes&user_id=eq.$userId&local_date=eq.$date&limit=1") }
        val streakCall = async { optionalSelect("user_streaks", "select=current_streak&user_id=eq.$userId&limit=1") }
        val measurementsCall = async { optionalSelect("body_measurements", "select=*&user_id=eq.$userId&order=measured_at.asc&limit=90") }
        val scheduleCall = async { optionalSelect("workout_schedule", "select=*&user_id=eq.$userId&scheduled_date=gte.${date.minusDays(7)}&scheduled_date=lte.${date.plusDays(21)}&order=scheduled_date.asc") }
        val favoritesCall = async { optionalSelect("favorite_meals", "select=*&user_id=eq.$userId&order=updated_at.desc&limit=30") }
        val mealPlansCall = async { optionalSelect("meal_plan_items", "select=*&user_id=eq.$userId&planned_date=gte.${date.minusDays(35)}&planned_date=lte.${date.plusDays(35)}&order=planned_date.asc,created_at.asc&limit=500") }
        val programsCall = async { optionalSelect("workout_program_collections", "select=*&user_id=eq.$userId&order=updated_at.desc&limit=50") }
        val routesCall = async { optionalSelect("route_activities", "select=*&user_id=eq.$userId&order=started_at.desc&limit=100") }
        val exerciseLogsCall = async { optionalSelect("workout_exercise_logs", "select=id,session_id,exercise_id,exercise_name,completed_at&user_id=eq.$userId&completed_at=gte.${date.minusDays(14)}T00:00:00Z&order=completed_at.desc&limit=200") }
        val setLogsCall = async { optionalSelect("workout_set_logs", "select=exercise_log_id,set_number,weight_kg,reps,duration_seconds,rpe,created_at&user_id=eq.$userId&created_at=gte.${date.minusDays(14)}T00:00:00Z&order=created_at.desc&limit=1000") }
        val xpEventsCall = async { optionalSelect("xp_events", "select=amount,occurred_at&user_id=eq.$userId&order=occurred_at.desc&limit=5000") }
        val achievementsCall = async { optionalSelect("user_achievements", "select=achievement_id,unlocked_at&user_id=eq.$userId") }

        val profileJson = profileCall.await().optJSONObject(0)
        val rawProfile = if (profileJson == null) {
            val displayName = auth.currentSession()?.user?.email?.substringBefore('@').orEmpty().ifBlank { "Sporcu" }
            rest.upsert("profiles", JSONObject().put("id", userId).put("display_name", displayName), "id")
            parseProfile(null, userId)
        } else parseProfile(profileJson, userId)
        // Fotoğraf bağlantısı geçici olarak üretilemese bile bütün ana ekranın
        // yüklenmesini engelleme. Cihaz önbelleği avatarı göstermeye devam eder.
        val profile = rawProfile.copy(avatarUrl = rawProfile.avatarPath?.let { path -> runCatching { signedAvatarUrl(path) }.getOrNull() })
        val workouts = parseWorkouts(planCall.await().optJSONObject(0)?.optJSONArray("workouts") ?: JSONArray())
        val sessions = parseSessions(sessionsCall.await())
        val nutritionLogs = parseNutritionLogs(nutritionCall.await().optJSONArray("logs") ?: JSONArray())
        val nutritionGoal = parseNutritionGoal(goalCall.await().optJSONObject(0), profile)
        val measurements = parseMeasurements(measurementsCall.await())

        val xpRows = xpEventsCall.await()
        val weekStart = date.with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY))
        val totalXp = (0 until xpRows.length()).sumOf { xpRows.optJSONObject(it)?.optInt("amount") ?: 0 }
        val weeklyXp = (0 until xpRows.length()).sumOf { index ->
            val row = xpRows.optJSONObject(index)
            val occurred = row?.optString("occurred_at")?.let { value -> runCatching { Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDate() }.getOrNull() }
            if (occurred != null && !occurred.isBefore(weekStart) && !occurred.isAfter(date)) row.optInt("amount") else 0
        }
        val achievementRows = achievementsCall.await()
        val unlocked = buildMap {
            for (index in 0 until achievementRows.length()) achievementRows.optJSONObject(index)?.let { row ->
                val day = runCatching { Instant.parse(row.optString("unlocked_at")).atZone(ZoneId.systemDefault()).toLocalDate() }.getOrNull()
                if (day != null) put(row.optString("achievement_id"), day)
            }
        }

        DashboardData(
            profile = profile,
            workouts = workouts,
            sessions = sessions,
            nutritionLogs = nutritionLogs,
            nutritionGoal = nutritionGoal,
            steps = stepsCall.await().optJSONObject(0)?.optInt("steps") ?: 0,
            waterMl = waterCall.await().optJSONObject(0)?.optInt("milliliters") ?: 0,
            sleepMinutes = sleepCall.await().optJSONObject(0)?.optInt("minutes") ?: 0,
            streakDays = streakCall.await().optJSONObject(0)?.optInt("current_streak") ?: 0,
            measurements = measurements,
            loadedDate = date,
            activeCalories = (stepsCall.await().optJSONObject(0)?.optInt("steps") ?: 0) / 25,
            schedule = parseSchedule(scheduleCall.await()),
            favoriteMeals = parseFavorites(favoritesCall.await()),
            mealPlanItems = parseMealPlanItems(mealPlansCall.await()),
            workoutPrograms = parseWorkoutPrograms(programsCall.await()),
            routeActivities = parseRouteActivities(routesCall.await()),
            exercisePerformance = parseExercisePerformance(exerciseLogsCall.await(), setLogsCall.await()),
            stepHistory = parseStepHistory(stepHistoryCall.await()),
            gamificationTotalXp = totalXp.takeIf { xpRows.length() > 0 },
            gamificationWeeklyXp = weeklyXp.takeIf { xpRows.length() > 0 },
            unlockedAchievements = unlocked,
        )
    }

    suspend fun syncGamificationPreferences(stepGoal: Int, waterGoalMl: Int, weeklyActivityGoal: Int, timezone: String) {
        val userId = requireNotNull(auth.userId())
        runCatching {
            rest.upsert(
                "gamification_preferences",
                JSONObject().put("user_id", userId)
                    .put("daily_step_goal", stepGoal.coerceIn(1_000, 100_000))
                    .put("daily_water_goal_ml", waterGoalMl.coerceIn(250, 10_000))
                    .put("weekly_activity_goal", weeklyActivityGoal.coerceIn(1, 7))
                    .put("timezone", timezone)
                    .put("updated_at", Instant.now().toString()),
                "user_id",
            )
        }
    }

    suspend fun loadNutritionLogs(date: LocalDate): List<NutritionLogData> =
        parseNutritionLogs(api.get("/api/nutrition/logs?date=$date").requireSuccess("Beslenme günlüğü yüklenemedi.").jsonObject().optJSONArray("logs") ?: JSONArray())

    suspend fun loadNutritionHistory(): List<NutritionLogData> =
        parseNutritionLogs(api.get("/api/nutrition/logs").requireSuccess("Beslenme geçmişi yüklenemedi.").jsonObject().optJSONArray("logs") ?: JSONArray())

    private fun parseStepHistory(rows: JSONArray): List<DailyStepData> = buildList {
        for (index in 0 until rows.length()) {
            val row = rows.optJSONObject(index) ?: continue
            val date = runCatching { LocalDate.parse(row.optString("local_date")) }.getOrNull() ?: continue
            add(DailyStepData(date, row.optInt("steps").coerceAtLeast(0)))
        }
    }

    suspend fun accountStatus(): String {
        val userId = requireNotNull(auth.userId())
        return rest.select("profiles", "select=account_status&id=eq.$userId&limit=1")
            .optJSONObject(0)?.optString("account_status", "active") ?: "active"
    }

    suspend fun reactivateAccount() {
        val userId = requireNotNull(auth.userId())
        rest.update("profiles", "id=eq.$userId", JSONObject().put("account_status", "active").put("frozen_at", JSONObject.NULL))
    }

    suspend fun generatePlan(profile: ProfileData, feedback: WorkoutFeedbackData? = null): List<WorkoutExerciseData> {
        val body = JSONObject()
            .put("age", profile.age ?: JSONObject.NULL)
            .put("gender", profile.gender)
            .put("height", profile.heightCm ?: JSONObject.NULL)
            .put("weight", profile.weightKg ?: JSONObject.NULL)
            .put("environment", profile.environment)
            .put("equipment", profile.equipment)
            .put("goal", profile.goal)
            .put("history", JSONArray(profile.historyAnswers))
            .put("locale", "tr")
        if (feedback != null) body.put("adaptation", JSONObject()
            .put("difficulty", feedback.difficulty)
            .put("fatigue", feedback.fatigue)
            .put("painAreas", JSONArray(feedback.painAreas))
            .put("note", feedback.note))
        val response = api.post("/api/generate-plan", body).requireSuccess("Antrenman programı oluşturulamadı.").jsonObject()
        val raw = response.optJSONArray("workouts") ?: JSONArray()
        val workouts = parseWorkouts(raw)
        if (workouts.isEmpty()) error("AI kullanılabilir bir program üretmedi.")
        rest.upsert(
            "workout_plans",
            JSONObject().put("user_id", requireNotNull(auth.userId())).put("workouts", raw).put("updated_at", Instant.now().toString()),
            "user_id",
        )
        return workouts
    }

    suspend fun saveProfile(update: ProfileUpdateData): ProfileData {
        val userId = requireNotNull(auth.userId())
        val goal = buildString {
            append(update.goalType)
            update.targetWeightKg?.let { append(" | hedef:").append(it) }
            update.targetWeeks?.let { append(" | hafta:").append(it) }
        }
        val row = JSONObject()
            .put("id", userId)
            .put("display_name", update.displayName.trim())
            .put("age", update.age ?: JSONObject.NULL)
            .put("gender", update.gender)
            .put("height_cm", update.heightCm ?: JSONObject.NULL)
            .put("weight_kg", update.weightKg ?: JSONObject.NULL)
            .put("goal_text", goal)
            .put("environment", update.environment)
            .put("equipment_text", update.equipment)
            .put("history_answers", JSONArray(update.historyAnswers))
            .put("updated_at", Instant.now().toString())
        val saved = rest.upsert("profiles", row, "id")
        return parseProfile(saved, userId)
    }

    suspend fun uploadAvatar(bytes: ByteArray, mimeType: String): Pair<String, String> {
        require(bytes.isNotEmpty() && bytes.size <= 5 * 1024 * 1024) { "Profil fotoğrafı en fazla 5 MB olabilir." }
        require(mimeType in setOf("image/jpeg", "image/png", "image/webp")) { "Profil fotoğrafı JPG, PNG veya WebP olmalı." }
        val userId = requireNotNull(auth.userId())
        val extension = when (mimeType) { "image/png" -> "png"; "image/webp" -> "webp"; else -> "jpg" }
        val path = "$userId/avatar-${UUID.randomUUID()}.$extension"
        val response = rawHttp.requestBytes(
            url = "${com.hedefit.app.BuildConfig.SUPABASE_URL.trimEnd('/')}/storage/v1/object/profile-avatars/$path",
            method = "POST",
            headers = mapOf("apikey" to com.hedefit.app.BuildConfig.SUPABASE_ANON_KEY, "Authorization" to "Bearer ${auth.validAccessToken()}", "Content-Type" to mimeType, "x-upsert" to "true"),
            body = bytes,
        ).requireSuccess("Profil fotoğrafı yüklenemedi.")
        rest.update("profiles", "id=eq.$userId", JSONObject().put("avatar_path", path).put("updated_at", Instant.now().toString()))
        return path to signedAvatarUrl(path)
    }

    suspend fun freezeAccount() {
        val userId = requireNotNull(auth.userId())
        rest.update(
            "profiles", "id=eq.$userId",
            JSONObject().put("account_status", "frozen").put("frozen_at", Instant.now().toString()),
        )
    }

    suspend fun resetProgress() {
        api.post("/api/account/reset-progress", JSONObject().put("confirmation", "RESET_PROGRESS")).requireSuccess("İlerleme verileri sıfırlanamadı.")
    }

    suspend fun deleteAccount(email: String) {
        api.post("/api/account/delete", JSONObject().put("email", email.trim()).put("confirmation", "HESABIMI SİL"))
            .requireSuccess("Hesap silinemedi.")
    }

    suspend fun recordWorkout(
        exercises: List<WorkoutExerciseData>,
        sets: List<WorkoutSetInput>,
        durationSeconds: Int,
        calories: Int,
        feedback: WorkoutFeedbackData = WorkoutFeedbackData(),
    ): WorkoutSessionData {
        val id = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val row = JSONObject()
            .put("id", id)
            .put("user_id", requireNotNull(auth.userId()))
            .put("completed_at", now)
            .put("duration_seconds", durationSeconds.coerceAtLeast(1))
            .put("calories", calories.coerceAtLeast(0))
            .put("completed_exercises", sets.map { it.exerciseId }.distinct().size)
            .put("total_exercises", exercises.size.coerceAtLeast(1))
            .put("exercise_names", JSONArray(exercises.map { it.name }))
            .put("difficulty", feedback.difficulty)
            .put("fatigue", feedback.fatigue)
            .put("pain_areas", JSONArray(feedback.painAreas))
            .put("feedback_note", feedback.note.take(500))
        rest.insert("workout_sessions", row)
        sets.groupBy { it.exerciseId }.entries.sortedBy { it.value.first().exerciseOrder }.forEachIndexed { index, (exerciseId, exerciseSets) ->
            val exercise = exercises.firstOrNull { it.id == exerciseId }
            val exerciseLogId = UUID.randomUUID().toString()
            rest.insert("workout_exercise_logs", JSONObject()
                .put("id", exerciseLogId).put("session_id", id).put("user_id", requireNotNull(auth.userId()))
                .put("exercise_id", exerciseId).put("exercise_name", exercise?.name ?: exerciseSets.first().exerciseName)
                .put("exercise_key", (exercise?.name ?: exerciseSets.first().exerciseName).lowercase().replace(' ', '-'))
                .put("exercise_order", index + 1).put("is_bodyweight", exerciseSets.all { (it.weightKg ?: 0.0) <= 0.0 }).put("completed_at", now))
            exerciseSets.forEach { set ->
                rest.insert("workout_set_logs", JSONObject()
                    .put("id", UUID.randomUUID().toString()).put("session_id", id).put("exercise_log_id", exerciseLogId)
                    .put("user_id", requireNotNull(auth.userId())).put("set_number", set.setNumber)
                    .put("weight_kg", set.weightKg ?: JSONObject.NULL).put("reps", set.reps ?: JSONObject.NULL)
                    .put("duration_seconds", set.durationSeconds ?: JSONObject.NULL).put("rpe", set.rpe ?: JSONObject.NULL)
                    .put("set_type", set.setType).put("note", set.note.ifBlank { JSONObject.NULL }))
            }
        }
        return WorkoutSessionData(id, now, durationSeconds, calories, sets.map { it.exerciseId }.distinct().size, exercises.size, feedback.fatigue)
    }

    suspend fun recordManualActivity(input: ManualActivityInput, calories: Int): WorkoutSessionData {
        val activity = requireNotNull(manualActivityTypes.firstOrNull { it.key == input.activityKey }) { "Geçersiz aktivite türü." }
        val duration = input.durationMinutes.coerceIn(1, 600)
        val safeCalories = calories.coerceIn(1, 10_000)
        val safeNote = input.notes.trim().take(500)
        val id = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        rest.insert("workout_sessions", JSONObject()
            .put("id", id)
            .put("user_id", requireNotNull(auth.userId()))
            .put("completed_at", now)
            .put("duration_seconds", duration * 60)
            .put("calories", safeCalories)
            .put("completed_exercises", 0)
            .put("total_exercises", 1)
            .put("exercise_names", JSONArray(listOf("activity:${activity.key}")))
            .put("difficulty", "Uygun")
            .put("fatigue", JSONObject.NULL)
            .put("pain_areas", JSONArray())
            .put("feedback_note", safeNote.takeIf(String::isNotBlank) ?: JSONObject.NULL))
        return WorkoutSessionData(id, now, duration * 60, safeCalories, 0, 1, null, manualActivityKey = activity.key)
    }

    suspend fun syncHealth(snapshot: HealthSnapshot) {
        val userId = requireNotNull(auth.userId())
        optionalHealthUpsert("daily_steps", JSONObject().put("user_id", userId).put("local_date", snapshot.date.toString()).put("steps", snapshot.steps).put("source", "health_connect").put("synced_at", Instant.now().toString()), "user_id,local_date")
        if (snapshot.sleepMinutes > 0) optionalHealthUpsert("sleep_logs", JSONObject().put("user_id", userId).put("local_date", snapshot.date.toString()).put("minutes", snapshot.sleepMinutes).put("quality", if (snapshot.sleepMinutes >= 420) "iyi" else "orta"), "user_id,local_date")
        snapshot.weightKg?.let { weight -> rest.upsert("body_measurements", JSONObject().put("id", UUID.randomUUID().toString()).put("user_id", userId).put("measured_at", snapshot.date.toString()).put("weight_kg", weight), "user_id,measured_at") }
    }

    private suspend fun optionalHealthUpsert(table: String, row: JSONObject, onConflict: String) {
        runCatching { rest.upsert(table, row, onConflict) }.onFailure { error ->
            val message = error.message.orEmpty()
            if (!message.contains("Could not find the table", ignoreCase = true) && !message.contains("PGRST205", ignoreCase = true)) throw error
        }
    }

    suspend fun saveBodyMeasurement(measurement: BodyMeasurementData): BodyMeasurementData {
        val row = JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("user_id", requireNotNull(auth.userId()))
            .put("measured_at", measurement.date)
            .put("weight_kg", measurement.weightKg ?: JSONObject.NULL)
            .put("waist_cm", measurement.waistCm ?: JSONObject.NULL)
            .put("hips_cm", measurement.hipsCm ?: JSONObject.NULL)
            .put("chest_cm", measurement.chestCm ?: JSONObject.NULL)
            .put("arm_cm", measurement.armCm ?: JSONObject.NULL)
            .put("thigh_cm", measurement.thighCm ?: JSONObject.NULL)
            .put("updated_at", Instant.now().toString())
        return parseMeasurement(rest.upsert("body_measurements", row, "user_id,measured_at"))
    }

    suspend fun setWater(totalMl: Int, date: LocalDate = LocalDate.now()): Int {
        val clean = totalMl.coerceIn(0, 20_000)
        rest.upsert("water_logs", JSONObject().put("user_id", requireNotNull(auth.userId())).put("local_date", date.toString()).put("milliliters", clean).put("updated_at", Instant.now().toString()), "user_id,local_date")
        return clean
    }

    suspend fun searchFoods(query: String, locale: String = "tr"): List<FoodSearchData> {
        val response = api.get("/api/nutrition/foods?q=${java.net.URLEncoder.encode(query.trim(), Charsets.UTF_8.name())}&locale=${if (locale == "en") "en" else "tr"}").requireSuccess("Besin kataloğu aranamadı.").jsonObject()
        val array = response.optJSONArray("items") ?: JSONArray()
        return buildList { for (index in 0 until array.length()) array.optJSONObject(index)?.let { item -> add(parseFoodSearch(item)) } }
    }

    suspend fun analyzeNutritionPhoto(jpegBytes: ByteArray): List<NutritionEstimateData> {
        require(jpegBytes.isNotEmpty() && jpegBytes.size <= 5 * 1024 * 1024) { "Fotoğraf 5 MB'den küçük olmalı." }
        val encoded = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
        val response = api.post("/api/nutrition/analyze-photo", JSONObject().put("imageDataUrl", "data:image/jpeg;base64,$encoded"))
            .requireSuccess("Fotoğraftaki öğün analiz edilemedi.").jsonObject()
        val items = response.optJSONArray("items") ?: JSONArray()
        return buildList {
            for (index in 0 until items.length()) items.optJSONObject(index)?.let { item ->
                add(NutritionEstimateData(
                    name = item.optString("name"), grams = item.optDouble("estimatedGrams"), calories = item.optInt("calories"),
                    protein = item.optDouble("protein"), carbs = item.optDouble("carbohydrates"), fat = item.optDouble("fat"), fiber = item.optDouble("fiber"),
                    sugar = item.optDouble("sugar"), sodiumMg = item.optDouble("sodiumMg"), potassiumMg = item.optDouble("potassiumMg"),
                    calciumMg = item.optDouble("calciumMg"), ironMg = item.optDouble("ironMg"), vitaminCMg = item.optDouble("vitaminCMg"),
                    confidence = item.optDouble("confidence"),
                ))
            }
        }.also { require(it.isNotEmpty()) { "Fotoğrafta öğün bulunamadı." } }
    }

    suspend fun savePhotoNutrition(items: List<NutritionEstimateData>, meal: String): List<NutritionLogData> = items.map { item ->
        val grams = item.grams.coerceIn(1.0, 5000.0)
        val ratioTo100 = 100.0 / grams
        addCatalogFood(FoodSearchData(
            id = "photo", name = item.name, brand = null, servingGrams = grams,
            calories = (item.calories * ratioTo100).toInt(), protein = item.protein * ratioTo100, carbs = item.carbs * ratioTo100,
            fat = item.fat * ratioTo100, fiber = item.fiber * ratioTo100, sugar = item.sugar * ratioTo100,
            sodiumMg = item.sodiumMg * ratioTo100, potassiumMg = item.potassiumMg * ratioTo100, calciumMg = item.calciumMg * ratioTo100,
            ironMg = item.ironMg * ratioTo100, vitaminCMg = item.vitaminCMg * ratioTo100, verified = false, source = "photo_ai",
        ), grams, meal, "photo")
    }

    suspend fun addCatalogFood(food: FoodSearchData, grams: Double, meal: String, inputMethod: String = "search"): NutritionLogData {
        val body = catalogFoodPayload(food, grams, meal, inputMethod)
        return parseNutritionLog(api.post("/api/nutrition/logs", body).requireSuccess("Besin kaydedilemedi.").jsonObject().getJSONObject("log"))
    }

    suspend fun removeNutritionLog(id: String) {
        api.delete("/api/nutrition/logs/$id").requireSuccess("Besin kaldırılamadı.")
    }

    /** Re-scales a saved item from its own catalogue/estimate values and can move it between meals. */
    suspend fun updateNutritionLog(log: NutritionLogData, grams: Double, meal: String): NutritionLogData {
        val previousGrams = (log.grams ?: 100.0).coerceAtLeast(1.0)
        val ratio = grams / previousGrams
        val body = JSONObject()
            .put("mealType", meal)
            .put("portionGrams", grams)
            .put("calories", (log.calories * ratio).toInt())
            .put("protein", log.protein * ratio)
            .put("carbohydrates", log.carbs * ratio)
            .put("fat", log.fat * ratio)
            .put("fiber", log.fiber * ratio)
        return parseNutritionLog(api.patch("/api/nutrition/logs/${log.id}", body).requireSuccess("Besin güncellenemedi.").jsonObject().getJSONObject("log"))
    }

    fun catalogFoodPayload(food: FoodSearchData, grams: Double, meal: String, inputMethod: String = "search"): JSONObject {
        val ratio = grams / 100.0
        return JSONObject().put("foodId", if (food.id.matches(Regex("[0-9a-fA-F-]{36}"))) food.id else JSONObject.NULL)
            .put("loggedDate", LocalDate.now().toString()).put("mealType", meal).put("foodName", food.name).put("portionGrams", grams)
            .put("calories", (food.calories * ratio).toInt()).put("protein", food.protein * ratio).put("carbohydrates", food.carbs * ratio)
            .put("fat", food.fat * ratio).put("fiber", food.fiber * ratio).put("inputMethod", inputMethod).put("confidence", if (food.verified) 1.0 else .85)
            .put("isEstimated", !food.verified).put("metadata", JSONObject().put("source", food.source).put("sugar", food.sugar * ratio).put("sodiumMg", food.sodiumMg * ratio)
                .put("potassiumMg", food.potassiumMg * ratio).put("calciumMg", food.calciumMg * ratio).put("ironMg", food.ironMg * ratio).put("vitaminCMg", food.vitaminCMg * ratio))
    }

    suspend fun addFavorite(log: NutritionLogData): FavoriteMealData {
        val row = JSONObject().put("user_id", requireNotNull(auth.userId())).put("name", log.name).put("meal", log.meal).put("grams", log.grams ?: 100.0)
            .put("calories", log.calories).put("protein_g", log.protein).put("carbs_g", log.carbs).put("fat_g", log.fat).put("fiber_g", log.fiber)
            .put("micros", JSONObject().put("sugar", log.sugar).put("sodiumMg", log.sodiumMg).put("potassiumMg", log.potassiumMg).put("calciumMg", log.calciumMg).put("ironMg", log.ironMg).put("vitaminCMg", log.vitaminCMg))
        return parseFavorite(rest.upsert("favorite_meals", row, "user_id,name,grams"))
    }

    suspend fun removeFavorite(id: String) = rest.delete("favorite_meals", "id=eq.$id&user_id=eq.${requireNotNull(auth.userId())}")

    suspend fun repeatFavorite(favorite: FavoriteMealData): NutritionLogData {
        return addCatalogFood(favorite.asRepeatFood(), favorite.grams, favorite.meal, "favorite")
    }

    suspend fun addMealPlanItem(food: FoodSearchData, grams: Double, date: LocalDate, mealType: String): MealPlanItemData {
        val cleanGrams = grams.coerceIn(1.0, 5_000.0)
        val ratio = cleanGrams / 100.0
        val micros = JSONObject().put("sugar", food.sugar * ratio).put("sodiumMg", food.sodiumMg * ratio)
            .put("potassiumMg", food.potassiumMg * ratio).put("calciumMg", food.calciumMg * ratio)
            .put("ironMg", food.ironMg * ratio).put("vitaminCMg", food.vitaminCMg * ratio)
        val row = JSONObject().put("user_id", requireNotNull(auth.userId())).put("planned_date", date.toString())
            .put("meal_type", mealType.takeIf { it in setOf("breakfast", "lunch", "dinner", "snack") } ?: "snack")
            .put("food_name", food.name.take(160)).put("grams", cleanGrams).put("calories", (food.calories * ratio).toInt())
            .put("protein_g", food.protein * ratio).put("carbs_g", food.carbs * ratio).put("fat_g", food.fat * ratio)
            .put("fiber_g", food.fiber * ratio).put("micros", micros)
        return parseMealPlanItem(rest.insert("meal_plan_items", row))
    }

    suspend fun setMealPlanCompleted(item: MealPlanItemData, completed: Boolean): MealPlanItemData = parseMealPlanItem(
        rest.update("meal_plan_items", "id=eq.${item.id}&user_id=eq.${requireNotNull(auth.userId())}", JSONObject()
            .put("completed", completed).put("completed_at", if (completed) Instant.now().toString() else JSONObject.NULL))
    )

    suspend fun removeMealPlanItem(id: String) = rest.delete("meal_plan_items", "id=eq.$id&user_id=eq.${requireNotNull(auth.userId())}")

    suspend fun scheduleWorkout(date: LocalDate, time: String, status: String = "planned", originalDate: String? = null): WorkoutScheduleData {
        val row = JSONObject().put("id", UUID.randomUUID().toString()).put("user_id", requireNotNull(auth.userId())).put("scheduled_date", date.toString())
            .put("scheduled_time", time).put("status", status).put("original_date", originalDate ?: JSONObject.NULL).put("updated_at", Instant.now().toString())
        return parseScheduleItem(rest.upsert("workout_schedule", row, "user_id,scheduled_date"))
    }

    suspend fun loadExerciseCatalog(search: String = "", muscle: String = "", equipment: String = "", level: String = "", environment: String = "", muscleRole: String = "", force: String = "", mechanic: String = "", category: String = "", locale: String = "tr"): List<ExerciseCatalogData> {
        val requestedMuscles = when (muscle) {
            "arms" -> listOf("biceps", "triceps", "forearms")
            "back" -> listOf("lats", "middle back", "lower back", "traps")
            "core" -> listOf("abdominals", "lower back")
            "hips" -> listOf("glutes", "adductors", "abductors")
            "legs" -> listOf("quadriceps", "hamstrings", "calves", "adductors", "abductors", "glutes")
            else -> listOf(muscle)
        }
        if (requestedMuscles.size > 1) return coroutineScope {
            requestedMuscles.map { target ->
                async { loadExerciseCatalog(search, target, equipment, level, environment, muscleRole, force, mechanic, category, locale) }
            }.map { it.await() }.flatten().distinctBy(ExerciseCatalogData::id).sortedBy(ExerciseCatalogData::name)
        }
        val encode = { value: String -> java.net.URLEncoder.encode(value, Charsets.UTF_8.name()) }
        val path = "/api/exercises?limit=1000&search=${encode(search)}&muscle=${encode(muscle)}&equipment=${encode(equipment)}&level=${encode(level)}&environment=${encode(environment)}&muscleRole=${encode(muscleRole)}&force=${encode(force)}&mechanic=${encode(mechanic)}&category=${encode(category)}&locale=${if (locale == "en") "en" else "tr"}"
        val array = api.get(path).requireSuccess("Egzersiz kütüphanesi yüklenemedi.").jsonObject().optJSONArray("items") ?: JSONArray()
        return buildList { for (index in 0 until array.length()) array.optJSONObject(index)?.let { item ->
            add(ExerciseCatalogData(
                id = item.optString("id"),
                name = item.optString("name"),
                level = item.optString("level"),
                equipment = item.optString("equipment"),
                primaryMuscles = item.optJSONArray("primaryMuscles")?.let { values -> List(values.length()) { values.optString(it) } }.orEmpty(),
                instructions = item.optJSONArray("instructions")?.let { values -> List(values.length()) { values.optString(it) } }.orEmpty(),
                category = item.optString("category"),
                imageUrls = item.optJSONArray("images")?.let { values -> List(values.length()) { values.optString(it) }.filter(String::isNotBlank) }.orEmpty(),
                secondaryMuscles = item.optJSONArray("secondaryMuscles")?.let { values -> List(values.length()) { values.optString(it) } }.orEmpty(),
                force = item.optString("force"),
                mechanic = item.optString("mechanic"),
            ))
        } }
    }

    suspend fun loadPreviousPerformance(exercises: List<WorkoutExerciseData>): Map<String, List<PreviousSetData>> = buildMap {
        val userId = requireNotNull(auth.userId())
        exercises.forEach { exercise ->
            val log = optionalSelect("workout_exercise_logs", "select=id&user_id=eq.$userId&exercise_id=eq.${SupabaseRestClient.encode(exercise.id)}&order=completed_at.desc&limit=1").optJSONObject(0) ?: return@forEach
            val sets = optionalSelect("workout_set_logs", "select=set_number,weight_kg,reps,rpe&user_id=eq.$userId&exercise_log_id=eq.${log.optString("id")}&order=set_number.asc")
            put(exercise.id, buildList { for (index in 0 until sets.length()) sets.optJSONObject(index)?.let { item -> add(PreviousSetData(item.optInt("set_number"), item.doubleOrNull("weight_kg"), item.intOrNull("reps"), item.intOrNull("rpe"))) } })
        }
    }

    suspend fun saveWorkoutPlan(workouts: List<WorkoutExerciseData>) {
        val raw = workoutsJson(workouts)
        rest.upsert("workout_plans", JSONObject().put("user_id", requireNotNull(auth.userId())).put("workouts", raw).put("updated_at", Instant.now().toString()), "user_id")
    }

    suspend fun saveProgram(name: String, source: String, focusArea: String, workouts: List<WorkoutExerciseData>, id: String = UUID.randomUUID().toString(), showOnHome: Boolean = false): WorkoutProgramData {
        val userId = requireNotNull(auth.userId())
        rest.update("workout_program_collections", "user_id=eq.$userId&is_active=eq.true", JSONObject().put("is_active", false).put("updated_at", Instant.now().toString()))
        val row = rest.upsert("workout_program_collections", JSONObject()
            .put("id", id).put("user_id", userId).put("name", name.trim().take(80)).put("source", source)
            .put("focus_area", focusArea).put("exercises", workoutsJson(workouts)).put("is_active", true).put("show_on_home", showOnHome).put("updated_at", Instant.now().toString()), "id")
        saveWorkoutPlan(workouts)
        return parseWorkoutProgram(row)
    }

    suspend fun activateProgram(program: WorkoutProgramData): WorkoutProgramData {
        val userId = requireNotNull(auth.userId())
        rest.update("workout_program_collections", "user_id=eq.$userId&is_active=eq.true", JSONObject().put("is_active", false).put("updated_at", Instant.now().toString()))
        rest.update("workout_program_collections", "id=eq.${SupabaseRestClient.encode(program.id)}&user_id=eq.$userId", JSONObject().put("is_active", true).put("updated_at", Instant.now().toString()))
        saveWorkoutPlan(program.exercises)
        return program.copy(isActive = true)
    }

    suspend fun setProgramHomeVisibility(program: WorkoutProgramData, showOnHome: Boolean): WorkoutProgramData {
        val userId = requireNotNull(auth.userId())
        rest.update(
            "workout_program_collections",
            "id=eq.${SupabaseRestClient.encode(program.id)}&user_id=eq.$userId",
            JSONObject().put("show_on_home", showOnHome).put("updated_at", Instant.now().toString()),
        )
        return program.copy(showOnHome = showOnHome)
    }

    suspend fun deleteProgram(program: WorkoutProgramData): WorkoutProgramData? {
        val userId = requireNotNull(auth.userId())
        rest.delete("workout_program_collections", "id=eq.${SupabaseRestClient.encode(program.id)}&user_id=eq.$userId")
        val remaining = parseWorkoutPrograms(rest.select("workout_program_collections", "select=*&user_id=eq.$userId&order=updated_at.desc&limit=50"))
        val active = if (program.isActive) remaining.firstOrNull()?.let { activateProgram(it) } else remaining.firstOrNull { it.isActive }
        if (program.isActive && active == null) saveWorkoutPlan(emptyList())
        return active
    }

    private fun workoutsJson(workouts: List<WorkoutExerciseData>) = JSONArray(workouts.map { JSONObject().put("id", it.id).put("name", it.name).put("area", it.area).put("sets", it.sets).put("reps", it.reps).put("restSeconds", it.restSeconds) })

    suspend fun estimateNutrition(food: String, grams: Double): NutritionEstimateData {
        val response = api.post("/api/nutrition/parse-text", JSONObject().put("query", food).put("grams", grams))
            .requireSuccess("Besin değerleri hesaplanamadı.").jsonObject()
        val item = response.getJSONArray("items").getJSONObject(0)
        val nutrition = item.getJSONObject("nutrition")
        return NutritionEstimateData(
            name = item.optString("query", food),
            grams = item.optDouble("estimatedGrams", grams),
            calories = nutrition.optInt("calories"),
            protein = nutrition.optDouble("protein"),
            carbs = nutrition.optDouble("carbohydrates"),
            fat = nutrition.optDouble("fat"),
            fiber = nutrition.optDouble("fiber"),
            sugar = nutrition.optDouble("sugar"),
            sodiumMg = nutrition.optDouble("sodiumMg"),
            potassiumMg = nutrition.optDouble("potassiumMg"),
            calciumMg = nutrition.optDouble("calciumMg"),
            ironMg = nutrition.optDouble("ironMg"),
            vitaminCMg = nutrition.optDouble("vitaminCMg"),
            confidence = item.optDouble("confidence", response.optDouble("confidence", .5)),
        )
    }

    suspend fun addNutrition(estimate: NutritionEstimateData, meal: String, date: LocalDate = LocalDate.now()): NutritionLogData {
        val body = JSONObject()
            .put("foodId", JSONObject.NULL)
            .put("loggedDate", date.toString())
            .put("mealType", meal)
            .put("foodName", estimate.name)
            .put("portionGrams", estimate.grams)
            .put("calories", estimate.calories)
            .put("protein", estimate.protein)
            .put("carbohydrates", estimate.carbs)
            .put("fat", estimate.fat)
            .put("fiber", estimate.fiber)
            .put("inputMethod", "natural_language")
            .put("confidence", estimate.confidence)
            .put("isEstimated", true)
            .put("metadata", JSONObject().put("client", "android").put("sugar", estimate.sugar).put("sodiumMg", estimate.sodiumMg)
                .put("potassiumMg", estimate.potassiumMg).put("calciumMg", estimate.calciumMg).put("ironMg", estimate.ironMg).put("vitaminCMg", estimate.vitaminCMg))
        val log = api.post("/api/nutrition/logs", body).requireSuccess("Öğün kaydedilemedi.").jsonObject().getJSONObject("log")
        return parseNutritionLog(log)
    }

    suspend fun sendChat(messages: List<Pair<String, Boolean>>, data: DashboardData?, locale: String = "tr"): ChatReplyData {
        localNutritionEvaluation(messages.lastOrNull { it.second }?.first.orEmpty(), data, locale)?.let { answer ->
            return ChatReplyData(answer, "local", null, null)
        }
        localProgramEvaluation(messages.lastOrNull { it.second }?.first.orEmpty(), data, locale)?.let { answer ->
            return ChatReplyData(answer, "local", null, null)
        }
        val bodyMessages = JSONArray()
        messages.takeLast(12).forEach { (text, user) ->
            bodyMessages.put(JSONObject().put("role", if (user) "user" else "assistant").put("text", text))
        }
        val signals = JSONObject()
        data?.let {
            signals.put("profile", JSONObject()
                .put("age", it.profile.age ?: JSONObject.NULL)
                .put("sex", it.profile.gender)
                .put("heightCm", it.profile.heightCm ?: JSONObject.NULL)
                .put("weightKg", it.profile.weightKg ?: JSONObject.NULL)
                .put("environment", it.profile.environment)
                .put("equipment", it.profile.equipment)
                .put("assessmentAnswers", JSONArray(it.profile.historyAnswers.take(20))))
            val goalType = when {
                it.profile.goal.contains("yağ", true) -> "fatLoss"
                it.profile.goal.contains("kilo ver", true) || it.profile.goal.contains("zayıf", true) -> "lose"
                it.profile.goal.contains("kas", true) || it.profile.goal.contains("kilo al", true) -> "gain"
                else -> "maintain"
            }
            signals.put("goal", JSONObject().put("goalType", goalType).put("targetWeightKg", it.profile.targetWeightKg ?: JSONObject.NULL))
            val totals = it.nutritionLogs.fold(doubleArrayOf(0.0, 0.0, 0.0, 0.0)) { sum, log ->
                sum.apply { this[0] += log.calories; this[1] += log.protein; this[2] += log.carbs; this[3] += log.fat }
            }
            signals.put("today", JSONObject()
                .put("totals", JSONObject().put("calories", totals[0]).put("protein", totals[1]).put("carbs", totals[2]).put("fat", totals[3]))
                .put("steps", it.steps).put("waterMl", it.waterMl).put("sleepMinutes", it.sleepMinutes)
                .put("workoutCompleted", it.sessions.any { session -> localDate(session.completedAt) == LocalDate.now() })
                .put("foods", JSONArray(it.nutritionLogs.take(30).map { log ->
                    JSONObject().put("meal", log.meal).put("name", log.name).put("calories", log.calories)
                        .put("protein", log.protein).put("carbs", log.carbs).put("fat", log.fat)
                })))
            signals.put("measurements", JSONArray(it.measurements.takeLast(30).map { measurement ->
                JSONObject().put("measuredAt", measurement.date.take(10)).put("weightKg", measurement.weightKg ?: JSONObject.NULL)
            }))
            signals.put("activity", JSONObject()
                .put("workoutsThisWeek", it.sessions.count { session -> localDate(session.completedAt) >= LocalDate.now().minusDays(7) })
                .put("streakDays", it.streakDays))
            signals.put("training", JSONObject()
                .put("activeExercises", JSONArray(it.workouts.take(20).map { exercise ->
                    JSONObject().put("name", exercise.name).put("area", exercise.area).put("sets", exercise.sets).put("reps", exercise.reps)
                }))
                .put("recentSessions", JSONArray(it.sessions.take(4).map { session ->
                    JSONObject().put("completedAt", session.completedAt).put("exerciseNames", JSONArray(session.exerciseNames.take(12)))
                        .put("durationMinutes", session.durationSeconds / 60).put("fatigue", session.fatigue ?: JSONObject.NULL)
                }))
                .put("recentPerformance", JSONArray(it.exercisePerformance.take(20).map { performance ->
                    JSONObject().put("exerciseId", performance.exerciseId ?: JSONObject.NULL).put("exerciseName", performance.exerciseName)
                        .put("sets", JSONArray(performance.sets.map { set -> JSONObject().put("weightKg", set.weightKg ?: JSONObject.NULL).put("reps", set.reps ?: JSONObject.NULL).put("rpe", set.rpe ?: JSONObject.NULL) }))
                })))
        }
        val response = api.post("/api/chat", JSONObject().put("messages", bodyMessages).put("signals", signals).put("locale", if (locale == "en") "en" else "tr"))
            .requireSuccess("Fit Koç yanıt veremedi.").jsonObject()
        if (response.optString("source") == "unavailable") error(response.optString("notice", "Çevrimiçi Fit Koç geçici olarak kullanılamıyor."))
        val usage = response.optJSONObject("usage")
        return ChatReplyData(response.optString("text").replace("**", "").replace("__", ""), response.optString("source"), usage?.intOrNull("used"), usage?.intOrNull("limit"))
    }

    private fun localNutritionEvaluation(question: String, data: DashboardData?, locale: String): String? {
        val normalized = question.lowercase(java.util.Locale("tr", "TR"))
        val requested = normalized.contains("beslenmemi değerlendir") || normalized.contains("beslenmem nasıl") || normalized.contains("review my nutrition") || normalized.contains("evaluate my nutrition")
        if (!requested) return null
        val dashboard = data ?: return if (locale == "en") "I can't see today's nutrition data yet. Open Nutrition, add what you ate, then ask me again." else "Bugünkü beslenme verini henüz göremiyorum. Beslenme sayfasından yediklerini ekledikten sonra tekrar sor."
        val logs = dashboard.nutritionLogs
        if (logs.isEmpty()) return if (locale == "en") "You haven't logged a meal today, so I can't make a reliable assessment yet. Add your meals first; even approximate portions are enough to start." else "Bugün kayıtlı öğün görünmüyor; bu yüzden güvenilir bir değerlendirme yapamam. Önce yediklerini ekle, yaklaşık porsiyon yazman başlangıç için yeterli."

        val calories = logs.sumOf { it.calories }
        val protein = logs.sumOf { it.protein }.toInt()
        val carbs = logs.sumOf { it.carbs }.toInt()
        val fat = logs.sumOf { it.fat }.toInt()
        val goal = dashboard.nutritionGoal
        val calorieGap = goal.calories - calories
        val proteinGap = (goal.protein - protein).coerceAtLeast(0)
        val strongestProtein = logs.maxByOrNull { it.protein }?.takeIf { it.protein >= 10 }?.name

        if (locale == "en") {
            val energy = if (calorieGap >= 0) "You have about $calorieGap kcal remaining." else "You are about ${-calorieGap} kcal over your target."
            val proteinText = if (proteinGap > 0) "Protein is $protein / ${goal.protein} g, leaving a $proteinGap g gap." else "You reached your protein target with $protein g."
            val next = when {
                proteinGap >= 30 -> "For the next meal, prioritize a clear protein source such as 150–200 g chicken, fish, lean meat, or a yogurt-based option."
                calorieGap > 350 -> "Your protein is close; use the remaining energy for a balanced meal with vegetables and a measured carbohydrate portion."
                else -> "Keep the rest of the day light and avoid adding calories just to fill the target."
            }
            return "Today's $calories / ${goal.calories} kcal. $energy $proteinText Carbohydrate is $carbs / ${goal.carbs} g and fat is $fat / ${goal.fat} g. ${strongestProtein?.let { "Your strongest logged protein source is $it. " } ?: ""}$next"
        }

        val energy = if (calorieGap >= 0) "Yaklaşık $calorieGap kcal hakkın kaldı." else "Hedefini yaklaşık ${-calorieGap} kcal aşmışsın."
        val proteinText = if (proteinGap > 0) "Protein $protein / ${goal.protein} g; $proteinGap g eksiğin var." else "Protein hedefini $protein g ile tamamlamışsın."
        val next = when {
            proteinGap >= 30 -> "Sonraki öğünde 150–200 g tavuk, balık, yağsız et veya yoğurt temelli net bir protein kaynağına öncelik ver."
            calorieGap > 350 -> "Protein hedefin yakın; kalan enerjiyi sebze ve ölçülü bir karbonhidrat porsiyonuyla dengeli tamamla."
            else -> "Günün kalanını hafif tut; yalnız hedefi doldurmak için fazladan kalori ekleme."
        }
        return "Bugün $calories / ${goal.calories} kcal aldın. $energy $proteinText Karbonhidrat $carbs / ${goal.carbs} g, yağ $fat / ${goal.fat} g. ${strongestProtein?.let { "Kayıtlarındaki en güçlü protein kaynağı $it. " } ?: ""}$next"
    }

    private fun localProgramEvaluation(question: String, data: DashboardData?, locale: String): String? {
        val normalized = question.lowercase(java.util.Locale("tr", "TR"))
        val requested = normalized.contains("antrenman programımı değerlendir") || normalized.contains("programımı değerlendir") || normalized.contains("review my workout plan") || normalized.contains("evaluate my workout plan")
        if (!requested) return null
        val dashboard = data ?: return if (locale == "en") "I can't see your active workout plan yet." else "Aktif antrenman programını henüz göremiyorum."
        val workouts = dashboard.workouts
        if (workouts.isEmpty()) return if (locale == "en") "You don't have an active plan yet. Create one first, then I can assess its movements and volume." else "Aktif programın henüz yok. Önce program oluştur; ardından hareketlerini ve hacmini değerlendirebilirim."
        val totalSets = workouts.sumOf { it.sets }
        val areas = workouts.groupBy { it.area.ifBlank { if (locale == "en") "Full body" else "Tüm vücut" } }
            .entries.sortedByDescending { it.value.sumOf { exercise -> exercise.sets } }
            .take(5)
            .joinToString(" • ") { "${it.key}: ${it.value.sumOf { exercise -> exercise.sets }} set" }
        val weeklySessions = dashboard.sessions.count { session -> localDate(session.completedAt) >= LocalDate.now().minusDays(6) }
        val fatigue = dashboard.sessions.firstOrNull()?.fatigue
        if (locale == "en") {
            val load = when {
                totalSets < 9 -> "The session volume is light; add work only if you can recover well."
                totalSets > 24 -> "The session volume is high; prioritize form and recovery before adding more."
                else -> "The session volume is in a practical range for a focused day."
            }
            val recovery = fatigue?.let { if (it >= 4) "Your latest fatigue is $it/5, so keep the next session moderate." else "Your latest fatigue is $it/5, which supports normal progression." } ?: "Rate your fatigue after the next workout to personalize progression."
            return "Your active program has ${workouts.size} movements and $totalSets working sets. Distribution: $areas. You completed $weeklySessions workout${if (weeklySessions == 1) "" else "s"} in the last 7 days. $load $recovery"
        }
        val load = when {
            totalSets < 9 -> "Seans hacmi hafif; toparlanman iyiyse kademeli ekleme düşünebilirsin."
            totalSets > 24 -> "Seans hacmi yüksek; yeni set eklemeden önce form ve toparlanmayı önceliklendir."
            else -> "Seans hacmi odaklı bir antrenman günü için uygun aralıkta."
        }
        val recovery = fatigue?.let { if (it >= 4) "Son yorgunluk puanın $it/5; sonraki seansı orta zorlukta tut." else "Son yorgunluk puanın $it/5; normal ilerlemeye uygunsun." } ?: "Bir sonraki antrenman sonunda yorgunluğunu puanla; yük önerisi daha kişisel hâle gelir."
        return "Aktif programında ${workouts.size} hareket ve toplam $totalSets çalışma seti var. Dağılım: $areas. Son 7 günde $weeklySessions antrenman tamamladın. $load $recovery"
    }

    private fun parseProfile(json: JSONObject?, userId: String): ProfileData {
        val rawGoal = json?.stringOrNull("goal_text") ?: "Güçlenme"
        return ProfileData(
        id = userId,
        displayName = json?.stringOrNull("display_name") ?: auth.currentSession()?.user?.email?.substringBefore('@').orEmpty().ifBlank { "Sporcu" },
        weightKg = json?.doubleOrNull("weight_kg"),
        heightCm = json?.doubleOrNull("height_cm"),
        goal = rawGoal.substringBefore(" | "),
        isPremium = json?.optBoolean("is_premium") == true,
        age = json?.intOrNull("age"),
        gender = json?.stringOrNull("gender") ?: "",
        environment = json?.stringOrNull("environment") ?: "Evde",
        equipment = json?.stringOrNull("equipment_text") ?: "",
        historyAnswers = json?.optJSONArray("history_answers")?.let { array -> List(array.length()) { index -> array.optString(index) } }.orEmpty(),
        targetWeightKg = Regex("hedef:([0-9.]+)").find(rawGoal)?.groupValues?.getOrNull(1)?.toDoubleOrNull(),
        targetWeeks = Regex("hafta:([0-9]+)").find(rawGoal)?.groupValues?.getOrNull(1)?.toIntOrNull(),
        accountStatus = json?.optString("account_status", "active") ?: "active",
        avatarPath = json?.stringOrNull("avatar_path"),
    )
    }

    private suspend fun signedAvatarUrl(path: String): String {
        val response = rawHttp.request(
            url = "${com.hedefit.app.BuildConfig.SUPABASE_URL.trimEnd('/')}/storage/v1/object/sign/profile-avatars/${SupabaseRestClient.encode(path).replace("+", "%20")}",
            method = "POST",
            headers = mapOf("apikey" to com.hedefit.app.BuildConfig.SUPABASE_ANON_KEY, "Authorization" to "Bearer ${auth.validAccessToken()}", "Content-Type" to "application/json"),
            body = JSONObject().put("expiresIn", 86_400).toString(),
        ).requireSuccess("Profil fotoğrafı hazırlanamadı.").jsonObject()
        val signed = response.optString("signedURL").ifBlank { response.optString("signedUrl") }
        require(signed.isNotBlank()) { "Profil fotoğrafı bağlantısı oluşturulamadı." }
        return if (signed.startsWith("http")) signed else "${com.hedefit.app.BuildConfig.SUPABASE_URL.trimEnd('/')}/storage/v1$signed"
    }

    private suspend fun optionalSelect(table: String, query: String): JSONArray =
        runCatching { rest.select(table, query) }.getOrDefault(JSONArray())

    private fun parseWorkouts(array: JSONArray): List<WorkoutExerciseData> = buildList {
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val name = item.stringOrNull("name") ?: continue
            val sets = item.intOrNull("sets") ?: item.optString("sets").filter(Char::isDigit).take(2).toIntOrNull() ?: 3
            add(WorkoutExerciseData(
                id = item.stringOrNull("id") ?: name.lowercase().replace(' ', '-'),
                name = name,
                area = item.stringOrNull("area") ?: "Tüm Vücut",
                sets = sets.coerceIn(1, 20),
                reps = item.stringOrNull("reps") ?: "8–12",
                restSeconds = item.intOrNull("restSeconds") ?: 60,
            ))
        }
    }

    private fun parseWorkoutPrograms(array: JSONArray): List<WorkoutProgramData> = buildList {
        for (index in 0 until array.length()) array.optJSONObject(index)?.let { add(parseWorkoutProgram(it)) }
    }

    private fun parseWorkoutProgram(item: JSONObject) = WorkoutProgramData(
        id = item.optString("id"),
        name = item.optString("name", "Programım"),
        source = item.optString("source", "custom"),
        focusArea = item.optString("focus_area"),
        exercises = parseWorkouts(item.optJSONArray("exercises") ?: JSONArray()),
        isActive = item.optBoolean("is_active"),
        showOnHome = item.optBoolean("show_on_home"),
    )

    private fun parseSessions(array: JSONArray): List<WorkoutSessionData> = buildList {
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val rawNames = item.optJSONArray("exercise_names")?.let { values -> List(values.length()) { values.optString(it) }.filter(String::isNotBlank) }.orEmpty()
            val manualActivityKey = rawNames.firstOrNull { it.startsWith("activity:") }?.removePrefix("activity:")
            add(WorkoutSessionData(
                id = item.optString("id"), completedAt = item.optString("completed_at"),
                durationSeconds = item.optInt("duration_seconds"), calories = item.optInt("calories"),
                completedExercises = item.optInt("completed_exercises"), totalExercises = item.optInt("total_exercises"),
                fatigue = item.intOrNull("fatigue"),
                exerciseNames = rawNames.filterNot { it.startsWith("activity:") },
                difficulty = item.stringOrNull("difficulty"),
                painAreas = item.optJSONArray("pain_areas")?.let { values -> List(values.length()) { values.optString(it) }.filter(String::isNotBlank) }.orEmpty(),
                manualActivityKey = manualActivityKey,
            ))
        }
    }

    private fun parseExercisePerformance(exerciseLogs: JSONArray, setLogs: JSONArray): List<WorkoutExercisePerformanceData> {
        val setsByLog = buildMap<String, MutableList<WorkoutSetPerformanceData>> {
            for (index in 0 until setLogs.length()) {
                val item = setLogs.optJSONObject(index) ?: continue
                val logId = item.optString("exercise_log_id")
                getOrPut(logId) { mutableListOf() }.add(WorkoutSetPerformanceData(
                    setNumber = item.optInt("set_number"), weightKg = item.doubleOrNull("weight_kg"),
                    reps = item.intOrNull("reps"), durationSeconds = item.intOrNull("duration_seconds"), rpe = item.intOrNull("rpe"),
                ))
            }
        }
        return buildList {
            for (index in 0 until exerciseLogs.length()) {
                val item = exerciseLogs.optJSONObject(index) ?: continue
                add(WorkoutExercisePerformanceData(
                    sessionId = item.optString("session_id"), exerciseId = item.stringOrNull("exercise_id"),
                    exerciseName = item.optString("exercise_name"), completedAt = item.optString("completed_at"),
                    sets = setsByLog[item.optString("id")].orEmpty().sortedBy(WorkoutSetPerformanceData::setNumber),
                ))
            }
        }
    }

    private fun parseRouteActivities(array: JSONArray): List<RouteActivityData> = buildList {
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            add(RouteActivityData(
                id = item.optString("id"),
                activityType = item.optString("activity_type", "walk"),
                title = item.optString("title").ifBlank { item.optString("activity_type", "Aktivite") },
                startedAt = item.optString("started_at"),
                endedAt = item.optString("ended_at"),
                durationSeconds = item.optInt("duration_seconds"),
                movingDurationSeconds = item.optInt("moving_duration_seconds", item.optInt("duration_seconds")),
                distanceMeters = item.optDouble("distance_meters"),
                averagePaceSecondsPerKm = item.intOrNull("average_pace_seconds_per_km"),
                averageSpeedKmh = item.optDouble("average_speed_kmh"),
                calories = item.optInt("calories"),
                status = item.optString("status", "completed"),
                routePoints = item.optJSONArray("route_points")?.let { points -> buildList {
                    for (pointIndex in 0 until points.length()) points.optJSONObject(pointIndex)?.let { point -> add(ActivityRoutePointData(
                        latitude = point.optDouble("lat"), longitude = point.optDouble("lng"), recordedAt = point.optLong("time"),
                        accuracyMeters = point.optDouble("accuracy"), altitudeMeters = point.doubleOrNull("alt"),
                    )) }
                } }.orEmpty(),
            ))
        }
    }

    private fun parseNutritionLogs(array: JSONArray): List<NutritionLogData> = buildList {
        for (index in 0 until array.length()) array.optJSONObject(index)?.let { add(parseNutritionLog(it)) }
    }

    private fun parseNutritionLog(item: JSONObject) = NutritionLogData(
        id = item.optString("id"),
        date = item.stringOrNull("logged_date") ?: item.optString("consumed_at").take(10),
        meal = item.optString("meal", "Atıştırmalık"), name = item.optString("name"), calories = item.optInt("calories"),
        protein = item.optDouble("protein_g"), carbs = item.optDouble("carbs_g"), fat = item.optDouble("fat_g"),
        grams = item.doubleOrNull("grams") ?: item.optJSONObject("metadata")?.doubleOrNull("portionGrams"),
        fiber = item.doubleOrNull("fiber_g") ?: item.optJSONObject("metadata")?.doubleOrNull("fiber") ?: 0.0,
        sugar = item.optJSONObject("metadata")?.doubleOrNull("sugar") ?: item.optJSONObject("micros")?.doubleOrNull("sugar") ?: 0.0,
        sodiumMg = item.optJSONObject("metadata")?.doubleOrNull("sodiumMg") ?: item.optJSONObject("micros")?.doubleOrNull("sodiumMg") ?: 0.0,
        potassiumMg = item.optJSONObject("metadata")?.doubleOrNull("potassiumMg") ?: item.optJSONObject("micros")?.doubleOrNull("potassiumMg") ?: 0.0,
        calciumMg = item.optJSONObject("metadata")?.doubleOrNull("calciumMg") ?: item.optJSONObject("micros")?.doubleOrNull("calciumMg") ?: 0.0,
        ironMg = item.optJSONObject("metadata")?.doubleOrNull("ironMg") ?: item.optJSONObject("micros")?.doubleOrNull("ironMg") ?: 0.0,
        vitaminCMg = item.optJSONObject("metadata")?.doubleOrNull("vitaminCMg") ?: item.optJSONObject("micros")?.doubleOrNull("vitaminCMg") ?: 0.0,
    )

    private fun parseFoodSearch(item: JSONObject) = FoodSearchData(
        id = item.optString("id"), name = item.optString("name"), brand = item.stringOrNull("brand"), servingGrams = item.optDouble("servingGrams", 100.0),
        calories = item.optInt("calories"), protein = item.optDouble("protein"), carbs = item.optDouble("carbohydrates"), fat = item.optDouble("fat"), fiber = item.optDouble("fiber"),
        sugar = item.optDouble("sugar"), sodiumMg = item.optDouble("sodiumMg"), potassiumMg = item.optDouble("potassiumMg"), calciumMg = item.optDouble("calciumMg"),
        ironMg = item.optDouble("ironMg"), vitaminCMg = item.optDouble("vitaminCMg"), verified = item.optBoolean("verified"), source = item.optString("source"),
    )

    private fun parseFavorites(array: JSONArray): List<FavoriteMealData> = buildList {
        for (index in 0 until array.length()) array.optJSONObject(index)?.let { add(parseFavorite(it)) }
    }

    private fun parseMealPlanItems(array: JSONArray): List<MealPlanItemData> = buildList {
        for (index in 0 until array.length()) array.optJSONObject(index)?.let { add(parseMealPlanItem(it)) }
    }

    private fun parseMealPlanItem(item: JSONObject): MealPlanItemData {
        val micros = item.optJSONObject("micros") ?: JSONObject()
        return MealPlanItemData(
            id = item.optString("id"), plannedDate = item.optString("planned_date"), mealType = item.optString("meal_type", "snack"),
            name = item.optString("food_name"), grams = item.optDouble("grams"), calories = item.optInt("calories"),
            protein = item.optDouble("protein_g"), carbs = item.optDouble("carbs_g"), fat = item.optDouble("fat_g"), fiber = item.optDouble("fiber_g"),
            sugar = micros.optDouble("sugar"), sodiumMg = micros.optDouble("sodiumMg"), potassiumMg = micros.optDouble("potassiumMg"),
            calciumMg = micros.optDouble("calciumMg"), ironMg = micros.optDouble("ironMg"), vitaminCMg = micros.optDouble("vitaminCMg"),
            completed = item.optBoolean("completed"),
        )
    }

    private fun parseFavorite(item: JSONObject): FavoriteMealData {
        val micros = item.optJSONObject("micros") ?: JSONObject()
        return FavoriteMealData(item.optString("id"), item.optString("name"), item.optString("meal"), item.optDouble("grams", 100.0), item.optInt("calories"),
            item.optDouble("protein_g"), item.optDouble("carbs_g"), item.optDouble("fat_g"), item.optDouble("fiber_g"),
            listOf("sugar", "sodiumMg", "potassiumMg", "calciumMg", "ironMg", "vitaminCMg").associateWith { micros.optDouble(it) })
    }

    private fun parseSchedule(array: JSONArray): List<WorkoutScheduleData> = buildList {
        for (index in 0 until array.length()) array.optJSONObject(index)?.let { add(parseScheduleItem(it)) }
    }

    private fun parseScheduleItem(item: JSONObject) = WorkoutScheduleData(item.optString("id"), item.optString("scheduled_date"), item.optString("scheduled_time").take(5), item.optString("status"), item.stringOrNull("original_date"))

    private fun parseNutritionGoal(item: JSONObject?, profile: ProfileData): NutritionGoalData {
        val calories = item?.optInt("calorie_target")?.takeIf { it > 0 } ?: 2250
        if (item?.optBoolean("is_manual") == true) return NutritionGoalData(
            calories = calories,
            protein = item.optInt("protein_g").takeIf { it > 0 } ?: 110,
            carbs = item.optInt("carbs_g").takeIf { it > 0 } ?: 297,
            fat = item.optInt("fat_g").takeIf { it > 0 } ?: 69,
        )
        val weight = (profile.weightKg ?: 75.0).coerceIn(45.0, 90.0)
        val workoutDays = item?.optInt("workout_days")?.coerceIn(0, 7) ?: 3
        val multiplier = when { workoutDays == 0 -> 1.0; workoutDays <= 3 -> 1.2; else -> 1.4 }
        val proteinUpper = minOf(140, (calories * .275 / 4).toInt()).coerceAtLeast(50)
        val protein = (weight * multiplier).coerceIn(50.0, proteinUpper.toDouble()).roundToInt()
        val fat = (calories * .275 / 9).roundToInt()
        val carbs = ((calories - protein * 4 - fat * 9).coerceAtLeast(0) / 4.0).roundToInt()
        return NutritionGoalData(calories, protein, carbs, fat)
    }

    private fun parseMeasurements(array: JSONArray): List<BodyMeasurementData> = buildList {
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            add(parseMeasurement(item))
        }
    }

    private fun parseMeasurement(item: JSONObject) = BodyMeasurementData(
        date = item.optString("measured_at"),
        weightKg = item.doubleOrNull("weight_kg"),
        waistCm = item.doubleOrNull("waist_cm"),
        hipsCm = item.doubleOrNull("hips_cm"),
        chestCm = item.doubleOrNull("chest_cm"),
        armCm = item.doubleOrNull("arm_cm"),
        thighCm = item.doubleOrNull("thigh_cm"),
    )

    private fun localDate(instant: String): LocalDate = runCatching {
        Instant.parse(instant).atZone(ZoneId.systemDefault()).toLocalDate()
    }.getOrDefault(LocalDate.MIN)
}
