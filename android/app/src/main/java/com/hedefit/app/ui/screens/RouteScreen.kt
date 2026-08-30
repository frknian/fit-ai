package com.hedefit.app.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import android.graphics.Path as AndroidPath
import android.graphics.RectF
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsRun
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.hedefit.app.route.RoutePoint
import com.hedefit.app.route.RouteSnapshot
import com.hedefit.app.route.RouteTrackingService
import com.hedefit.app.route.RouteTrackingStore
import com.hedefit.app.route.ActivitySessionStatus
import com.hedefit.app.route.canSaveRoute
import com.hedefit.app.route.formatDuration
import com.hedefit.app.route.formatPace
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.OutlineAction
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.theme.HedefitColors
import com.hedefit.app.ui.settings.MeasurementUnits
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.roundToInt
import kotlin.math.tan

@Composable
fun RouteScreen(onBack: () -> Unit, onCompleted: (RouteSnapshot, String, String) -> Unit, language: String = "tr", unitSystem: String = "metric") {
    val en = language == "en"
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember { RouteTrackingStore(context) }
    val initialSnapshot = remember(store) { store.read() }
    val recoveredCompleted = remember(store) { store.readCompleted().takeIf(::canSaveRoute) }
    var snapshot by remember { mutableStateOf(initialSnapshot) }
    var activityType by rememberSaveable(snapshot.id) { mutableStateOf(snapshot.activityType.ifBlank { "Koşu" }) }
    var finished by remember { mutableStateOf(recoveredCompleted) }
    var pendingStart by remember { mutableStateOf(false) }
    var permissionMessage by remember { mutableStateOf<String?>(null) }
    var routeMessage by remember { mutableStateOf<String?>(null) }
    var showExitConfirmation by remember { mutableStateOf(false) }
    var showFinishConfirmation by remember { mutableStateOf(false) }
    var countdown by remember { mutableStateOf<Int?>(null) }
    var activityTitle by remember { mutableStateOf(recoveredCompleted?.let { defaultActivityTitle(it.activityType, en) }.orEmpty()) }
    var sessionStatus by remember { mutableStateOf(recoveredCompleted?.let { ActivitySessionStatus.COMPLETED } ?: initialSnapshot.status) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            permissionMessage = null
            if (pendingStart) {
                sessionStatus = ActivitySessionStatus.COUNTDOWN
                countdown = 3
            }
        } else permissionMessage = if (en) "Precise location permission is required to draw and record your GPS route." else "GPS rotanı çizmek ve kaydetmek için hassas konum izni gerekli."
        pendingStart = false
    }
    LaunchedEffect(Unit) {
        while (true) {
            val latest = store.read()
            snapshot = latest
            if (!latest.tracking && finished == null) store.readCompleted().takeIf(::canSaveRoute)?.let {
                finished = it
                activityTitle = defaultActivityTitle(it.activityType, en)
            }
            delay(1_000)
        }
    }
    LaunchedEffect(snapshot.id) {
        if (snapshot.tracking && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            ContextCompat.startForegroundService(context, Intent(context, RouteTrackingService::class.java))
        }
    }
    LaunchedEffect(snapshot.distanceMeters) {
        if (canSaveRoute(snapshot)) routeMessage = null
    }
    LaunchedEffect(countdown) {
        val value = countdown ?: return@LaunchedEffect
        delay(1_000)
        if (value > 1) countdown = value - 1 else {
            snapshot = startRoute(context, store, activityType)
            sessionStatus = ActivitySessionStatus.ACTIVE
            finished = null
            activityTitle = ""
            countdown = null
        }
    }
    BackHandler(enabled = snapshot.tracking) { showExitConfirmation = true }
    val visibleSnapshot = if (snapshot.tracking) snapshot else finished ?: snapshot
    val activityInProgress = snapshot.tracking
    Box(Modifier.fillMaxSize().background(Color(0xFF0B0D0C))) {
        // The live activity is intentionally distraction-free. The map is
        // revealed only after finishing, when it is useful for review/share.
        if (finished != null) RouteMap(visibleSnapshot.points, Modifier.fillMaxSize(), en)
        Column(Modifier.align(Alignment.TopCenter).fillMaxWidth().systemBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = if (snapshot.tracking) ({ showExitConfirmation = true }) else onBack, modifier = Modifier.background(Color.Black.copy(alpha = .68f), CircleShape)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, if (en) "Back" else "Geri", tint = Color.White) }
                Spacer(Modifier.width(10.dp)); Column { Text(if (en) "Activities" else "Aktiviteler", color = Color.White, style = MaterialTheme.typography.headlineSmall); Text(when { snapshot.tracking && snapshot.points.isEmpty() -> if (en) "Acquiring precise GPS signal…" else "Hassas GPS sinyali aranıyor…"; sessionStatus == ActivitySessionStatus.PREPARING_GPS -> if (en) "Searching for GPS…" else "GPS sinyali aranıyor…"; sessionStatus == ActivitySessionStatus.PAUSED -> if (en) "Paused" else "Duraklatıldı"; sessionStatus == ActivitySessionStatus.ACTIVE -> if (en) "Recording in background" else "Arka planda kaydediliyor"; sessionStatus == ActivitySessionStatus.COMPLETED -> if (en) "Ready to save" else "Kaydetmeye hazır"; else -> if (en) "GPS activity" else "GPS aktivitesi" }, color = HedefitColors.Lime, style = MaterialTheme.typography.bodySmall) }
            }
            permissionMessage?.let { Text(it, color = HedefitColors.Warning, style = MaterialTheme.typography.bodySmall, modifier = Modifier.background(Color.Black.copy(alpha = .7f), RoundedCornerShape(10.dp)).padding(10.dp)) }
            routeMessage?.let { Text(it, color = HedefitColors.Warning, style = MaterialTheme.typography.bodySmall, modifier = Modifier.background(Color.Black.copy(alpha = .7f), RoundedCornerShape(10.dp)).padding(10.dp)) }
        }
        if (!activityInProgress && finished == null) {
            Column(
                Modifier.align(Alignment.Center).fillMaxWidth().padding(horizontal = 24.dp).offset(y = (-24).dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(if (en) "Choose an activity" else "Aktiviteni seç", color = HedefitColors.TextPrimary, style = MaterialTheme.typography.titleLarge)
                Text(if (en) "Precise GPS tracking starts when you are ready." else "Hazır olduğunda hassas GPS kaydı başlayacak.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(4.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    RouteActivityChoice(if (en) "Run" else "Koşu", "🏃", activityType == "Koşu", { activityType = "Koşu" }, Modifier.weight(1f))
                    RouteActivityChoice(if (en) "Walk" else "Yürüyüş", "🚶", activityType == "Yürüyüş", { activityType = "Yürüyüş" }, Modifier.weight(1f))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    RouteActivityChoice(if (en) "Trail run" else "Trail Koşusu", "⛰️", activityType == "Trail Koşusu", { activityType = "Trail Koşusu" }, Modifier.weight(1f))
                    RouteActivityChoice(if (en) "Hike" else "Doğa Yürüyüşü", "🥾", activityType == "Doğa Yürüyüşü", { activityType = "Doğa Yürüyüşü" }, Modifier.weight(1f))
                }
                RouteActivityChoice(if (en) "Ride" else "Bisiklet", "🚴", activityType == "Bisiklet", { activityType = "Bisiklet" }, Modifier.fillMaxWidth(.55f))
            }
        }
        if (activityInProgress) {
            Row(
                Modifier.align(Alignment.Center).fillMaxWidth().padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                RouteMetric(if (en) "DISTANCE" else "MESAFE", MeasurementUnits.formatDistance(visibleSnapshot.distanceMeters, unitSystem), Modifier.weight(1f))
                RouteMetric(if (en) "TIME" else "SÜRE", formatDuration(visibleSnapshot.durationSeconds), Modifier.weight(1f))
                RouteMetric(if (activityType == "Bisiklet") (if (en) "SPEED" else "HIZ") else (if (en) "PACE" else "TEMPO"), if (activityType == "Bisiklet") "%.1f km/sa".format(visibleSnapshot.currentSpeedKmh.takeIf { snapshot.tracking } ?: visibleSnapshot.averageSpeedKmh) else MeasurementUnits.formatPace(visibleSnapshot.displayPaceSecondsPerKm, unitSystem), Modifier.weight(1f))
            }
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color(0xEE111411)).navigationBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!activityInProgress) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RouteMetric(if (en) "DISTANCE" else "MESAFE", MeasurementUnits.formatDistance(visibleSnapshot.distanceMeters, unitSystem), Modifier.weight(1f))
                RouteMetric(if (en) "TIME" else "SÜRE", formatDuration(visibleSnapshot.durationSeconds), Modifier.weight(1f))
                RouteMetric(if (activityType == "Bisiklet") (if (en) "SPEED" else "HIZ") else (if (en) "PACE" else "TEMPO"), if (activityType == "Bisiklet") "%.1f km/sa".format(visibleSnapshot.averageSpeedKmh) else MeasurementUnits.formatPace(visibleSnapshot.displayPaceSecondsPerKm, unitSystem), Modifier.weight(1f))
            }
            if (snapshot.tracking && !snapshot.paused) PrimaryButton(if (en) "Pause" else "Duraklat", onClick = {
                context.startService(Intent(context, RouteTrackingService::class.java).setAction(RouteTrackingService.ACTION_PAUSE))
                snapshot = store.pause()
                sessionStatus = ActivitySessionStatus.PAUSED
            }, icon = Icons.Default.Stop)
            else if (snapshot.tracking && snapshot.paused) {
                PrimaryButton(if (en) "Continue" else "Devam Et", onClick = {
                    context.startService(Intent(context, RouteTrackingService::class.java).setAction(RouteTrackingService.ACTION_RESUME))
                    snapshot = store.resume()
                    sessionStatus = ActivitySessionStatus.ACTIVE
                }, icon = Icons.Default.DirectionsRun)
                OutlineAction(if (en) "Finish activity" else "Aktiviteyi Bitir", onClick = { showFinishConfirmation = true })
            }
            else if (finished == null) PrimaryButton(if (en) "Start GPS Recording" else "GPS Kaydını Başlat", onClick = {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    sessionStatus = ActivitySessionStatus.COUNTDOWN
                    countdown = 3
                    routeMessage = null
                }
                else {
                    pendingStart = true
                    sessionStatus = ActivitySessionStatus.PREPARING_GPS
                    permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                }
            }, icon = Icons.Default.DirectionsRun)
            finished?.let { completed ->
                OutlinedTextField(activityTitle, { activityTitle = it.take(80) }, modifier = Modifier.fillMaxWidth(), singleLine = true, label = { Text(if (en) "Activity name" else "Aktivite adı") })
                PrimaryButton(if (en) "Save activity" else "Aktiviteyi Kaydet", onClick = {
                    onCompleted(completed, completed.activityType, activityTitle.ifBlank { defaultActivityTitle(completed.activityType, en) })
                    snapshot = store.reset()
                    sessionStatus = ActivitySessionStatus.IDLE
                    finished = null
                    routeMessage = null
                })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { scope.launch { shareRoute(context, completed, activityTitle, story = false) } }, modifier = Modifier.weight(1f)) { Text("1:1 ${if (en) "Share" else "Paylaş"}") }
                    TextButton(onClick = { scope.launch { shareRoute(context, completed, activityTitle, story = true) } }, modifier = Modifier.weight(1f)) { Text("9:16 Story") }
                }
            }
        }
    }
    if (showExitConfirmation) AlertDialog(
        onDismissRequest = { showExitConfirmation = false },
        title = { Text(if (en) "Leave route recording?" else "Rota kaydından çıkılsın mı?") },
        text = { Text(if (canSaveRoute(snapshot)) (if (en) "Save this route, discard it, or keep recording." else "Bu rotayı kaydet, sil veya kayda devam et.") else (if (en) "This route is too short to save and will be discarded." else "Bu rota kaydetmek için çok kısa ve silinecek.")) },
        dismissButton = { Row {
            TextButton(onClick = { showExitConfirmation = false }) { Text(if (en) "Keep recording" else "Kayda devam et") }
            if (canSaveRoute(snapshot)) TextButton(onClick = {
                store.discard()
                stopRoute(context, discard = true)
                showExitConfirmation = false
                onBack()
            }) { Text(if (en) "Discard" else "Sil", color = HedefitColors.Coral) }
        } },
        confirmButton = { TextButton(onClick = {
            val final = if (canSaveRoute(snapshot)) store.stop() else store.discard()
            stopRoute(context, discard = !canSaveRoute(final))
            if (canSaveRoute(final)) {
                snapshot = final
                finished = final
                sessionStatus = ActivitySessionStatus.COMPLETED
                activityTitle = defaultActivityTitle(final.activityType, en)
            } else onBack()
            showExitConfirmation = false
        }) { Text(if (canSaveRoute(snapshot)) (if (en) "Finish and save" else "Bitir ve kaydet") else (if (en) "Discard route" else "Rotayı sil"), color = HedefitColors.Coral) } },
    )
    if (showFinishConfirmation) AlertDialog(
        onDismissRequest = { showFinishConfirmation = false },
        title = { Text(if (en) "Finish activity?" else "Aktiviteyi bitirmek istiyor musun?") },
        text = { Text(if (en) "The recorded route will be ready to name, save and share." else "Kaydedilen rota adlandırmaya, kaydetmeye ve paylaşmaya hazır olacak.") },
        dismissButton = { TextButton(onClick = { showFinishConfirmation = false }) { Text(if (en) "Continue" else "Devam Et") } },
        confirmButton = { TextButton(onClick = {
            sessionStatus = ActivitySessionStatus.FINISHING
            val final = store.stop()
            stopRoute(context)
            snapshot = final
            finished = final
            sessionStatus = ActivitySessionStatus.COMPLETED
            activityTitle = defaultActivityTitle(final.activityType, en)
            showFinishConfirmation = false
        }) { Text(if (en) "Finish activity" else "Aktiviteyi Bitir", color = HedefitColors.Coral) } },
    )
    countdown?.let { value -> Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .92f)), contentAlignment = Alignment.Center) {
        Text(if (value > 0) value.toString() else if (en) "GO" else "BAŞLA", color = HedefitColors.Lime, fontWeight = FontWeight.Black, style = MaterialTheme.typography.displayLarge)
    } }
}

