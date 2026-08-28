package com.hedefit.app.data.model

import java.time.LocalDate

data class ProfileData(
    val id: String,
    val displayName: String,
    val weightKg: Double?,
    val heightCm: Double?,
    val goal: String,
    val isPremium: Boolean,
    val age: Int? = null,
    val gender: String = "",
    val environment: String = "Evde",
    val equipment: String = "",
    val historyAnswers: List<String> = emptyList(),
    val targetWeightKg: Double? = null,
    val targetWeeks: Int? = null,
    val accountStatus: String = "active",
    val avatarPath: String? = null,
    val avatarUrl: String? = null,
)

data class ProfileUpdateData(
    val displayName: String,
    val age: Int?,
    val gender: String,
    val heightCm: Double?,
    val weightKg: Double?,
    val goalType: String,
    val targetWeightKg: Double?,
    val targetWeeks: Int?,
    val environment: String,
    val equipment: String,
    val historyAnswers: List<String>,
)

data class WorkoutExerciseData(
    val id: String,
    val name: String,
    val area: String,
    val sets: Int,
    val reps: String,
    val restSeconds: Int,
)

data class WorkoutProgramData(
    val id: String,
    val name: String,
    val source: String,
    val focusArea: String,
    val exercises: List<WorkoutExerciseData>,
    val isActive: Boolean,
    val showOnHome: Boolean = false,
)

data class WorkoutSessionData(
    val id: String,
    val completedAt: String,
    val durationSeconds: Int,
    val calories: Int,
    val completedExercises: Int,
    val totalExercises: Int,
    val fatigue: Int?,
    val exerciseNames: List<String> = emptyList(),
    val difficulty: String? = null,
    val painAreas: List<String> = emptyList(),
)

data class WorkoutSetPerformanceData(
    val setNumber: Int,
    val weightKg: Double?,
    val reps: Int?,
    val durationSeconds: Int?,
    val rpe: Int?,
)

data class WorkoutExercisePerformanceData(
    val sessionId: String,
    val exerciseId: String?,
    val exerciseName: String,
    val completedAt: String,
    val sets: List<WorkoutSetPerformanceData>,
)

data class RouteActivityData(
    val id: String,
    val activityType: String,
    val title: String,
    val startedAt: String,
    val endedAt: String,
    val durationSeconds: Int,
    val movingDurationSeconds: Int,
    val distanceMeters: Double,
    val averagePaceSecondsPerKm: Int? = null,
    val averageSpeedKmh: Double = 0.0,
    val calories: Int = 0,
    val status: String = "completed",
    val routePoints: List<ActivityRoutePointData> = emptyList(),
)

data class ActivityRoutePointData(
    val latitude: Double,
    val longitude: Double,
    val recordedAt: Long,
    val accuracyMeters: Double = 0.0,
    val altitudeMeters: Double? = null,
)

data class WorkoutSetInput(
    val exerciseId: String,
    val exerciseName: String,
    val exerciseOrder: Int,
    val setNumber: Int,
    val weightKg: Double?,
    val reps: Int?,
    val durationSeconds: Int?,
    val rpe: Int?,
    val setType: String = "normal",
    val note: String = "",
)

data class PreviousSetData(val setNumber: Int, val weightKg: Double?, val reps: Int?, val rpe: Int?)

data class WorkoutFeedbackData(
    val difficulty: String = "Uygun",
    val fatigue: Int = 3,
    val painAreas: List<String> = listOf("Yok"),
    val note: String = "",
)

data class WorkoutScheduleData(
    val id: String,
    val date: String,
    val time: String,
    val status: String,
    val originalDate: String?,
)

data class NutritionLogData(
    val id: String,
    val date: String,
    val meal: String,
    val name: String,
    val calories: Int,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val grams: Double?,
    val fiber: Double = 0.0,
    val sugar: Double = 0.0,
    val sodiumMg: Double = 0.0,
    val potassiumMg: Double = 0.0,
    val calciumMg: Double = 0.0,
    val ironMg: Double = 0.0,
    val vitaminCMg: Double = 0.0,
)

data class FoodSearchData(
    val id: String,
    val name: String,
    val brand: String?,
    val servingGrams: Double,
    val calories: Int,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
    val sugar: Double,
    val sodiumMg: Double,
    val potassiumMg: Double,
    val calciumMg: Double,
    val ironMg: Double,
    val vitaminCMg: Double,
    val verified: Boolean,
    val source: String,
)

data class FavoriteMealData(
    val id: String,
    val name: String,
    val meal: String,
    val grams: Double,
    val calories: Int,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
    val micros: Map<String, Double>,
)

data class ExerciseCatalogData(
    val id: String,
    val name: String,
    val level: String,
    val equipment: String,
    val primaryMuscles: List<String>,
    val instructions: List<String>,
    val category: String,
    val imageUrls: List<String>,
    val secondaryMuscles: List<String> = emptyList(),
    val force: String = "",
    val mechanic: String = "",
)

data class NutritionGoalData(
    val calories: Int = 2250,
    val protein: Int = 160,
    val carbs: Int = 240,
    val fat: Int = 70,
)

data class BodyMeasurementData(
    val date: String,
    val weightKg: Double?,
    val waistCm: Double?,
    val hipsCm: Double?,
    val chestCm: Double?,
    val armCm: Double?,
    val thighCm: Double?,
)

data class DashboardData(
    val profile: ProfileData,
    val workouts: List<WorkoutExerciseData>,
    val sessions: List<WorkoutSessionData>,
    val nutritionLogs: List<NutritionLogData>,
    val nutritionGoal: NutritionGoalData,
    val steps: Int,
    val waterMl: Int,
    val sleepMinutes: Int,
    val streakDays: Int,
    val measurements: List<BodyMeasurementData>,
    val loadedDate: LocalDate,
    val activeCalories: Int = 0,
    val schedule: List<WorkoutScheduleData> = emptyList(),
    val favoriteMeals: List<FavoriteMealData> = emptyList(),
    val workoutPrograms: List<WorkoutProgramData> = emptyList(),
    val routeActivities: List<RouteActivityData> = emptyList(),
    val exercisePerformance: List<WorkoutExercisePerformanceData> = emptyList(),
    val stepHistory: List<DailyStepData> = emptyList(),
    val gamificationTotalXp: Int? = null,
    val gamificationWeeklyXp: Int? = null,
    val unlockedAchievements: Map<String, LocalDate> = emptyMap(),
)

data class DailyStepData(val localDate: LocalDate, val steps: Int)

data class NutritionEstimateData(
    val name: String,
    val grams: Double,
    val calories: Int,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
    val sugar: Double = 0.0,
    val sodiumMg: Double = 0.0,
    val potassiumMg: Double = 0.0,
    val calciumMg: Double = 0.0,
    val ironMg: Double = 0.0,
    val vitaminCMg: Double = 0.0,
    val confidence: Double,
)

data class ChatReplyData(
    val text: String,
    val source: String,
    val used: Int?,
    val limit: Int?,
)
