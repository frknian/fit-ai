package com.hedefit.app.stepcounter

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

/**
 * StepCounterService'in JS köprüsü. Yüzey bilerek dar: başlat/durdur/oku ve
 * izin akışı dışında hiçbir şey yapmaz.
 *
 * ACTIVITY_RECOGNITION Android 10+'ta runtime izni gerektirir (adım sayar
 * sensörüne erişim için); POST_NOTIFICATIONS ise Android 13+'ta foreground
 * service bildirimi için zorunludur — biri eksikse servis ya sensöre
 * erişemez ya da sistem tarafından erkenden öldürülür.
 */
@CapacitorPlugin(
    name = "HedefitStepCounter",
    permissions = [
        Permission(strings = [Manifest.permission.ACTIVITY_RECOGNITION], alias = "activity"),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
    ],
)
class HedefitStepCounterPlugin : Plugin() {

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val sensorManager = context.getSystemService(android.content.Context.SENSOR_SERVICE) as? SensorManager
        val available = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
        val result = JSObject()
        result.put("available", available)
        call.resolve(result)
    }

    // checkPermissions/requestPermissions elle yazılmadı: temel Plugin sınıfı,
    // @CapacitorPlugin(permissions=[...]) ile bildirilen alias'lar için bu iki
    // metodu zaten otomatik sağlıyor (bkz. Capacitor Plugin.java).

    @PluginMethod
    fun start(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
        ) {
            call.reject("ACTIVITY_RECOGNITION izni verilmemiş")
            return
        }
        val intent = Intent(context, StepCounterService::class.java)
        ContextCompat.startForegroundService(context, intent)
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val intent = Intent(context, StepCounterService::class.java).setAction(StepCounterService.ACTION_STOP)
        context.startService(intent)
        call.resolve()
    }

    /** Günlük hedefi yazar ve bildirimi (servis çalışıyorsa) hemen tazeler. */
    @PluginMethod
    fun setGoal(call: PluginCall) {
        val goal = call.getInt("goal") ?: 0
        if (goal <= 0) { call.reject("Geçersiz hedef"); return }
        context.getSharedPreferences(StepCounterService.PREFS_NAME, android.content.Context.MODE_PRIVATE)
            .edit().putInt(StepCounterService.KEY_GOAL, goal).apply()
        // Bildirim yalnız servis ZATEN çalışıyorsa tazelenir; durmuş bir
        // servisi buradan başlatmak (Android 12+ arka plan kısıtı) hem yasak
        // hem de kullanıcı bildirimi kapatmışken istenmeyen bir şey olurdu.
        if (StepCounterService.isRunning) {
            val intent = Intent(context, StepCounterService::class.java).setAction(StepCounterService.ACTION_REFRESH)
            runCatching { context.startService(intent) }
        }
        call.resolve()
    }

    @PluginMethod
    fun getTodaySteps(call: PluginCall) {
        val result = JSObject()
        result.put("steps", StepCounterService.readTodaySteps(context))
        call.resolve(result)
    }
}