@Composable
private fun RouteMap(points: List<RoutePoint>, modifier: Modifier, en: Boolean = false) {
    val center = points.takeIf { it.isNotEmpty() }?.let { route ->
        RoutePoint((route.minOf { it.latitude } + route.maxOf { it.latitude }) / 2.0, (route.minOf { it.longitude } + route.maxOf { it.longitude }) / 2.0, 0.0, 0L)
    }
    BoxWithConstraints(modifier.background(Color(0xFF0B0D0C)), contentAlignment = Alignment.TopStart) {
        if (center == null) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Box(Modifier.size(64.dp).background(HedefitColors.Lime.copy(alpha = .15f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.DirectionsRun, null, tint = HedefitColors.Lime, modifier = Modifier.size(32.dp)) }
                Spacer(Modifier.height(10.dp)); Text(if (en) "GPS ready • Your route will appear here after you start" else "GPS hazır • Başladığında rotan burada çizilecek", color = HedefitColors.TextSecondary)
            }
        } else {
            val density = LocalDensity.current
            val tileSize = with(density) { 256.dp.toPx() }
            val width = with(density) { maxWidth.toPx() }
            val height = with(density) { maxHeight.toPx() }
            val zoom = fittedMapZoom(points, width, height, tileSize)
            val tileCount = 1 shl zoom
            val centerPosition = mapCoordinate(center, zoom)
            val centerTileX = floor(centerPosition.x).toInt()
            val centerTileY = floor(centerPosition.y).toInt()
            val horizontalTiles = (width / tileSize).toInt() / 2 + 2
            val verticalTiles = (height / tileSize).toInt() / 2 + 2
            for (tileY in (centerTileY - verticalTiles)..(centerTileY + verticalTiles)) {
                if (tileY !in 0 until tileCount) continue
                for (rawTileX in (centerTileX - horizontalTiles)..(centerTileX + horizontalTiles)) {
                    val left = width / 2f + (rawTileX - centerPosition.x).toFloat() * tileSize
                    val top = height / 2f + (tileY - centerPosition.y).toFloat() * tileSize
                    OpenStreetMapTile(zoom, rawTileX.mod(tileCount), tileY, Modifier.offset { IntOffset(left.roundToInt(), top.roundToInt()) }.size(256.dp))
                }
            }
            Canvas(Modifier.fillMaxSize()) {
                fixedScaleRoutePath(points, centerPosition, size.width, size.height, tileSize, zoom)?.let {
                    drawPath(it, Color(0xFF0A2711), style = Stroke(14f, cap = StrokeCap.Round))
                    drawPath(it, HedefitColors.Lime, style = Stroke(8f, cap = StrokeCap.Round))
                }
                fun pointOffset(point: RoutePoint): Offset { val coordinate = mapCoordinate(point, zoom); return Offset(size.width / 2f + (coordinate.x - centerPosition.x).toFloat() * tileSize, size.height / 2f + (coordinate.y - centerPosition.y).toFloat() * tileSize) }
                drawCircle(Color.White, radius = 10f, center = pointOffset(points.first()))
                drawCircle(HedefitColors.Lime, radius = 12f, center = pointOffset(points.last()))
            }
        }
    }
}

