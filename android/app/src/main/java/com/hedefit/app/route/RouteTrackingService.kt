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
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.Granularity
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.hedefit.app.MainActivity
import com.hedefit.app.R
import com.hedefit.app.widgets.HedefitWidgetData
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class RoutePoint(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double,
    val recordedAt: Long,
    val accuracyMeters: Double = 0.0,
    val speedMetersPerSecond: Double? = null,
    val bearingDegrees: Double? = null,
)
private fun safeDistanceMeters(value: Double): Double = value.takeIf { it.isFinite() && it >= 0.0 } ?: 0.0

enum class ActivitySessionStatus { IDLE, PREPARING_GPS, COUNTDOWN, ACTIVE, PAUSED, FINISHING, COMPLETED }

data class RouteSnapshot(
    val id: String = "",
    val tracking: Boolean = false,
    val startedAt: Long = 0,
    val stoppedAt: Long = 0,
    val distanceMeters: Double = 0.0,
    val points: List<RoutePoint> = emptyList(),
    val activityType: String = "Koşu",
    val paused: Boolean = false,
    val pausedAt: Long = 0,
    val pausedDurationMs: Long = 0,
    val startedElapsedRealtime: Long = 0,
    val pausedElapsedRealtime: Long = 0,
    val stoppedElapsedRealtime: Long = 0,
) {
    private val sessionEndWall: Long get() = if (tracking && !paused) System.currentTimeMillis() else if (paused) pausedAt else stoppedAt
    private val sessionEndRealtime: Long get() = if (tracking && !paused) SystemClock.elapsedRealtime() else if (paused) pausedElapsedRealtime else stoppedElapsedRealtime
    val status: ActivitySessionStatus get() = when { tracking && paused -> ActivitySessionStatus.PAUSED; tracking -> ActivitySessionStatus.ACTIVE; stoppedAt > 0 && points.isNotEmpty() -> ActivitySessionStatus.COMPLETED; else -> ActivitySessionStatus.IDLE }
    val durationSeconds: Int get() {
        val monotonicValid = startedElapsedRealtime > 0 && sessionEndRealtime >= startedElapsedRealtime
        val millis = if (monotonicValid) sessionEndRealtime - startedElapsedRealtime - pausedDurationMs else sessionEndWall - startedAt - pausedDurationMs
        return (millis / 1_000).toInt().coerceAtLeast(0)
    }
    val elapsedDurationSeconds: Int get() = if (startedAt <= 0) 0 else (((if (tracking) System.currentTimeMillis() else stoppedAt) - startedAt) / 1_000).toInt().coerceAtLeast(0)
    val paceSecondsPerKm: Int? get() = if (!distanceMeters.isFinite() || distanceMeters < 50) null else (durationSeconds / (distanceMeters / 1_000.0)).toInt()
    val averageSpeedKmh: Double get() = if (durationSeconds < 1 || !distanceMeters.isFinite()) 0.0 else distanceMeters / durationSeconds * 3.6
    val currentSpeedKmh: Double get() = points.takeLast(7).zipWithNext().mapNotNull { (first, second) ->
        val seconds = (second.recordedAt - first.recordedAt) / 1_000.0
        if (seconds !in 0.5..20.0) null else (geoDistanceMeters(first, second) / seconds * 3.6).takeIf { it in 0.0..120.0 }
    }.sorted().let { speeds -> if (speeds.isEmpty()) 0.0 else speeds[speeds.size / 2] }
    val currentPaceSecondsPerKm: Int? get() = currentSpeedKmh.takeIf { it >= 1.0 }?.let { (3_600.0 / it).toInt() }
    val displayPaceSecondsPerKm: Int? get() = if (tracking) currentPaceSecondsPerKm ?: paceSecondsPerKm else paceSecondsPerKm
}

