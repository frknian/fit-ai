package com.hedefit.app.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import android.graphics.Path as AndroidPath
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsBike
import androidx.compose.material.icons.filled.DirectionsRun
import androidx.compose.material.icons.filled.DirectionsWalk
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.hedefit.app.route.RoutePoint
import com.hedefit.app.route.RouteSnapshot
import com.hedefit.app.route.RouteTrackingService
import com.hedefit.app.route.RouteTrackingStore
import com.hedefit.app.route.formatDuration
import com.hedefit.app.route.formatPace
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.OutlineAction
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.theme.HedefitColors
import com.hedefit.app.ui.settings.MeasurementUnits
import kotlinx.coroutines.delay
import java.io.File
import java.io.FileOutputStream

@Composable
fun RouteScreen(onBack: () -> Unit, onCompleted: (RouteSnapshot, String) -> Unit, language: String = "tr", unitSystem: String = "metric") {
    val en = language == "en"
    val context = LocalContext.current
    val store = remember { RouteTrackingStore(context) }
    var snapshot by remember { mutableStateOf(store.read()) }
    var activityType by remember { mutableStateOf("Koşu") }
    var finished by remember { mutableStateOf(snapshot.takeIf { !it.tracking && it.points.size > 1 }) }
    var pendingStart by remember { mutableStateOf(false) }
    var permissionMessage by remember { mutableStateOf<String?>(null) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            permissionMessage = null
            if (pendingStart) startRoute(context)
        } else permissionMessage = if (en) "Location permission is required to draw and record your GPS route." else "GPS rotanı çizmek ve kaydetmek için konum izni gerekli."
        pendingStart = false
    }
    LaunchedEffect(Unit) {
        while (true) { snapshot = store.read(); delay(1_000) }
    }
    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissionLauncher.launch(buildList {
                add(Manifest.permission.ACCESS_FINE_LOCATION)
                add(Manifest.permission.ACCESS_COARSE_LOCATION)
                if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
            }.toTypedArray())
        }
    }
    BackHandler(enabled = snapshot.tracking) { /* Aktif rota yanlışlıkla kapanmasın. */ }
    Box(Modifier.fillMaxSize().background(Color(0xFF0B0D0C))) {
        RouteMap(snapshot.points, Modifier.fillMaxSize())
        Column(Modifier.align(Alignment.TopCenter).fillMaxWidth().systemBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = if (snapshot.tracking) ({}) else onBack, modifier = Modifier.background(Color.Black.copy(alpha = .68f), CircleShape)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri", tint = Color.White) }
                Spacer(Modifier.width(10.dp)); Column { Text("Hedefit Route", color = Color.White, style = MaterialTheme.typography.headlineSmall); Text(if (snapshot.tracking) (if (en) "Recording in background" else "Arka planda kaydediliyor") else if (en) "GPS workout" else "GPS antrenmanı", color = HedefitColors.Lime, style = MaterialTheme.typography.bodySmall) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                FilterChip(activityType == "Koşu", { activityType = "Koşu" }, leadingIcon = { Icon(Icons.Default.DirectionsRun, null) }, label = { Text(if (en) "Run" else "Koşu") })
                FilterChip(activityType == "Bisiklet", { activityType = "Bisiklet" }, leadingIcon = { Icon(Icons.Default.DirectionsBike, null) }, label = { Text(if (en) "Ride" else "Bisiklet") })
                FilterChip(activityType == "Yürüyüş", { activityType = "Yürüyüş" }, leadingIcon = { Icon(Icons.Default.DirectionsWalk, null, tint = HedefitColors.Lime) }, label = { Text(if (en) "Walk" else "Yürüyüş") })
            }
            permissionMessage?.let { Text(it, color = HedefitColors.Warning, style = MaterialTheme.typography.bodySmall, modifier = Modifier.background(Color.Black.copy(alpha = .7f), RoundedCornerShape(10.dp)).padding(10.dp)) }
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color(0xEE111411)).navigationBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RouteMetric(if (en) "DISTANCE" else "MESAFE", MeasurementUnits.formatDistance(snapshot.distanceMeters, unitSystem), Modifier.weight(1f))
                RouteMetric(if (en) "TIME" else "SÜRE", formatDuration(snapshot.durationSeconds), Modifier.weight(1f))
                RouteMetric(if (en) "PACE" else "TEMPO", MeasurementUnits.formatPace(snapshot.paceSecondsPerKm, unitSystem), Modifier.weight(1f))
            }
            if (snapshot.tracking) PrimaryButton(if (en) "Finish Route" else "Rotayı Bitir", onClick = {
                val final = store.stop(); stopRoute(context); snapshot = final; finished = final; onCompleted(final, activityType)
            }, icon = Icons.Default.Stop)
            else PrimaryButton(if (en) "Start GPS Recording" else "GPS Kaydını Başlat", onClick = {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) startRoute(context)
                else {
                    pendingStart = true
                    permissionLauncher.launch(buildList { add(Manifest.permission.ACCESS_FINE_LOCATION); add(Manifest.permission.ACCESS_COARSE_LOCATION); if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS) }.toTypedArray())
                }
            }, icon = Icons.Default.DirectionsRun)
            finished?.let { completed -> OutlineAction(if (en) "Share Green Route Card" else "Yeşil Rota Kartını Paylaş", onClick = { shareRoute(context, completed, activityType, unitSystem) }) }
        }
    }
}

