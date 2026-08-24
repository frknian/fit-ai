package com.hedefit.app.route

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.hedefit.app.MainActivity
import com.hedefit.app.R
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class RoutePoint(val latitude: Double, val longitude: Double, val altitude: Double, val recordedAt: Long)
data class RouteSnapshot(
    val id: String = "",
    val tracking: Boolean = false,
    val startedAt: Long = 0,
    val stoppedAt: Long = 0,
    val distanceMeters: Double = 0.0,
    val points: List<RoutePoint> = emptyList(),
) {
    val durationSeconds: Int get() = if (startedAt <= 0) 0 else (((if (tracking) System.currentTimeMillis() else stoppedAt) - startedAt) / 1_000).toInt().coerceAtLeast(0)
    val paceSecondsPerKm: Int? get() = if (distanceMeters < 50) null else (durationSeconds / (distanceMeters / 1_000.0)).toInt()
    val averageSpeedKmh: Double get() = if (durationSeconds < 1) 0.0 else distanceMeters / durationSeconds * 3.6
    val currentSpeedKmh: Double get() {
        val recent = points.takeLast(2)
        if (recent.size < 2) return 0.0
        val seconds = (recent[1].recordedAt - recent[0].recordedAt) / 1_000.0
        if (seconds <= 0 || seconds > 20) return 0.0
        val result = FloatArray(1)
        Location.distanceBetween(recent[0].latitude, recent[0].longitude, recent[1].latitude, recent[1].longitude, result)
        return (result[0] / seconds * 3.6).coerceIn(0.0, 80.0)
    }
}

class RouteTrackingStore(context: Context) {
    private val preferences = context.getSharedPreferences("hedefit-route", Context.MODE_PRIVATE)
    private var activeCache: RouteSnapshot? = null

    fun read(): RouteSnapshot = readFromDisk()

    fun readSummary(): RouteSnapshot = RouteSnapshot(
        id = preferences.getString("summary_id", "").orEmpty(),
        tracking = preferences.getBoolean("summary_tracking", false),
        startedAt = preferences.getLong("summary_started", 0),
        stoppedAt = preferences.getLong("summary_stopped", 0),
        distanceMeters = java.lang.Double.longBitsToDouble(preferences.getLong("summary_distance", 0)),
    )

    private fun readFromDisk(): RouteSnapshot = runCatching {
        val root = JSONObject(preferences.getString("active", "{}") ?: "{}")
        val raw = root.optJSONArray("points") ?: JSONArray()
        RouteSnapshot(
            id = root.optString("id"), tracking = root.optBoolean("tracking"), startedAt = root.optLong("startedAt"), stoppedAt = root.optLong("stoppedAt"),
            distanceMeters = root.optDouble("distanceMeters"),
            points = List(raw.length()) { index -> raw.getJSONObject(index).let { RoutePoint(it.getDouble("lat"), it.getDouble("lng"), it.optDouble("alt"), it.getLong("time")) } },
        )
    }.getOrDefault(RouteSnapshot())

    fun start(startedAt: Long = System.currentTimeMillis()): RouteSnapshot =
        RouteSnapshot(
            id = UUID.randomUUID().toString(),
            tracking = true,
            startedAt = startedAt,
        ).also(::write)
    fun stop(): RouteSnapshot = (activeCache?.takeIf { it.tracking } ?: read()).let { stopped -> stopped.copy(tracking = false, stoppedAt = System.currentTimeMillis()) }.also(::write)
    fun append(location: Location): RouteSnapshot {
        val current = activeCache?.takeIf { it.tracking } ?: read()
        if (!current.tracking) return current
        val point = RoutePoint(location.latitude, location.longitude, location.altitude, System.currentTimeMillis())
        val last = current.points.lastOrNull()
        val extra = if (last == null) 0.0 else FloatArray(1).also { Location.distanceBetween(last.latitude, last.longitude, point.latitude, point.longitude, it) }[0].toDouble()
        val next = current.copy(distanceMeters = current.distanceMeters + extra.coerceIn(0.0, 250.0), points = (current.points + point).takeLast(12_000))
        write(next)
        return next
    }

    private fun write(snapshot: RouteSnapshot) {
        activeCache = snapshot
        val points = JSONArray().also { array -> snapshot.points.forEach { array.put(JSONObject().put("lat", it.latitude).put("lng", it.longitude).put("alt", it.altitude).put("time", it.recordedAt)) } }
        val root = JSONObject().put("id", snapshot.id).put("tracking", snapshot.tracking).put("startedAt", snapshot.startedAt).put("stoppedAt", snapshot.stoppedAt).put("distanceMeters", snapshot.distanceMeters).put("points", points)
        preferences.edit().putString("active", root.toString())
            .putString("summary_id", snapshot.id).putBoolean("summary_tracking", snapshot.tracking)
            .putLong("summary_started", snapshot.startedAt).putLong("summary_stopped", snapshot.stoppedAt)
            .putLong("summary_distance", java.lang.Double.doubleToRawLongBits(snapshot.distanceMeters)).apply()
    }
}

class RouteTrackingService : Service(), LocationListener {
    private lateinit var locationManager: LocationManager
    private lateinit var store: RouteTrackingStore

    override fun onCreate() {
        super.onCreate()
        store = RouteTrackingStore(this)
        locationManager = getSystemService(LocationManager::class.java)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            store.stop(); stopLocation(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY
        }
        if (!store.read().tracking) store.start()
        startForeground(NOTIFICATION_ID, notification(store.read()))
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            store.stop(); stopSelf(); return START_NOT_STICKY
        }
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2_000L, 3f, this, Looper.getMainLooper())
        return START_STICKY
    }

    override fun onLocationChanged(location: Location) {
        if (location.accuracy > 60f) return
        val snapshot = store.append(location)
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(snapshot))
    }

    override fun onDestroy() { stopLocation(); super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null

    private fun stopLocation() = runCatching { locationManager.removeUpdates(this) }.getOrNull()
    private fun createChannel() {
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL_ID, "Hedefit Rota", NotificationManager.IMPORTANCE_LOW))
    }
    private fun notification(snapshot: RouteSnapshot): android.app.Notification {
        val open = PendingIntent.getActivity(this, 10, Intent(this, MainActivity::class.java).putExtra("open_route", true), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 11, Intent(this, RouteTrackingService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL_ID).setSmallIcon(R.drawable.ic_launcher).setContentTitle("Hedefit Rota kaydediliyor")
            .setContentText("%.2f km • %s".format(snapshot.distanceMeters / 1_000.0, formatDuration(snapshot.durationSeconds))).setOngoing(true).setContentIntent(open)
            .addAction(0, "Bitir", stop).setOnlyAlertOnce(true).build()
    }

    companion object {
        const val ACTION_STOP = "com.hedefit.app.route.STOP"
        private const val CHANNEL_ID = "hedefit-route-tracking"
        private const val NOTIFICATION_ID = 4102
    }
}

fun formatDuration(seconds: Int) = "%02d:%02d:%02d".format(seconds / 3600, (seconds % 3600) / 60, seconds % 60)
fun formatPace(seconds: Int?) = seconds?.let { "%d:%02d /km".format(it / 60, it % 60) } ?: "— /km"