fun geoDistanceMeters(first: RoutePoint, second: RoutePoint): Double {
    val earthRadius = 6_371_000.0
    val latitudeDelta = Math.toRadians(second.latitude - first.latitude)
    val longitudeDelta = Math.toRadians(second.longitude - first.longitude)
    val a = sin(latitudeDelta / 2) * sin(latitudeDelta / 2) +
        cos(Math.toRadians(first.latitude)) * cos(Math.toRadians(second.latitude)) * sin(longitudeDelta / 2) * sin(longitudeDelta / 2)
    return earthRadius * 2 * atan2(sqrt(a.coerceIn(0.0, 1.0)), sqrt((1 - a).coerceAtLeast(0.0)))
}

fun normalizeAccuracyMeters(value: Double): Double = value.takeIf { it.isFinite() && it in 0.0..1_000.0 } ?: 0.0

const val MAX_ROUTE_ACCURACY_METERS = 20f

/** Prevents cached/network fixes from pulling a GPS route into nearby streets. */
fun isPreciseRouteLocation(accuracyMeters: Float, hasAccuracy: Boolean = true): Boolean =
    hasAccuracy && accuracyMeters.isFinite() && accuracyMeters in 0f..MAX_ROUTE_ACCURACY_METERS

fun acceptedRouteSegmentMeters(last: RoutePoint, next: RoutePoint, activityType: String): Double? {
    val elapsedSeconds = (next.recordedAt - last.recordedAt) / 1_000.0
    if (elapsedSeconds <= 0) return null
    val distance = geoDistanceMeters(last, next)
    val jitterThreshold = maxOf(2.0, (last.accuracyMeters + next.accuracyMeters) / 4.0)
    if (distance <= jitterThreshold) return 0.0
    val maximumSpeedKmh = when (activityType) {
        "Yürüyüş" -> 15.0
        "Bisiklet" -> 100.0
        else -> 30.0
    }
    return distance.takeIf { it / elapsedSeconds * 3.6 <= maximumSpeedKmh }
}

fun canSaveRoute(snapshot: RouteSnapshot): Boolean = snapshot.points.size >= 2 && snapshot.distanceMeters >= 10.0

class RouteTrackingStore(context: Context) {
    private val preferences = context.getSharedPreferences("hedefit-route", Context.MODE_PRIVATE)
    private var activeCache: RouteSnapshot? = null

    fun read(): RouteSnapshot = readFromDisk("active").also { activeCache = it }

    fun readSummary(): RouteSnapshot {
        if (!preferences.getBoolean("summary_tracking", false)) return RouteSnapshot()
        return RouteSnapshot(
            id = preferences.getString("summary_id", "").orEmpty(),
            tracking = true,
            startedAt = preferences.getLong("summary_started", 0),
            stoppedAt = preferences.getLong("summary_stopped", 0),
            distanceMeters = safeDistanceMeters(java.lang.Double.longBitsToDouble(preferences.getLong("summary_distance", 0))),
            activityType = preferences.getString("summary_activity", "Koşu").orEmpty().ifBlank { "Koşu" },
            paused = preferences.getBoolean("summary_paused", false),
            pausedAt = preferences.getLong("summary_paused_at", 0),
            pausedDurationMs = preferences.getLong("summary_paused_duration", 0),
            startedElapsedRealtime = preferences.getLong("summary_started_realtime", 0),
            pausedElapsedRealtime = preferences.getLong("summary_paused_realtime", 0),
        )
    }

    fun readCompleted(): RouteSnapshot = readFromDisk("completed")

