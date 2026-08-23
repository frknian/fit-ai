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
import com.hedefit.app.data.model.WorkoutSetInput
import com.hedefit.app.data.model.WorkoutFeedbackData
import com.hedefit.app.data.model.WorkoutScheduleData
import com.hedefit.app.data.model.WorkoutProgramData
import com.hedefit.app.data.model.FavoriteMealData
import com.hedefit.app.data.model.FoodSearchData
import com.hedefit.app.data.model.ExerciseCatalogData
import com.hedefit.app.data.model.PreviousSetData
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

class HedefitRepository(
    private val auth: AuthRepository,
    private val rest: SupabaseRestClient,
    private val api: HedefitApiClient,
) {
    suspend fun saveRoute(snapshot: RouteSnapshot, activityType: String) {
        val points = JSONArray().also { array -> snapshot.points.forEach { point -> array.put(JSONObject().put("lat", point.latitude).put("lng", point.longitude).put("alt", point.altitude).put("time", point.recordedAt)) } }
        rest.insert("route_activities", JSONObject()
            .put("id", snapshot.id).put("user_id", requireNotNull(auth.userId())).put("activity_type", activityType)
            .put("started_at", Instant.ofEpochMilli(snapshot.startedAt).toString()).put("ended_at", Instant.ofEpochMilli(snapshot.stoppedAt).toString())
            .put("duration_seconds", snapshot.durationSeconds).put("distance_meters", snapshot.distanceMeters).put("route_points", points))
    }
    suspend fun loadDashboard(date: LocalDate = LocalDate.now()): DashboardData = coroutineScope {
        val userId = requireNotNull(auth.userId())
        val profileCall = async { rest.select("profiles", "select=*&id=eq.$userId&limit=1") }
        val planCall = async { rest.select("workout_plans", "select=workouts&user_id=eq.$userId&limit=1") }
        val sessionsCall = async { rest.select("workout_sessions", "select=*&user_id=eq.$userId&order=completed_at.desc&limit=40") }
        val nutritionCall = async { api.get("/api/nutrition/logs?date=$date").requireSuccess("Beslenme günlüğü yüklenemedi.").jsonObject() }
        val goalCall = async { optionalSelect("nutrition_goals", "select=*&user_id=eq.$userId&limit=1") }
        val stepsCall = async { optionalSelect("daily_steps", "select=steps&user_id=eq.$userId&local_date=eq.$date&limit=1") }
        val waterCall = async { optionalSelect("water_logs", "select=milliliters&user_id=eq.$userId&local_date=eq.$date&limit=1") }
        val sleepCall = async { optionalSelect("sleep_logs", "select=minutes&user_id=eq.$userId&local_date=eq.$date&limit=1") }
        val streakCall = async { optionalSelect("user_streaks", "select=current_streak&user_id=eq.$userId&limit=1") }
        val measurementsCall = async { optionalSelect("body_measurements", "select=*&user_id=eq.$userId&order=measured_at.asc&limit=90") }
        val scheduleCall = async { optionalSelect("workout_schedule", "select=*&user_id=eq.$userId&scheduled_date=gte.${date.minusDays(7)}&scheduled_date=lte.${date.plusDays(21)}&order=scheduled_date.asc") }
        val favoritesCall = async { optionalSelect("favorite_meals", "select=*&user_id=eq.$userId&order=updated_at.desc&limit=30") }
        val programsCall = async { optionalSelect("workout_program_collections", "select=*&user_id=eq.$userId&order=updated_at.desc&limit=50") }

        val profileJson = profileCall.await().optJSONObject(0)
        val profile = if (profileJson == null) {
            val displayName = auth.currentSession()?.user?.email?.substringBefore('@').orEmpty().ifBlank { "Sporcu" }
            rest.upsert("profiles", JSONObject().put("id", userId).put("display_name", displayName), "id")
            parseProfile(null, userId)
        } else parseProfile(profileJson, userId)
        val workouts = parseWorkouts(planCall.await().optJSONObject(0)?.optJSONArray("workouts") ?: JSONArray())
        val sessions = parseSessions(sessionsCall.await())
        val nutritionLogs = parseNutritionLogs(nutritionCall.await().optJSONArray("logs") ?: JSONArray())
        val nutritionGoal = parseNutritionGoal(goalCall.await().optJSONObject(0))
        val measurements = parseMeasurements(measurementsCall.await())

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
            workoutPrograms = parseWorkoutPrograms(programsCall.await()),
        )
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

    suspend fun syncHealth(snapshot: HealthSnapshot) {
        val userId = requireNotNull(auth.userId())
        rest.upsert("daily_steps", JSONObject().put("user_id", userId).put("local_date", snapshot.date.toString()).put("steps", snapshot.steps).put("source", "device").put("synced_at", Instant.now().toString()), "user_id,local_date")
        if (snapshot.sleepMinutes > 0) rest.upsert("sleep_logs", JSONObject().put("user_id", userId).put("local_date", snapshot.date.toString()).put("minutes", snapshot.sleepMinutes).put("quality", if (snapshot.sleepMinutes >= 420) "iyi" else "orta"), "user_id,local_date")
        snapshot.weightKg?.let { weight -> rest.upsert("body_measurements", JSONObject().put("id", UUID.randomUUID().toString()).put("user_id", userId).put("measured_at", snapshot.date.toString()).put("weight_kg", weight), "user_id,measured_at") }
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

    suspend fun searchFoods(query: String): List<FoodSearchData> {
        val response = api.get("/api/nutrition/foods?q=${java.net.URLEncoder.encode(query.trim(), Charsets.UTF_8.name())}").requireSuccess("Besin kataloğu aranamadı.").jsonObject()
        val array = response.optJSONArray("items") ?: JSONArray()
        return buildList { for (index in 0 until array.length()) array.optJSONObject(index)?.let { item -> add(parseFoodSearch(item)) } }
    }

    suspend fun addCatalogFood(food: FoodSearchData, grams: Double, meal: String, inputMethod: String = "search"): NutritionLogData {
        val body = catalogFoodPayload(food, grams, meal, inputMethod)
        return parseNutritionLog(api.post("/api/nutrition/logs", body).requireSuccess("Besin kaydedilemedi.").jsonObject().getJSONObject("log"))
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
        val ratio = 100.0 / favorite.grams.coerceAtLeast(1.0)
        val food = FoodSearchData(favorite.id, favorite.name, null, 100.0, (favorite.calories * ratio).toInt(), favorite.protein * ratio, favorite.carbs * ratio, favorite.fat * ratio, favorite.fiber * ratio,
            (favorite.micros["sugar"] ?: 0.0) * ratio, (favorite.micros["sodiumMg"] ?: 0.0) * ratio, (favorite.micros["potassiumMg"] ?: 0.0) * ratio,
            (favorite.micros["calciumMg"] ?: 0.0) * ratio, (favorite.micros["ironMg"] ?: 0.0) * ratio, (favorite.micros["vitaminCMg"] ?: 0.0) * ratio, true, "favorite")
        return addCatalogFood(food, favorite.grams, favorite.meal, "favorite")
    }

    suspend fun scheduleWorkout(date: LocalDate, time: String, status: String = "planned", originalDate: String? = null): WorkoutScheduleData {
        val row = JSONObject().put("id", UUID.randomUUID().toString()).put("user_id", requireNotNull(auth.userId())).put("scheduled_date", date.toString())
            .put("scheduled_time", time).put("status", status).put("original_date", originalDate ?: JSONObject.NULL).put("updated_at", Instant.now().toString())
        return parseScheduleItem(rest.upsert("workout_schedule", row, "user_id,scheduled_date"))
    }

    suspend fun loadExerciseCatalog(search: String = "", muscle: String = "", equipment: String = "", level: String = "", environment: String = "", muscleRole: String = "", force: String = "", mechanic: String = "", category: String = "", locale: String = "tr"): List<ExerciseCatalogData> {
        val encode = { value: String -> java.net.URLEncoder.encode(value, Charsets.UTF_8.name()) }
        val path = "/api/exercises?limit=1000&search=${encode(search)}&muscle=${encode(muscle)}&equipment=${encode(equipment)}&level=${encode(level)}&environment=${encode(environment)}&muscleRole=${encode(muscleRole)}&force=${encode(force)}&mechanic=${encode(mechanic)}&category=${encode(category)}&locale=${if (locale == "en") "en" else "tr"}"
        val array = api.get(path).requireSuccess("Egzersiz kütüphanesi yüklenemedi.").jsonObject().optJSONArray("items") ?: JSONArray()
        return buildList { for (index in 0 until array.length()) array.optJSONObject(index)?.let { item ->
            add(ExerciseCatalogData(item.optString("id"), item.optString("name"), item.optString("level"), item.optString("equipment"), item.optJSONArray("primaryMuscles")?.let { a -> List(a.length()) { a.optString(it) } }.orEmpty(), item.optJSONArray("instructions")?.let { a -> List(a.length()) { a.optString(it) } }.orEmpty(), item.optString("category"), item.optJSONArray("images")?.let { a -> List(a.length()) { a.optString(it) }.filter(String::isNotBlank) }.orEmpty()))
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

    suspend fun saveProgram(name: String, source: String, focusArea: String, workouts: List<WorkoutExerciseData>, id: String = UUID.randomUUID().toString()): WorkoutProgramData {
        val userId = requireNotNull(auth.userId())
        rest.update("workout_program_collections", "user_id=eq.$userId&is_active=eq.true", JSONObject().put("is_active", false).put("updated_at", Instant.now().toString()))
        val row = rest.upsert("workout_program_collections", JSONObject()
            .put("id", id).put("user_id", userId).put("name", name.trim().take(80)).put("source", source)
            .put("focus_area", focusArea).put("exercises", workoutsJson(workouts)).put("is_active", true).put("updated_at", Instant.now().toString()), "id")
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
            .put("metadata", JSONObject().put("client", "android"))
        val log = api.post("/api/nutrition/logs", body).requireSuccess("Öğün kaydedilemedi.").jsonObject().getJSONObject("log")
        return parseNutritionLog(log)
    }

    suspend fun sendChat(messages: List<Pair<String, Boolean>>, data: DashboardData?, locale: String = "tr"): ChatReplyData {
        val bodyMessages = JSONArray()
        messages.takeLast(12).forEach { (text, user) ->
            bodyMessages.put(JSONObject().put("role", if (user) "user" else "assistant").put("text", text))
        }
        val signals = JSONObject()
        data?.let {
            signals.put("profile", JSONObject()
                .put("heightCm", it.profile.heightCm ?: JSONObject.NULL)
                .put("weightKg", it.profile.weightKg ?: JSONObject.NULL))
            signals.put("today", JSONObject().put("workoutCompleted", it.sessions.any { session -> localDate(session.completedAt) == LocalDate.now() }))
            signals.put("activity", JSONObject().put("workoutsThisWeek", it.sessions.count { session -> localDate(session.completedAt) >= LocalDate.now().minusDays(7) }))
        }
        val response = api.post("/api/chat", JSONObject().put("messages", bodyMessages).put("signals", signals).put("locale", if (locale == "en") "en" else "tr"))
            .requireSuccess("Fit Koç yanıt veremedi.").jsonObject()
        val usage = response.optJSONObject("usage")
        return ChatReplyData(response.optString("text"), response.optString("source"), usage?.intOrNull("used"), usage?.intOrNull("limit"))
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
    )
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
    )

    private fun parseSessions(array: JSONArray): List<WorkoutSessionData> = buildList {
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            add(WorkoutSessionData(
                id = item.optString("id"), completedAt = item.optString("completed_at"),
                durationSeconds = item.optInt("duration_seconds"), calories = item.optInt("calories"),
                completedExercises = item.optInt("completed_exercises"), totalExercises = item.optInt("total_exercises"),
                fatigue = item.intOrNull("fatigue"),
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

    private fun parseNutritionGoal(item: JSONObject?) = NutritionGoalData(
        calories = item?.optInt("calorie_target")?.takeIf { it > 0 } ?: 2250,
        protein = item?.optInt("protein_g")?.takeIf { it > 0 } ?: 160,
        carbs = item?.optInt("carbs_g")?.takeIf { it > 0 } ?: 240,
        fat = item?.optInt("fat_g")?.takeIf { it > 0 } ?: 70,
    )

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
