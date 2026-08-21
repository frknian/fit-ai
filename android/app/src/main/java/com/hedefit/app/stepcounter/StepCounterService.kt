package com.hedefit.app.stepcounter

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.hedefit.app.MainActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Adım sayarı GPS takibindeki (BackgroundGeolocationService) aynı ilkeyle
 * çalışır: uygulama tamamen kapansa bile Android'in öldürmemesi için
 * FOREGROUND SERVICE olarak çalışır, kalıcı bir bildirimle.
 *
 * @capgo/capacitor-pedometer eklentisinin manifest'inde hiçbir servis
 * bildirimi yoktur — sensör dinleyicisi yalnızca uygulamanın JS/aktivite
 * ömrüyle yaşar. Kullanıcı uygulamayı kapattığında o aralıktaki adımlar
 * kaçırılıyordu; bu servis onun yerine geçer.
 *
 * NEDEN native, JS değil: TYPE_STEP_COUNTER dinleyicisinin WebView/JS
 * yaşam döngüsünden bağımsız, servis öldürülene kadar sürmesi gerekiyor.
 * Günlük toplam ve gün dönümü de burada, SharedPreferences'a yazılarak
 * tutulur — uygulama hiç açılmasa da servis kendi başına biriktirir.
 */
class StepCounterService : Service(), SensorEventListener {

    companion object {
        private const val CHANNEL_ID = "hedefit_step_counter"
        private const val NOTIFICATION_ID = 4201
        const val PREFS_NAME = "hedefit_step_counter"
        const val KEY_DATE = "local_date"
        const val KEY_STEPS = "steps"
        const val KEY_BASELINE = "baseline"
        /** Kullanıcının günlük adım hedefi; bildirimde "kalan adım" bundan çıkar. */
        const val KEY_GOAL = "goal"
        const val DEFAULT_GOAL = 8000
        const val ACTION_START = "com.hedefit.app.stepcounter.START"
        const val ACTION_STOP = "com.hedefit.app.stepcounter.STOP"
        /** Hedef değişince bildirimi hemen tazelemek için (bkz. plugin setGoal). */
        const val ACTION_REFRESH = "com.hedefit.app.stepcounter.REFRESH"

        /** İstanbul/kullanıcı yerel saatine göre bugünün anahtarı (YYYY-MM-DD). */
        fun todayKey(): String {
            val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            formatter.timeZone = TimeZone.getDefault()
            return formatter.format(Date())
        }

        /**
         * Servis şu anda ayakta mı? Plugin ile servis AYNI süreçte çalışır,
         * bu yüzden bu bayrak güvenilir: hedef değişince bildirimi yalnız
         * zaten çalışan servise tazeletmek için okunur (durmuş bir servisi
         * arka plandan başlatmak Android 12+'ta yasak).
         */
        @Volatile
        var isRunning = false
            private set

        /** Kayıtlı günlük hedef; JS tarafı setGoal ile yazar. */
        fun readGoal(context: Context): Int {
            val goal = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getInt(KEY_GOAL, DEFAULT_GOAL)
            return if (goal > 0) goal else DEFAULT_GOAL
        }

        /** Gün dönümünü hesaba katarak bugünün adımını döner; servis çalışmıyorsa da okunabilir. */
        fun readTodaySteps(context: Context): Int {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val storedDate = prefs.getString(KEY_DATE, null)
            return if (storedDate == todayKey()) prefs.getInt(KEY_STEPS, 0) else 0
        }
    }

    private lateinit var prefs: SharedPreferences
    private var sensorManager: SensorManager? = null
    private var stepCounterSensor: Sensor? = null
    /** Bu servis çalışması boyunca sensörden gelen ham (cihaz açılışından beri) değer. */
    private var rawBaseline = -1f
    /**
     * JS tarafı start()'ı birden fazla kez çağırabilir (ör. kullanıcı sekme
     * değiştirip ana ekrana dönünce StepCounterCard yeniden bağlanır).
     * Servis START_STICKY olduğu için bu ikinci intent AYNI çalışan
     * örneğe gider; dinleyiciyi tekrar kaydetmek "registerListener fail"
     * uyarısına yol açıyordu. Tek seferlik kayıt burada garanti edilir.
     */
    private var isListening = false

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        stepCounterSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        // ACTION_REFRESH için ayrıca bir şey yapmak gerekmez: startForeground
        // aynı bildirim kimliğiyle çağrıldığında bildirimi yeni hedefe göre
        // yeniden çizer.
        startForegroundWithNotification()
        val sensor = stepCounterSensor
        if (sensor == null) {
            stopSelf()
        } else if (!isListening) {
            sensorManager?.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
            isListening = true
        }
        // START_STICKY: sistem belleği boşaltmak için servisi öldürürse yeniden başlatmayı dener.
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        sensorManager?.unregisterListener(this)
        isListening = false
        isRunning = false
        super.onDestroy()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_STEP_COUNTER) return
        val raw = event.values.firstOrNull() ?: return
        val today = todayKey()
        val storedDate = prefs.getString(KEY_DATE, null)

        if (storedDate != today) {
            // Gün değişti (ya da ilk çalıştırma): bugünün sayacı bu ham değerden başlar.
            prefs.edit().putString(KEY_DATE, today).putInt(KEY_BASELINE, raw.toInt()).putInt(KEY_STEPS, 0).apply()
            rawBaseline = raw
            return
        }

        if (rawBaseline < 0) {
            // Servis bugün içinde yeniden başladı (ör. cihaz reboot); kayıtlı taban okunur.
            rawBaseline = prefs.getInt(KEY_BASELINE, raw.toInt()).toFloat()
        }

        val delta = (raw - rawBaseline).toInt().coerceAtLeast(0)
        prefs.edit().putInt(KEY_STEPS, delta).apply()
        updateNotification(delta)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun startForegroundWithNotification() {
        createChannelIfNeeded()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        } else 0
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification(readTodaySteps(this)), type)
        } else {
            @Suppress("DEPRECATION")
            startForeground(NOTIFICATION_ID, buildNotification(readTodaySteps(this)))
        }
    }

    private fun updateNotification(steps: Int) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(steps))
    }

    /** Binlik ayraçlı okunur sayı: "4.320". */
    private fun formatCount(value: Int): String = String.format(Locale("tr", "TR"), "%,d", value)

    private fun buildNotification(steps: Int): Notification {
        val goal = readGoal(this)
        val remaining = (goal - steps).coerceAtLeast(0)
        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val iconRes = resources.getIdentifier("ic_stat_fit_ai", "drawable", packageName)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            // Bildirim çubuğunda tek bakışta iki sayı: atılan adım ve hedefe
            // kalan. "Arka planda çalışıyor" satırı hiçbir bilgi taşımıyordu.
            .setContentTitle("${formatCount(steps)} adım")
            .setContentText(if (remaining > 0) "Hedefe ${formatCount(remaining)} adım kaldı" else "Günlük hedef tamamlandı")
            .setSmallIcon(if (iconRes != 0) iconRes else android.R.drawable.ic_menu_myplaces)
            .setContentIntent(openApp)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .build()
    }

    private fun createChannelIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, "Adım Sayar", NotificationManager.IMPORTANCE_LOW)
        channel.description = "Arka planda adım sayarken gösterilen kalıcı bildirim"
        manager.createNotificationChannel(channel)
    }
}
