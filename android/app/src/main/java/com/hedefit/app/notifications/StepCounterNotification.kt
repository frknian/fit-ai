package com.hedefit.app.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.Manifest
import android.content.Intent
import android.app.PendingIntent
import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.hedefit.app.R
import com.hedefit.app.widgets.HedefitWidgetData
import java.time.LocalDate
import java.time.ZoneId

object StepCounterNotification {
    private const val CHANNEL_ID = "hedefit_step_counter_v2"
    private const val NOTIFICATION_ID = 1210
    private var lastSteps = -1
    private var lastGoal = -1
    private var lastPublishedAt = 0L

    private const val STATE_FILE = "hedefit-step-notification"

    fun show(context: Context, steps: Int, goal: Int, activeCalories: Int = steps / 25) {
        if (android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val safeSteps = steps.coerceAtLeast(0)
        val safeGoal = goal.coerceAtLeast(1)
        val safeCalories = activeCalories.coerceAtLeast(0)
        val now = android.os.SystemClock.elapsedRealtime()
        // A visible update every 25 steps, or a refresh after 30 seconds, prevents notification churn.
        if (lastSteps >= 0 && kotlin.math.abs(safeSteps - lastSteps) < 25 && safeGoal == lastGoal && now - lastPublishedAt < 30_000L) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Hedefit Adım Sayacı", NotificationManager.IMPORTANCE_DEFAULT).apply {
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
            description = "Günlük adım ve hedef ilerlemesi"
        })
        val stepsText = "%,d".format(safeSteps).replace(',', '.')
        val remaining = (safeGoal - safeSteps).coerceAtLeast(0)
        val remainingText = "%,d".format(remaining).replace(',', '.')
        val content = "$stepsText adım | $remainingText kaldı | $safeCalories kcal"
        val open = PendingIntent.getActivity(context, 1210, Intent(context, com.hedefit.app.MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val walk = PendingIntent.getActivity(context, 1211, Intent(context, com.hedefit.app.MainActivity::class.java).putExtra("open_route", true), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_running)
            .setContentTitle("Hedefit")
            .setContentText(content)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setContentIntent(open)
            .addAction(R.drawable.ic_notification_running, "Yürüyüş Başlat", walk)
            .addAction(R.drawable.ic_notification_running, "Hedefit'i Aç", open)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setGroup("hedefit_activity")
            .setSortKey("00_steps")
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        context.getSharedPreferences(STATE_FILE, Context.MODE_PRIVATE).edit()
            .putInt("goal", safeGoal).putBoolean("enabled", true).apply()
        scheduleMidnightReset(context)
        lastSteps = safeSteps
        lastGoal = safeGoal
        lastPublishedAt = now
    }

    fun scheduleMidnightReset(context: Context) {
        val zone = ZoneId.systemDefault()
        val triggerAt = LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli() + 1_000L
        val intent = PendingIntent.getBroadcast(context, 1212, Intent(context, StepMidnightResetReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, intent)
    }

    fun resetForNewDay(context: Context) {
        val state = context.getSharedPreferences(STATE_FILE, Context.MODE_PRIVATE)
        if (!state.getBoolean("enabled", false)) return
        val goal = state.getInt("goal", 10_000)
        HedefitWidgetData.resetDaily(context)
        lastSteps = -1
        show(context, 0, goal, 0)
    }

    fun cancel(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        context.getSharedPreferences(STATE_FILE, Context.MODE_PRIVATE).edit().putBoolean("enabled", false).apply()
        val intent = PendingIntent.getBroadcast(context, 1212, Intent(context, StepMidnightResetReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        context.getSystemService(AlarmManager::class.java).cancel(intent)
        lastSteps = -1
    }
}

class StepMidnightResetReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) = StepCounterNotification.resetForNewDay(context)
}
