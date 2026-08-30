package com.hedefit.app.steps

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.hedefit.app.health.HealthConnectManager
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The only source that is allowed to feed the app's daily step total. */
enum class StepSource { HEALTH_CONNECT, DEVICE_STEP_COUNTER, DEVICE_STEP_DETECTOR, UNAVAILABLE }

data class TodaySteps(
    val count: Int = 0,
    val source: StepSource = StepSource.UNAVAILABLE,
    val available: Boolean = false,
)

data class NativeStepCounterState(val date: String, val lastTotal: Float?, val todaySteps: Int)

/** Pure baseline calculation; a reboot can never turn the visible total negative. */
fun nextNativeStepCounterState(previous: NativeStepCounterState, today: String, sensorTotal: Float): NativeStepCounterState {
    if (!sensorTotal.isFinite() || sensorTotal < 0f) return previous
    if (previous.date != today) return NativeStepCounterState(today, sensorTotal, 0)
    val added = previous.lastTotal?.takeIf { sensorTotal >= it }?.let { (sensorTotal - it).toInt().coerceAtLeast(0) } ?: 0
    return NativeStepCounterState(today, sensorTotal, (previous.todaySteps + added).coerceAtLeast(0))
}

fun preferredStepSource(healthConnectAvailable: Boolean, hasCounter: Boolean, hasDetector: Boolean): StepSource = when {
    healthConnectAvailable -> StepSource.HEALTH_CONNECT
    hasCounter -> StepSource.DEVICE_STEP_COUNTER
    hasDetector -> StepSource.DEVICE_STEP_DETECTOR
    else -> StepSource.UNAVAILABLE
}

private class HealthConnectStepDataSource(private val health: HealthConnectManager) {
    suspend fun isAvailable(): Boolean = health.hasStepPermission()
    suspend fun readToday(): Int = health.readTodaySteps().coerceAtLeast(0)
}

/**
 * A minimal persistent adapter over Android's hardware step sensors. It never
 * infers steps from accelerometer movement, so shaking the phone is not enough
 * to create a Hedefit step.
 */
private class DeviceStepCounterDataSource(context: Context, private val onChanged: (TodaySteps) -> Unit) : SensorEventListener {
    private val appContext = context.applicationContext
    private val sensorManager = appContext.getSystemService(SensorManager::class.java)
    private val storage = appContext.getSharedPreferences("hedefit-native-steps", Context.MODE_PRIVATE)
    private var sensor: Sensor? = null
    private var activeSource = StepSource.UNAVAILABLE

    fun start(): TodaySteps {
        stop()
        sensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        activeSource = preferredStepSource(false, sensor != null, false)
        if (sensor == null) {
            // TYPE_STEP_DETECTOR is a valid last fallback. Its value is an event,
            // not a cumulative total, so only events received while registered are
            // counted and persisted for the local day.
            sensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
            activeSource = preferredStepSource(false, false, sensor != null)
        }
        val current = currentState()
        sensor?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
        onChanged(current)
        return current
    }

    fun stop() {
        sensorManager.unregisterListener(this)
        sensor = null
        activeSource = StepSource.UNAVAILABLE
    }

    private fun currentState(): TodaySteps {
        val today = LocalDate.now(ZoneId.systemDefault()).toString()
        val savedDate = storage.getString(KEY_DATE, "").orEmpty()
        val saved = if (savedDate == today) storage.getInt(KEY_TODAY_STEPS, 0).coerceAtLeast(0) else 0
        if (savedDate != today) storage.edit().putString(KEY_DATE, today).putInt(KEY_TODAY_STEPS, 0).remove(KEY_BASELINE).remove(KEY_LAST_TOTAL).apply()
        return TodaySteps(saved, activeSource, sensor != null)
    }

    override fun onSensorChanged(event: SensorEvent) {
        val today = LocalDate.now(ZoneId.systemDefault()).toString()
        val savedDate = storage.getString(KEY_DATE, "").orEmpty()
        if (activeSource == StepSource.DEVICE_STEP_DETECTOR) {
            val next = (if (savedDate == today) storage.getInt(KEY_TODAY_STEPS, 0) else 0).coerceAtLeast(0) + 1
            storage.edit().putString(KEY_DATE, today).putInt(KEY_TODAY_STEPS, next).apply()
            onChanged(TodaySteps(next, activeSource, true))
            return
        }

        val total = event.values.firstOrNull()?.takeIf { it.isFinite() && it >= 0f } ?: return
        val prior = NativeStepCounterState(
            date = savedDate,
            lastTotal = storage.getFloat(KEY_LAST_TOTAL, -1f).takeIf { it >= 0f },
            todaySteps = if (savedDate == today) storage.getInt(KEY_TODAY_STEPS, 0).coerceAtLeast(0) else 0,
        )
        val next = nextNativeStepCounterState(prior, today, total)
        storage.edit()
            .putString(KEY_DATE, today)
            .putFloat(KEY_BASELINE, if (savedDate == today) storage.getFloat(KEY_BASELINE, total) else total)
            .putFloat(KEY_LAST_TOTAL, next.lastTotal ?: total)
            .putInt(KEY_TODAY_STEPS, next.todaySteps)
            .apply()
        onChanged(TodaySteps(next.todaySteps, StepSource.DEVICE_STEP_COUNTER, true))
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private companion object {
        const val KEY_DATE = "date"
        const val KEY_BASELINE = "baseline"
        const val KEY_LAST_TOTAL = "last_total"
        const val KEY_TODAY_STEPS = "today_steps"
    }
}

/**
 * Central step source of truth for UI, widgets, notifications and backend sync.
 * Health Connect wins whenever it is authorised; local hardware data is never
 * added to its aggregate.
 */
class StepRepository(context: Context, healthConnect: HealthConnectManager) {
    private val appContext = context.applicationContext
    private val health = HealthConnectStepDataSource(healthConnect)
    private val _todaySteps = MutableStateFlow(TodaySteps())
    val todaySteps: StateFlow<TodaySteps> = _todaySteps.asStateFlow()
    private val device = DeviceStepCounterDataSource(appContext) { reading ->
        if (_todaySteps.value.source != StepSource.HEALTH_CONNECT) _todaySteps.value = reading
    }

    suspend fun refresh(): TodaySteps {
        if (health.isAvailable()) {
            device.stop()
            return try {
                TodaySteps(health.readToday(), StepSource.HEALTH_CONNECT, true).also { _todaySteps.value = it }
            } catch (_: Throwable) {
                // Permissions still make Health Connect the selected source; never
                // replace a failed HC refresh with a local total and risk a jump.
                TodaySteps(_todaySteps.value.count, StepSource.HEALTH_CONNECT, false).also { _todaySteps.value = it }
            }
        }
        return startDeviceFallback()
    }

    fun startDeviceFallback(): TodaySteps {
        if (!hasActivityRecognitionPermission()) {
            device.stop()
            return TodaySteps(source = StepSource.UNAVAILABLE, available = false).also { _todaySteps.value = it }
        }
        return device.start().also { _todaySteps.value = it }
    }

    fun hasActivityRecognitionPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

    fun stop() = device.stop()
}
