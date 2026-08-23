package com.hedefit.app.notifications

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.hedefit.app.MainActivity
import com.hedefit.app.R
import com.hedefit.app.ui.settings.AppPreferences
import java.util.Calendar

private const val CHANNEL_ID = "hedefit_routines"

class NotificationScheduler(private val context: Context) {
    private val alarmManager = context.getSystemService(AlarmManager::class.java)

    fun apply(preferences: AppPreferences) {
        cancelAll()
        if (!preferences.notificationsEnabled) return
        createChannel(context)
        preferences.notificationDays.forEach { day ->
            val intent = Intent(context, RoutineNotificationReceiver::class.java).putExtra("day", day)
            val pending = PendingIntent.getBroadcast(
                context, 700 + day, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val first = Calendar.getInstance().apply {
                set(Calendar.DAY_OF_WEEK, day)
                set(Calendar.HOUR_OF_DAY, preferences.notificationHour)
                set(Calendar.MINUTE, preferences.notificationMinute)
                set(Calendar.SECOND, 0)
                if (timeInMillis <= System.currentTimeMillis()) add(Calendar.WEEK_OF_YEAR, 1)
            }
            alarmManager.setInexactRepeating(AlarmManager.RTC_WAKEUP, first.timeInMillis, AlarmManager.INTERVAL_DAY * 7, pending)
        }
    }

    fun cancelAll() {
        (Calendar.SUNDAY..Calendar.SATURDAY).forEach { day ->
            val pending = PendingIntent.getBroadcast(
                context, 700 + day, Intent(context, RoutineNotificationReceiver::class.java),
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
            )
            if (pending != null) alarmManager.cancel(pending)
        }
    }
}

class RoutineNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        createChannel(context)
        if (android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val openApp = PendingIntent.getActivity(
            context, 900, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Bugünün hedefi hazır")
            .setContentText("Kısa bir antrenman bile serini korur. Planına göz at.")
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        NotificationManagerCompat.from(context).notify(1201, notification)
    }
}

private fun createChannel(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Antrenman hatırlatmaları", NotificationManager.IMPORTANCE_DEFAULT))
}