    private fun readFromDisk(key: String): RouteSnapshot = runCatching {
        val root = JSONObject(preferences.getString(key, "{}") ?: "{}")
        val raw = root.optJSONArray("points") ?: JSONArray()
        RouteSnapshot(
            id = root.optString("id"), tracking = root.optBoolean("tracking"), startedAt = root.optLong("startedAt"), stoppedAt = root.optLong("stoppedAt"),
            distanceMeters = safeDistanceMeters(root.optDouble("distanceMeters")),
            points = List(raw.length()) { index -> raw.getJSONObject(index).let { point -> RoutePoint(
                point.getDouble("lat"), point.getDouble("lng"), point.optDouble("alt", 0.0), point.getLong("time"), normalizeAccuracyMeters(point.optDouble("accuracy", 0.0)),
                point.optDouble("speed").takeIf { point.has("speed") && !point.isNull("speed") && it.isFinite() && it >= 0 },
                point.optDouble("bearing").takeIf { point.has("bearing") && !point.isNull("bearing") && it.isFinite() && it in 0.0..360.0 },
            ) } },
            activityType = root.optString("activityType", "Koşu").ifBlank { "Koşu" },
            paused = root.optBoolean("paused"),
            pausedAt = root.optLong("pausedAt"),
            pausedDurationMs = root.optLong("pausedDurationMs").coerceAtLeast(0),
            startedElapsedRealtime = root.optLong("startedElapsedRealtime"),
            pausedElapsedRealtime = root.optLong("pausedElapsedRealtime"),
            stoppedElapsedRealtime = root.optLong("stoppedElapsedRealtime"),
        )
    }.getOrDefault(RouteSnapshot())

    fun start(activityType: String = "Koşu", startedAt: Long = System.currentTimeMillis()): RouteSnapshot {
        read().takeIf { !it.tracking && canSaveRoute(it) }?.let(::writeCompleted)
        return RouteSnapshot(
            id = UUID.randomUUID().toString(),
            tracking = true,
            startedAt = startedAt,
            startedElapsedRealtime = SystemClock.elapsedRealtime(),
            activityType = activityType,
        ).also(::write)
    }
    fun stop(): RouteSnapshot {
        val current = read()
        val now = System.currentTimeMillis()
        val nowRealtime = SystemClock.elapsedRealtime()
        val stopped = if (current.tracking) current.copy(tracking = false, paused = false, stoppedAt = now, pausedDurationMs = current.pausedDurationMs + if (current.paused) pausedDelta(current, now, nowRealtime) else 0, pausedElapsedRealtime = 0, stoppedElapsedRealtime = nowRealtime) else current
        if (canSaveRoute(stopped)) writeCompleted(stopped)
        write(RouteSnapshot())
        return stopped
    }
    fun discard(): RouteSnapshot = RouteSnapshot().also(::write)

    fun pause(): RouteSnapshot {
        val current = read()
        return current.takeIf { it.tracking && !it.paused }?.copy(paused = true, pausedAt = System.currentTimeMillis(), pausedElapsedRealtime = SystemClock.elapsedRealtime())?.also(::write) ?: current
    }

    fun resume(): RouteSnapshot {
        val current = read()
        val now = System.currentTimeMillis()
        val nowRealtime = SystemClock.elapsedRealtime()
        return current.takeIf { it.tracking && it.paused }?.copy(paused = false, pausedAt = 0, pausedDurationMs = current.pausedDurationMs + pausedDelta(current, now, nowRealtime), pausedElapsedRealtime = 0)?.also(::write) ?: current
    }

    /** Clears a completed route when the route screen starts a new session. */
    fun reset(): RouteSnapshot {
        activeCache = null
        preferences.edit()
            .remove("active")
            .remove("completed")
            .remove("completed_id")
            .remove("completed_started")
            .remove("completed_stopped")
            .remove("completed_distance")
            .remove("completed_activity")
            .remove("summary_id")
            .remove("summary_tracking")
            .remove("summary_started")
            .remove("summary_stopped")
            .remove("summary_distance")
            .remove("summary_activity")
            .apply()
        return RouteSnapshot()
    }
    fun append(location: Location): RouteSnapshot {
        val current = activeCache?.takeIf { it.tracking } ?: read()
        if (!current.tracking || current.paused) return current
        val point = RoutePoint(location.latitude, location.longitude, location.altitude, location.time.takeIf { it > 0 } ?: System.currentTimeMillis(), location.accuracy.toDouble(), location.speed.takeIf { location.hasSpeed() }?.toDouble(), location.bearing.takeIf { location.hasBearing() }?.toDouble())
        val last = current.points.lastOrNull()
        val extra = if (last == null) 0.0 else acceptedRouteSegmentMeters(last, point, current.activityType) ?: return current
        val next = current.copy(distanceMeters = safeDistanceMeters(current.distanceMeters + extra), points = (current.points + point).takeLast(12_000))
        write(next)
        return next
    }