@Composable
private fun RouteMap(points: List<RoutePoint>, modifier: Modifier) {
        Box(modifier.background(Color(0xFF0B0D0C)), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize().padding(24.dp)) {
                for (x in 0..6) drawLine(Color.White.copy(alpha = .045f), Offset(size.width * x / 6f, 0f), Offset(size.width * x / 6f, size.height), 1f)
                for (y in 0..8) drawLine(Color.White.copy(alpha = .045f), Offset(0f, size.height * y / 8f), Offset(size.width, size.height * y / 8f), 1f)
                routePath(points, size.width, size.height)?.let { drawPath(it, HedefitColors.Lime, style = Stroke(8f, cap = StrokeCap.Round)) }
            }
            if (points.size < 2) Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(64.dp).background(HedefitColors.Lime.copy(alpha = .15f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.DirectionsRun, null, tint = HedefitColors.Lime, modifier = Modifier.size(32.dp)) }
                Spacer(Modifier.height(10.dp)); Text("GPS hazır • Başladığında rotan burada çizilecek", color = HedefitColors.TextSecondary)
            }
        }
}

@Composable private fun RouteMetric(label: String, value: String, modifier: Modifier) = HedefitCard(modifier) { Column { Text(label, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelSmall); Text(value, color = HedefitColors.Lime, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleMedium) } }

private fun routePath(points: List<RoutePoint>, width: Float, height: Float): Path? {
    if (points.size < 2) return null
    val minLat = points.minOf { it.latitude }; val maxLat = points.maxOf { it.latitude }; val minLng = points.minOf { it.longitude }; val maxLng = points.maxOf { it.longitude }
    val latSpan = (maxLat - minLat).coerceAtLeast(.00001); val lngSpan = (maxLng - minLng).coerceAtLeast(.00001)
    return Path().apply { points.forEachIndexed { index, point -> val x = ((point.longitude - minLng) / lngSpan * width).toFloat(); val y = (height - (point.latitude - minLat) / latSpan * height).toFloat(); if (index == 0) moveTo(x, y) else lineTo(x, y) } }
}

private fun startRoute(context: Context) = ContextCompat.startForegroundService(context, Intent(context, RouteTrackingService::class.java))
private fun stopRoute(context: Context) = context.startService(Intent(context, RouteTrackingService::class.java).setAction(RouteTrackingService.ACTION_STOP))

private fun shareRoute(context: Context, snapshot: RouteSnapshot, activityType: String, unitSystem: String) {
    val bitmap = Bitmap.createBitmap(1080, 1350, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bitmap); canvas.drawColor(AndroidColor.rgb(8, 10, 9))
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = AndroidColor.rgb(190, 255, 0); typeface = android.graphics.Typeface.DEFAULT_BOLD }
    paint.textSize = 70f; canvas.drawText("HEDEFIT ROTA", 72f, 110f, paint)
    paint.color = AndroidColor.WHITE; paint.textSize = 42f; canvas.drawText(activityType.uppercase(), 74f, 175f, paint)
    drawAndroidRoute(canvas, snapshot.points, 72f, 245f, 936f, 680f, paint)
    paint.color = AndroidColor.rgb(190, 255, 0); paint.textSize = 62f; canvas.drawText(MeasurementUnits.formatDistance(snapshot.distanceMeters, unitSystem), 72f, 1020f, paint)
    paint.color = AndroidColor.WHITE; paint.textSize = 38f; canvas.drawText("${formatDuration(snapshot.durationSeconds)}     ${MeasurementUnits.formatPace(snapshot.paceSecondsPerKm, unitSystem)}", 72f, 1090f, paint)
    paint.color = AndroidColor.LTGRAY; paint.textSize = 30f; canvas.drawText("Hedefine giden rota yeşil.", 72f, 1235f, paint)
    val directory = File(context.cacheDir, "shared-routes").apply { mkdirs() }; val file = File(directory, "hedefit-rota-${snapshot.id}.png")
    FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Rotanı paylaş"))
}

private fun drawAndroidRoute(canvas: AndroidCanvas, points: List<RoutePoint>, left: Float, top: Float, width: Float, height: Float, paint: Paint) {
    paint.style = Paint.Style.STROKE; paint.strokeWidth = 14f; paint.strokeCap = Paint.Cap.ROUND; paint.color = AndroidColor.rgb(190, 255, 0)
    if (points.size > 1) { val minLat = points.minOf { it.latitude }; val maxLat = points.maxOf { it.latitude }; val minLng = points.minOf { it.longitude }; val maxLng = points.maxOf { it.longitude }; val latSpan = (maxLat - minLat).coerceAtLeast(.00001); val lngSpan = (maxLng - minLng).coerceAtLeast(.00001); val path = AndroidPath(); points.forEachIndexed { index, point -> val x = left + ((point.longitude - minLng) / lngSpan * width).toFloat(); val y = top + height - ((point.latitude - minLat) / latSpan * height).toFloat(); if (index == 0) path.moveTo(x, y) else path.lineTo(x, y) }; canvas.drawPath(path, paint) }
    paint.style = Paint.Style.FILL
}
