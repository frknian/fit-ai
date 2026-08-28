package com.hedefit.app.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.hedefit.app.MainActivity
import com.hedefit.app.R
import com.hedefit.app.data.model.DashboardData
import com.hedefit.app.route.RouteSnapshot
import com.hedefit.app.route.formatDuration
import java.time.LocalDate

/** A small process-independent snapshot shared by Compose, notifications and App Widgets. */
object HedefitWidgetData {
    private const val FILE = "hedefit-widget-data"
    private var lastRouteWidgetUpdate = 0L

    fun write(context: Context, dashboard: DashboardData?, route: RouteSnapshot = RouteSnapshot(), stepGoal: Int = 10_000) {
        val data = dashboard ?: return
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putInt("steps", data.steps.coerceAtLeast(0))
            .putInt("step_goal", stepGoal.coerceIn(1_000, 50_000))
            .putInt("calories", data.activeCalories.coerceAtLeast(0))
            .putInt("water", data.waterMl.coerceAtLeast(0))
            .putInt("protein", data.nutritionLogs.sumOf { it.protein }.toInt().coerceAtLeast(0))
            .putString("weight", data.measurements.lastOrNull()?.weightKg?.let { "%.1f kg".format(it) }.orEmpty())
            .putString("program", data.workoutPrograms.firstOrNull { it.isActive }?.name.orEmpty())
            .putBoolean("route_active", route.tracking)
            .putString("route_type", route.activityType)
            .putLong("route_distance", java.lang.Double.doubleToRawLongBits(route.distanceMeters))
            .putInt("route_seconds", route.durationSeconds)
            .putString("local_date", LocalDate.now().toString())
            .apply()
        HedefitWidgets.refresh(context)
    }

    fun writeRoute(context: Context, route: RouteSnapshot) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putBoolean("route_active", route.tracking).putString("route_type", route.activityType)
            .putLong("route_distance", java.lang.Double.doubleToRawLongBits(route.distanceMeters)).putInt("route_seconds", route.durationSeconds).apply()
        val now = android.os.SystemClock.elapsedRealtime()
        if (!route.tracking || now - lastRouteWidgetUpdate >= 15_000L) {
            lastRouteWidgetUpdate = now
            HedefitWidgets.refresh(context)
        }
    }

    fun writeWorkoutState(context: Context, active: Boolean) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putBoolean("workout_active", active).apply()
        HedefitWidgets.refresh(context)
    }

    fun read(context: Context): WidgetSnapshot {
        val p = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        val currentDay = p.getString("local_date", null) == LocalDate.now().toString()
        return WidgetSnapshot(
            if (currentDay) p.getInt("steps", 0) else 0, p.getInt("step_goal", 10_000), if (currentDay) p.getInt("calories", 0) else 0, if (currentDay) p.getInt("water", 0) else 0, if (currentDay) p.getInt("protein", 0) else 0, p.getString("weight", "").orEmpty(), p.getString("program", "").orEmpty(),
            p.getBoolean("workout_active", false), p.getBoolean("route_active", false), p.getString("route_type", "Yürüyüş").orEmpty(),
            java.lang.Double.longBitsToDouble(p.getLong("route_distance", 0)).takeIf { it.isFinite() } ?: 0.0, p.getInt("route_seconds", 0),
        )
    }

    fun resetDaily(context: Context) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putInt("steps", 0).putInt("calories", 0).putInt("water", 0).putInt("protein", 0)
            .putString("local_date", LocalDate.now().toString()).apply()
        HedefitWidgets.refresh(context)
    }
}

data class WidgetSnapshot(val steps: Int, val stepGoal: Int, val calories: Int, val waterMl: Int, val proteinGrams: Int, val weight: String, val program: String, val workoutActive: Boolean, val routeActive: Boolean, val routeType: String, val routeDistance: Double, val routeSeconds: Int)

data class CustomWidgetConfig(val primary: String = "steps", val secondary: String = "calories", val action: String = "open", val theme: String = "minimal")

object CustomWidgetConfigStore {
    private const val FILE = "hedefit-custom-widgets"
    fun read(context: Context, id: Int): CustomWidgetConfig {
        val p = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        return CustomWidgetConfig(p.getString("$id-primary", "steps").orEmpty(), p.getString("$id-secondary", "calories").orEmpty(), p.getString("$id-action", "open").orEmpty(), p.getString("$id-theme", "minimal").orEmpty())
    }
    fun write(context: Context, id: Int, config: CustomWidgetConfig) { context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString("$id-primary", config.primary).putString("$id-secondary", config.secondary).putString("$id-action", config.action).putString("$id-theme", config.theme).apply() }
    fun delete(context: Context, id: Int) { context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().remove("$id-primary").remove("$id-secondary").remove("$id-action").remove("$id-theme").apply() }
}