    private fun write(snapshot: RouteSnapshot) {
        activeCache = snapshot
        preferences.edit().putString("active", encode(snapshot).toString())
            .putString("summary_id", snapshot.id).putBoolean("summary_tracking", snapshot.tracking)
            .putLong("summary_started", snapshot.startedAt).putLong("summary_stopped", snapshot.stoppedAt)
            .putLong("summary_distance", java.lang.Double.doubleToRawLongBits(snapshot.distanceMeters)).putString("summary_activity", snapshot.activityType)
            .putBoolean("summary_paused", snapshot.paused).putLong("summary_paused_at", snapshot.pausedAt).putLong("summary_paused_duration", snapshot.pausedDurationMs)
            .putLong("summary_started_realtime", snapshot.startedElapsedRealtime).putLong("summary_paused_realtime", snapshot.pausedElapsedRealtime).apply()
    }

    private fun writeCompleted(snapshot: RouteSnapshot) {
        preferences.edit()
            .putString("completed", encode(snapshot).toString())
            .putString("completed_id", snapshot.id)
            .putLong("completed_started", snapshot.startedAt)
            .putLong("completed_stopped", snapshot.stoppedAt)
            .putLong("completed_distance", java.lang.Double.doubleToRawLongBits(snapshot.distanceMeters))
            .putString("completed_activity", snapshot.activityType)
            .apply()
    }

    private fun encode(snapshot: RouteSnapshot): JSONObject {
        val points = JSONArray().also { array ->
            snapshot.points.forEach {
                array.put(JSONObject()
                    .put("lat", it.latitude)
                    .put("lng", it.longitude)
                    .put("alt", it.altitude.takeIf(Double::isFinite) ?: 0.0)
                    .put("time", it.recordedAt)
                    .put("accuracy", normalizeAccuracyMeters(it.accuracyMeters))
                    .put("speed", it.speedMetersPerSecond ?: JSONObject.NULL)
                    .put("bearing", it.bearingDegrees ?: JSONObject.NULL))
            }
        }
        return JSONObject()
            .put("id", snapshot.id)
            .put("tracking", snapshot.tracking)
            .put("startedAt", snapshot.startedAt)
            .put("stoppedAt", snapshot.stoppedAt)
            .put("distanceMeters", safeDistanceMeters(snapshot.distanceMeters))
            .put("activityType", snapshot.activityType)
            .put("paused", snapshot.paused)
            .put("pausedAt", snapshot.pausedAt)
            .put("pausedDurationMs", snapshot.pausedDurationMs)
            .put("startedElapsedRealtime", snapshot.startedElapsedRealtime)
            .put("pausedElapsedRealtime", snapshot.pausedElapsedRealtime)
            .put("stoppedElapsedRealtime", snapshot.stoppedElapsedRealtime)
            .put("points", points)
    }

    private fun pausedDelta(snapshot: RouteSnapshot, nowWall: Long, nowRealtime: Long): Long =
        if (snapshot.pausedElapsedRealtime > 0 && nowRealtime >= snapshot.pausedElapsedRealtime) nowRealtime - snapshot.pausedElapsedRealtime
        else (nowWall - snapshot.pausedAt).coerceAtLeast(0)
}

class RouteTrackingService : Service() {
    private lateinit var locationClient: FusedLocationProviderClient
    private lateinit var store: RouteTrackingStore