@Composable private fun RouteMetric(label: String, value: String, modifier: Modifier) = HedefitCard(modifier) { Column { Text(label, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelSmall); Text(value, color = HedefitColors.Lime, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleMedium) } }

@Composable
private fun RouteActivityChoice(
    label: String,
    emoji: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        modifier = modifier.height(68.dp),
        shape = RoundedCornerShape(18.dp),
        color = if (selected) HedefitColors.Lime else HedefitColors.Surface,
        contentColor = if (selected) HedefitColors.OnLime else HedefitColors.TextPrimary,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) HedefitColors.Lime else HedefitColors.Divider),
    ) {
        Row(Modifier.fillMaxSize().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(emoji, style = MaterialTheme.typography.headlineMedium)
            Text(label, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
        }
    }
}

private data class MapCoordinate(val x: Double, val y: Double)

private fun mapCoordinate(point: RoutePoint, zoom: Int = 16): MapCoordinate {
    val tileCount = 1 shl zoom
    val latitude = point.latitude.coerceIn(-85.05112878, 85.05112878)
    val x = (point.longitude + 180.0) / 360.0 * tileCount
    val y = (1.0 - ln(tan(Math.toRadians(latitude)) + 1.0 / cos(Math.toRadians(latitude))) / PI) / 2.0 * tileCount
    return MapCoordinate(x, y)
}