object HedefitWidgets {
    private val providers = listOf(DashboardWidget::class.java, ActivityWidget::class.java, WorkoutWidget::class.java, RouteWidget::class.java, CaloriesWidget::class.java, CustomWidget::class.java)
    fun refresh(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        providers.forEach { type -> manager.getAppWidgetIds(ComponentName(context, type)).takeIf { it.isNotEmpty() }?.let { ids ->
            ids.forEach { id -> render(context, manager, id, type.simpleName ?: "") }
        } }
    }

    fun render(context: Context, manager: AppWidgetManager, id: Int, type: String) {
        val data = HedefitWidgetData.read(context)
        val views = RemoteViews(context.packageName, R.layout.widget_hedefit)
        val routeLine = "%.2f km • %s".format(data.routeDistance / 1_000.0, formatDuration(data.routeSeconds))
        val custom = if (type == "CustomWidget") CustomWidgetConfigStore.read(context, id) else null
        val (title, primary, secondary) = when (type) {
            "ActivityWidget" -> Triple("Aktivite", "%,d adım • %d kcal".format(data.steps, data.calories), "Su: ${data.waterMl} ml")
            "WorkoutWidget" -> Triple("Antrenman", if (data.workoutActive) "ANTRENMAN AKTİF" else data.program.ifBlank { "Sıradaki antrenman" }, if (data.routeActive) "Aktivite sürüyor" else if (data.workoutActive) "Devam etmek için dokun" else "Başlamak için dokun")
            "RouteWidget" -> Triple("Hedefit Rota", if (data.routeActive) "${data.routeType} aktif" else "Yürüyüş • Koşu • Bisiklet", if (data.routeActive) routeLine else "Rota başlat")
            "CaloriesWidget" -> Triple("Aktif Kalori", "${data.calories} kcal", "Günlük aktivite")
            "CustomWidget" -> Triple(if (custom?.theme == "action") "Hızlı İşlem" else "Kendi Widget'ın", customMetric(data, custom?.primary ?: "steps"), customMetric(data, custom?.secondary ?: "calories"))
            else -> when { data.routeActive -> Triple("${data.routeType.uppercase()} AKTİF", routeLine, "Devam etmek için dokun"); data.workoutActive -> Triple("ANTRENMAN AKTİF", data.program.ifBlank { "Antrenman" }, "Devam etmek için dokun"); else -> Triple("Hedefit • BUGÜN", "%,d adım    %d kcal".format(data.steps, data.calories), "Su ${data.waterMl} ml") }
        }
        views.setTextViewText(R.id.widget_title, title)
        views.setTextViewText(R.id.widget_primary, primary)
        views.setTextViewText(R.id.widget_secondary, secondary)
        val action = custom?.action ?: if (type == "RouteWidget") "route" else "open"
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, id, Intent(context, MainActivity::class.java).apply {
            when (action) { "route", "walk", "run" -> putExtra("open_route", true); "workout" -> putExtra("open_workout", true); "meal" -> putExtra("open_nutrition", true) }
        }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        manager.updateAppWidget(id, views)
    }

    private fun customMetric(data: WidgetSnapshot, key: String): String = when (key) {
        "calories" -> "${data.calories} aktif kcal"
        "water" -> "${data.waterMl} ml su"
        "protein" -> "${data.proteinGrams} g protein"
        "distance" -> "%.2f km".format(data.routeDistance / 1_000.0)
        "active_time" -> formatDuration(data.routeSeconds)
        "weight" -> data.weight.ifBlank { "Kilo —" }
        "workout" -> data.program.ifBlank { "Antrenman" }
        "remaining_steps" -> "${(data.stepGoal - data.steps).coerceAtLeast(0)} adım kaldı"
        "pace" -> if (data.routeDistance >= 50) "${formatDuration((data.routeSeconds / (data.routeDistance / 1_000.0)).toInt())}/km" else "Tempo —"
        else -> "%,d adım".format(data.steps)
    }
}

abstract class HedefitWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { ids.forEach { HedefitWidgets.render(context, manager, it, javaClass.simpleName) } }
}
class DashboardWidget : HedefitWidgetProvider()
class ActivityWidget : HedefitWidgetProvider()
class WorkoutWidget : HedefitWidgetProvider()
class RouteWidget : HedefitWidgetProvider()
class CaloriesWidget : HedefitWidgetProvider()
class CustomWidget : HedefitWidgetProvider() {
    override fun onDeleted(context: Context, ids: IntArray) { ids.forEach { CustomWidgetConfigStore.delete(context, it) } }
}