    override fun onCreate() {
        super.onCreate()
        store = RouteTrackingStore(this)
        locationClient = LocationServices.getFusedLocationProviderClient(this)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_DISCARD) {
            Log.i(TAG, "Discarding active route")
            HedefitWidgetData.writeRoute(this, store.discard()); stopLocation(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY
        }
        if (intent?.action == ACTION_STOP) {
            val stopped = store.stop()
            HedefitWidgetData.writeRoute(this, stopped.copy(tracking = false))
            Log.i(TAG, "Stopped route ${stopped.id}: ${stopped.points.size} points, ${stopped.distanceMeters.toInt()} meters")
            stopLocation(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY
        }
        if (intent?.action == ACTION_PAUSE) {
            val paused = store.pause()
            HedefitWidgetData.writeRoute(this, paused)
            stopLocation()
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(paused))
            return START_STICKY
        }
        if (intent?.action == ACTION_RESUME) {
            HedefitWidgetData.writeRoute(this, store.resume())
        }
        if (!store.read().tracking) store.start()
        startForeground(NOTIFICATION_ID, notification(store.read()))
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            store.stop(); stopSelf(); return START_NOT_STICKY
        }
        if (store.read().paused) return START_STICKY
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 2_000L)
            .setGranularity(Granularity.GRANULARITY_FINE)
            .setWaitForAccurateLocation(true)
            .setMaxUpdateAgeMillis(0L)
            .setMinUpdateDistanceMeters(2f)
            .setMinUpdateIntervalMillis(1_000L)
            .build()
        locationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        return START_STICKY
    }

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.forEach(::onLocation)
        }
    }

    private fun onLocation(location: Location) {
        if (!isPreciseRouteLocation(location.accuracy, location.hasAccuracy())) {
            Log.d(TAG, "Ignoring imprecise location: ${location.accuracy}m")
            return
        }
        val snapshot = store.append(location)
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(snapshot))
        HedefitWidgetData.writeRoute(this, snapshot)
    }

    override fun onDestroy() { stopLocation(); super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null

    private fun stopLocation() = runCatching { locationClient.removeLocationUpdates(locationCallback) }.getOrNull()
    private fun createChannel() {
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL_ID, "Aktif Hedefit Yürüyüşü", NotificationManager.IMPORTANCE_DEFAULT).apply {
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
            description = "Aktif GPS aktivitesinin mesafe, süre ve tempo durumu"
        })
    }
    private fun notification(snapshot: RouteSnapshot): android.app.Notification {
        val open = PendingIntent.getActivity(this, 10, Intent(this, MainActivity::class.java).putExtra("open_route", true), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val action = if (snapshot.paused) ACTION_RESUME else ACTION_PAUSE
        val actionLabel = if (snapshot.paused) "Devam Et" else "Duraklat"
        val control = PendingIntent.getService(this, 11, Intent(this, RouteTrackingService::class.java).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 12, Intent(this, RouteTrackingService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(this, CHANNEL_ID).setSmallIcon(R.drawable.ic_notification_route).setContentTitle("Hedefit • ${snapshot.activityType}")
            .setContentText((if (snapshot.paused) "Duraklatıldı • " else "") + "%.2f km • %s • %s".format(snapshot.distanceMeters / 1_000.0, formatDuration(snapshot.durationSeconds), formatPace(snapshot.displayPaceSecondsPerKm))).setOngoing(true).setContentIntent(open)
            .addAction(R.drawable.ic_notification_route, actionLabel, control)
            .setOnlyAlertOnce(true).setSilent(true).setShowWhen(false).setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_SERVICE).setPriority(NotificationCompat.PRIORITY_MAX)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setGroup("hedefit_activity").setSortKey("00_active_walk")
        if (snapshot.paused) builder.addAction(R.drawable.ic_notification_route, "Bitir", stop)
        return builder.build()
    }

    companion object {
        private const val TAG = "RouteTracking"
        const val ACTION_STOP = "com.hedefit.app.route.STOP"
        const val ACTION_DISCARD = "com.hedefit.app.route.DISCARD"
        const val ACTION_PAUSE = "com.hedefit.app.route.PAUSE"
        const val ACTION_RESUME = "com.hedefit.app.route.RESUME"
        private const val CHANNEL_ID = "hedefit-active-walk-v2"
        private const val NOTIFICATION_ID = 4102
    }
}

fun formatDuration(seconds: Int) = "%02d:%02d:%02d".format(seconds / 3600, (seconds % 3600) / 60, seconds % 60)
fun formatPace(seconds: Int?) = seconds?.let { "%d:%02d /km".format(it / 60, it % 60) } ?: "— /km"
