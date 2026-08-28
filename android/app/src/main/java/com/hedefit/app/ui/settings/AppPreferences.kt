package com.hedefit.app.ui.settings

import android.content.Context

data class AppPreferences(
    val darkTheme: Boolean = true,
    val language: String = "tr",
    val notificationsEnabled: Boolean = false,
    val notificationHour: Int = 19,
    val notificationMinute: Int = 0,
    val notificationDays: Set<Int> = setOf(2, 4, 6),
    val stepGoal: Int = 8_000,
    val waterGoalMl: Int = 2_500,
    val stepCounterNotificationEnabled: Boolean = false,
    val weeklyWorkoutGoal: Int = 3,
    val coachName: String = "",
    val unitSystem: String = "metric",
    val accentHue: Float = 106f,
    val welcomeGuideSeen: Boolean = false,
)

class AppPreferencesStore(context: Context) {
    private val preferences = context.getSharedPreferences("hedefit_preferences", Context.MODE_PRIVATE)

    fun read() = AppPreferences(
        darkTheme = preferences.getBoolean("dark_theme", true),
        language = preferences.getString("language", "tr") ?: "tr",
        notificationsEnabled = preferences.getBoolean("notifications_enabled", false),
        notificationHour = preferences.getInt("notification_hour", 19),
        notificationMinute = preferences.getInt("notification_minute", 0),
        notificationDays = preferences.getStringSet("notification_days", setOf("2", "4", "6"))
            .orEmpty().mapNotNull(String::toIntOrNull).toSet(),
        stepGoal = preferences.getInt("step_goal", 8_000).coerceIn(1_000, 50_000),
        waterGoalMl = preferences.getInt("water_goal_ml", 2_500).coerceIn(500, 10_000),
        stepCounterNotificationEnabled = preferences.getBoolean("step_counter_notification_enabled", false),
        weeklyWorkoutGoal = preferences.getInt("weekly_workout_goal", 3).coerceIn(1, 7),
        coachName = preferences.getString("coach_name", "").orEmpty().take(24),
        unitSystem = preferences.getString("unit_system", "metric").let { if (it == "imperial") "imperial" else "metric" },
        accentHue = preferences.getFloat("accent_hue", 106f).coerceIn(0f, 360f),
        welcomeGuideSeen = preferences.getBoolean("welcome_guide_seen", false),
    )

    fun write(value: AppPreferences) {
        preferences.edit()
            .putBoolean("dark_theme", value.darkTheme)
            .putString("language", value.language)
            .putBoolean("notifications_enabled", value.notificationsEnabled)
            .putInt("notification_hour", value.notificationHour)
            .putInt("notification_minute", value.notificationMinute)
            .putStringSet("notification_days", value.notificationDays.map(Int::toString).toSet())
            .putInt("step_goal", value.stepGoal)
            .putInt("water_goal_ml", value.waterGoalMl.coerceIn(500, 10_000))
            .putBoolean("step_counter_notification_enabled", value.stepCounterNotificationEnabled)
            .putInt("weekly_workout_goal", value.weeklyWorkoutGoal)
            .putString("coach_name", value.coachName.take(24))
            .putString("unit_system", value.unitSystem)
            .putFloat("accent_hue", value.accentHue.coerceIn(0f, 360f))
            .putBoolean("welcome_guide_seen", value.welcomeGuideSeen)
            .apply()
    }
}