private fun fittedMapZoom(points: List<RoutePoint>, width: Float, height: Float, tileSize: Float): Int {
    if (points.size < 2) return 16
    for (zoom in 18 downTo 3) {
        val coordinates = points.map { mapCoordinate(it, zoom) }
        val spanX = (coordinates.maxOf { it.x } - coordinates.minOf { it.x }) * tileSize
        val spanY = (coordinates.maxOf { it.y } - coordinates.minOf { it.y }) * tileSize
        if (spanX <= width * .76f && spanY <= height * .58f) return zoom
    }
    return 3
}

@Composable
private fun OpenStreetMapTile(zoom: Int, x: Int, y: Int, modifier: Modifier) {
    val bitmap by produceState<Bitmap?>(initialValue = null, zoom, x, y) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                URL("https://tile.openstreetmap.org/$zoom/$x/$y.png").openConnection().apply {
                    connectTimeout = 6_000
                    readTimeout = 6_000
                    setRequestProperty("User-Agent", "Hedefit/0.2 Android route map")
                }.getInputStream().use(BitmapFactory::decodeStream)
            }.getOrNull()
        }
    }
    bitmap?.let { Image(it.asImageBitmap(), null, modifier, contentScale = ContentScale.FillBounds) }
        ?: Box(modifier.background(Color(0xFF172018)))
}

