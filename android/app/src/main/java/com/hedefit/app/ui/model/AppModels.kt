package com.hedefit.app.ui.model

import androidx.annotation.DrawableRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.ui.graphics.vector.ImageVector
import com.hedefit.app.R

enum class AppDestination(val label: String, val icon: ImageVector) {
    Home("Ana Sayfa", Icons.Default.Home),
    Workout("Antrenman", Icons.Default.FitnessCenter),
    Coach("Fit Koç", Icons.AutoMirrored.Filled.Chat),
    Nutrition("Beslenme", Icons.Default.Restaurant),
    Progress("İlerleme", Icons.Default.BarChart),
    ;

    fun localizedLabel(language: String) = if (language != "en") label else when (this) {
        Home -> "Home"
        Workout -> "Workout"
        Coach -> "Fit Coach"
        Nutrition -> "Nutrition"
        Progress -> "Progress"
    }
}

data class ExerciseUi(
    val name: String,
    val prescription: String,
    @DrawableRes val image: Int,
)

data class WorkoutDayUi(
    val day: String,
    val title: String,
    val progress: Float,
    val exercises: List<ExerciseUi>,
)

val weeklyWorkouts = listOf(
    WorkoutDayUi(
        "Pazartesi", "Üst Vücut", .70f,
        listOf(
            ExerciseUi("Bench Press", "4 × 8–10", R.drawable.exercise_bench_press),
            ExerciseUi("Lat Pulldown", "4 × 10–12", R.drawable.exercise_lat_pulldown),
            ExerciseUi("Dumbbell Curl", "3 × 10–12", R.drawable.exercise_curl),
        ),
    ),
    WorkoutDayUi(
        "Çarşamba", "Alt Vücut", .30f,
        listOf(
            ExerciseUi("Back Squat", "4 × 6–8", R.drawable.exercise_squat),
            ExerciseUi("Romanian Deadlift", "4 × 8–10", R.drawable.exercise_deadlift),
            ExerciseUi("Leg Press", "4 × 10–12", R.drawable.exercise_leg_press),
        ),
    ),
    WorkoutDayUi(
        "Cuma", "Tüm Vücut", 0f,
        listOf(
            ExerciseUi("Bench Press", "3 × 8", R.drawable.exercise_bench_press),
            ExerciseUi("Back Squat", "3 × 8", R.drawable.exercise_squat),
            ExerciseUi("Lat Pulldown", "3 × 12", R.drawable.exercise_lat_pulldown),
        ),
    ),
)
