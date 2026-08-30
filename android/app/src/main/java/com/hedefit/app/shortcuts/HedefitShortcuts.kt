package com.hedefit.app.shortcuts

import android.content.Context
import android.content.ComponentName
import android.content.Intent
import android.appwidget.AppWidgetManager
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import com.hedefit.app.MainActivity
import com.hedefit.app.R
import com.hedefit.app.widgets.ActivityWidget
import com.hedefit.app.widgets.CaloriesWidget
import com.hedefit.app.widgets.CustomWidget
import com.hedefit.app.widgets.DashboardWidget
import com.hedefit.app.widgets.RouteWidget
import com.hedefit.app.widgets.WorkoutWidget

object HedefitShortcuts {
    fun requestWidget(context: Context, type: String): Boolean {
        val manager = AppWidgetManager.getInstance(context)
        if (!manager.isRequestPinAppWidgetSupported) return false
        val provider = when (type.removePrefix("widget_")) {
            "dashboard" -> DashboardWidget::class.java
            "activity" -> ActivityWidget::class.java
            "workout" -> WorkoutWidget::class.java
            "route" -> RouteWidget::class.java
            "calories" -> CaloriesWidget::class.java
            "custom" -> CustomWidget::class.java
            else -> return false
        }
        return manager.requestPinAppWidget(ComponentName(context, provider), null, null)
    }

    fun request(context: Context, type: String): Boolean {
        val manager = context.getSystemService(ShortcutManager::class.java)
        if (!manager.isRequestPinShortcutSupported) return false
        val (label, extra) = when (type) {
            "route" -> "Hedefit Rota" to "open_route"
            "workout" -> "Antrenmanı Aç" to "open_workout"
            "activity" -> "Spor Ekle" to "open_activity"
            else -> "Öğün Ekle" to "open_nutrition"
        }
        val launch = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).putExtra(extra, true)
        val shortcut = ShortcutInfo.Builder(context, "hedefit-$type")
            .setShortLabel(label).setLongLabel(label).setIcon(Icon.createWithResource(context, R.drawable.ic_launcher)).setIntent(launch).build()
        return manager.requestPinShortcut(shortcut, null)
    }
}