private fun fixedScaleRoutePath(points: List<RoutePoint>, center: MapCoordinate, width: Float, height: Float, tileSize: Float, zoom: Int): Path? {
    if (points.size < 2) return null
    return Path().apply {
        points.forEachIndexed { index, point ->
            val coordinate = mapCoordinate(point, zoom)
            val x = width / 2f + (coordinate.x - center.x).toFloat() * tileSize
            val y = height / 2f + (coordinate.y - center.y).toFloat() * tileSize
            if (index == 0) moveTo(x, y) else lineTo(x, y)
        }
    }
}

private fun startRoute(context: Context, store: RouteTrackingStore, activityType: String): RouteSnapshot {
    // Start the visible timer at the tap, rather than waiting for the service and
    // the next one-second UI refresh to create the route session.
    val started = store.start(activityType)
    ContextCompat.startForegroundService(context, Intent(context, RouteTrackingService::class.java))
    return started
}
private fun stopRoute(context: Context, discard: Boolean = false) = context.startService(
    Intent(context, RouteTrackingService::class.java).setAction(if (discard) RouteTrackingService.ACTION_DISCARD else RouteTrackingService.ACTION_STOP),
)

private suspend fun shareRoute(context: Context, snapshot: RouteSnapshot, title: String, story: Boolean) {
    val width = 1080
    val height = if (story) 1920 else 1080
    val file = withContext(Dispatchers.IO) {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = AndroidCanvas(bitmap)
        canvas.drawColor(AndroidColor.rgb(11, 13, 12))
        val mapBottom = (height - 390).coerceAtMost(1120).toFloat()
        drawShareMap(canvas, snapshot.points, width.toFloat(), mapBottom)
        canvas.drawRect(0f, mapBottom, width.toFloat(), height.toFloat(), Paint().apply { color = AndroidColor.rgb(11, 13, 12) })
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = AndroidColor.rgb(126, 225, 80)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        textPaint.textSize = 58f
        canvas.drawText(title.ifBlank { defaultActivityTitle(snapshot.activityType, false) }, 72f, height - 330f, textPaint)
        textPaint.color = AndroidColor.rgb(166, 174, 169)
        textPaint.textSize = 34f
        canvas.drawText("MESAFE", 72f, height - 220f, textPaint); canvas.drawText("SÜRE", 410f, height - 220f, textPaint); canvas.drawText("TEMPO", 730f, height - 220f, textPaint)
        textPaint.color = AndroidColor.WHITE
        textPaint.textSize = 46f
        canvas.drawText("%.2f km".format(snapshot.distanceMeters / 1_000.0), 72f, height - 155f, textPaint); canvas.drawText(formatDuration(snapshot.durationSeconds), 410f, height - 155f, textPaint); canvas.drawText(formatPace(snapshot.paceSecondsPerKm), 730f, height - 155f, textPaint)
        textPaint.color = AndroidColor.rgb(126, 225, 80)
        textPaint.typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        textPaint.textSize = 42f
        canvas.drawText("HEDEFİT ROTA", 72f, height - 70f, textPaint)
        val directory = File(context.cacheDir, "shared-routes").apply { mkdirs() }
        File(directory, "hedefit-rota-${snapshot.id}.png").also { output ->
            FileOutputStream(output).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Rotanı paylaş"))
}

private fun drawShareMap(canvas: AndroidCanvas, points: List<RoutePoint>, width: Float, height: Float) {
    if (points.isEmpty()) return
    val center = RoutePoint((points.minOf { it.latitude } + points.maxOf { it.latitude }) / 2.0, (points.minOf { it.longitude } + points.maxOf { it.longitude }) / 2.0, 0.0, 0L)
    val tileSize = 360f
    val zoom = fittedMapZoom(points, width, height, tileSize)
    val tileCount = 1 shl zoom
    val centerPosition = mapCoordinate(center, zoom)
    val centerTileX = floor(centerPosition.x).toInt()
    val centerTileY = floor(centerPosition.y).toInt()
    val horizontalTiles = ceil(width / tileSize / 2).toInt() + 1
    val verticalTiles = ceil(height / tileSize / 2).toInt() + 1
    for (tileY in (centerTileY - verticalTiles)..(centerTileY + verticalTiles)) {
        if (tileY !in 0 until tileCount) continue
        for (rawTileX in (centerTileX - horizontalTiles)..(centerTileX + horizontalTiles)) {
            val left = width / 2f + (rawTileX - centerPosition.x).toFloat() * tileSize
            val top = height / 2f + (tileY - centerPosition.y).toFloat() * tileSize
            if (left > width || top > height || left + tileSize < 0 || top + tileSize < 0) continue
            runCatching {
                URL("https://tile.openstreetmap.org/$zoom/${rawTileX.mod(tileCount)}/$tileY.png").openConnection().apply {
                    connectTimeout = 1_500
                    readTimeout = 1_500
                    setRequestProperty("User-Agent", "Hedefit/0.2 Android route share")
                }.getInputStream().use(BitmapFactory::decodeStream)
            }.getOrNull()?.let { tile -> canvas.drawBitmap(tile, null, RectF(left, top, left + tileSize, top + tileSize), null) }
        }
    }
    val path = AndroidPath()
    points.forEachIndexed { index, point ->
        val coordinate = mapCoordinate(point, zoom)
        val x = width / 2f + (coordinate.x - centerPosition.x).toFloat() * tileSize
        val y = height / 2f + (coordinate.y - centerPosition.y).toFloat() * tileSize
        if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    val routePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    routePaint.color = AndroidColor.rgb(10, 39, 17); routePaint.strokeWidth = 28f; canvas.drawPath(path, routePaint)
    routePaint.color = AndroidColor.rgb(126, 225, 80); routePaint.strokeWidth = 15f; canvas.drawPath(path, routePaint)
    val pointPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    fun drawPoint(point: RoutePoint, color: Int) { val coordinate = mapCoordinate(point, zoom); pointPaint.color = color; canvas.drawCircle(width / 2f + (coordinate.x - centerPosition.x).toFloat() * tileSize, height / 2f + (coordinate.y - centerPosition.y).toFloat() * tileSize, 18f, pointPaint) }
    drawPoint(points.first(), AndroidColor.WHITE)
    drawPoint(points.last(), AndroidColor.rgb(126, 225, 80))
    val attribution = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = AndroidColor.WHITE; textSize = 22f; setShadowLayer(3f, 0f, 1f, AndroidColor.BLACK) }
    canvas.drawText("© OpenStreetMap contributors", 20f, height - 18f, attribution)
}

private fun drawMinimalRoute(canvas: AndroidCanvas, points: List<RoutePoint>, paint: Paint, width: Float, height: Float) {
    if (points.size < 2) return
    val renderPoints = if (points.size <= 1_000) points else points.filterIndexed { index, _ -> index % (points.size / 1_000 + 1) == 0 } + points.last()
    val minLat = renderPoints.minOf { it.latitude }; val maxLat = renderPoints.maxOf { it.latitude }
    val minLng = renderPoints.minOf { it.longitude }; val maxLng = renderPoints.maxOf { it.longitude }
    val latRange = (maxLat - minLat).coerceAtLeast(.000001); val lngRange = (maxLng - minLng).coerceAtLeast(.000001)
    val left = 90f; val right = width - 90f; val top = 110f; val bottom = height * .65f
    val path = AndroidPath()
    renderPoints.forEachIndexed { index, point ->
        val x = (left + (point.longitude - minLng) / lngRange * (right - left)).toFloat()
        val y = (bottom - (point.latitude - minLat) / latRange * (bottom - top)).toFloat()
        if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    canvas.drawPath(path, paint)
}

private fun defaultActivityTitle(activityType: String, en: Boolean): String {
    val hour = java.time.LocalTime.now().hour
    val period = when { hour < 12 -> if (en) "Morning" else "Sabah"; hour < 18 -> if (en) "Afternoon" else "Öğleden Sonra"; else -> if (en) "Evening" else "Akşam" }
    val type = when (activityType) { "Koşu" -> if (en) "Run" else "Koşusu"; "Trail Koşusu" -> if (en) "Trail Run" else "Trail Koşusu"; "Bisiklet" -> if (en) "Ride" else "Bisikleti"; "Doğa Yürüyüşü" -> if (en) "Hike" else "Doğa Yürüyüşü"; else -> if (en) "Walk" else "Yürüyüşü" }
    return "$period $type"
}
