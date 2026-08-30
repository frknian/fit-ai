package com.hedefit.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.DirectionsWalk
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.LocalDrink
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.IconButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hedefit.app.R
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.MacroBar
import com.hedefit.app.ui.components.MetricCard
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.components.ProgressRing
import com.hedefit.app.ui.components.ScreenContainer
import com.hedefit.app.ui.components.AdBanner
import com.hedefit.app.ui.components.SectionTitle
import com.hedefit.app.ui.components.Sparkline
import com.hedefit.app.ui.theme.HedefitColors
import com.hedefit.app.ui.settings.MeasurementUnits
import com.hedefit.app.ui.settings.estimatedGoalWeeks
import com.hedefit.app.data.model.DashboardData
import com.hedefit.app.data.model.NutritionGoalData
import com.hedefit.app.data.model.NutritionLogData
import com.hedefit.app.data.model.WorkoutExerciseData
import com.hedefit.app.data.model.WorkoutProgramData
import com.hedefit.app.route.RouteTrackingStore
import com.hedefit.app.route.formatDuration
import com.hedefit.app.route.formatPace
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import java.time.LocalDate
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URL
import com.hedefit.app.steps.StepSource

@Composable
fun HomeScreen(
    padding: PaddingValues,
    expanded: Boolean,
    data: DashboardData?,
    avatarPreview: ByteArray?,
    loading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onSignOut: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenCalendar: () -> Unit,
    onOpenRoute: () -> Unit,
    onOpenGoal: () -> Unit,
    onOpenActivity: () -> Unit,
    onOpenProgram: (String?) -> Unit,
    onProgramHomeVisibilityChange: (WorkoutProgramData, Boolean) -> Unit,
    unitSystem: String,
    stepGoal: Int,
    onStepGoalChange: (Int) -> Unit,
    waterGoalMl: Int,
    onWaterGoalChange: (Int) -> Unit,
    onAddWater: (Int) -> Unit,
    language: String,
    stepSource: StepSource = StepSource.UNAVAILABLE,
    showAds: Boolean = false,
) {
    val en = language == "en"
    var metricDialog by remember { mutableStateOf<String?>(null) }
    ScreenContainer(padding) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 16.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { HomeHeader(data?.profile?.displayName ?: if (en) "Athlete" else "Sporcu", data?.profile?.avatarUrl, avatarPreview, onOpenProfile, onOpenNotifications, onOpenCalendar, en) }
            if (data == null) {
                item { HomeDataState(loading, error, onRetry) }
                return@LazyColumn
            }
            item { DailyMotivationCard(en) }
            item { GoalProjectionCard(data, onOpenGoal, en, unitSystem) }
            item { RouteLaunchCard(onOpenRoute, en, unitSystem) }
            item { ManualActivityLaunchCard(onOpenActivity, en) }
            item { CompactDailySummary(data, en, unitSystem, stepSource, { metricDialog = "steps" }, { metricDialog = "calories" }, { metricDialog = "water" }) }
            if (showAds) item { AdBanner(Modifier.fillMaxWidth()) }
            item { HomePrograms(data, en, onOpenProgram, onProgramHomeVisibilityChange) }
        }
    }
    when (metricDialog) {
        "steps" -> StepDetailDialog(data?.steps ?: 0, stepGoal, data?.stepHistory.orEmpty(), en, { metricDialog = null }, { onStepGoalChange(it); metricDialog = null })
        "calories" -> CalorieDetailDialog(data, en, stepSource) { metricDialog = null }
        "water" -> WaterAddDialog(data?.waterMl ?: 0, waterGoalMl, en, unitSystem, { metricDialog = null }, onWaterGoalChange) { onAddWater(it); metricDialog = null }
    }
}

@Composable
private fun ManualActivityLaunchCard(onOpen: () -> Unit, en: Boolean) {
    HedefitCard(Modifier.fillMaxWidth(), onClick = onOpen, contentPadding = PaddingValues(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(46.dp).background(HedefitColors.Lime.copy(alpha = .16f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Default.Add, null, tint = HedefitColors.Lime) }
            Column(Modifier.weight(1f)) {
                Text(if (en) "Log a sport" else "Spor aktivitesi ekle", style = MaterialTheme.typography.titleMedium)
                Text(if (en) "Sport, duration, distance and pace" else "Spor, süre, mesafe ve tempo", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
            Icon(Icons.Default.ChevronRight, null, tint = HedefitColors.Lime)
        }
    }
}

@Composable
private fun RouteLaunchCard(onOpenRoute: () -> Unit, en: Boolean, unitSystem: String) {
    val context = LocalContext.current
    val store = remember(context) { RouteTrackingStore(context) }
    var route by remember { mutableStateOf(store.readSummary()) }
    LaunchedEffect(Unit) { while (true) { route = store.readSummary(); delay(1_000) } }
    HedefitCard(Modifier.fillMaxWidth(), onClick = onOpenRoute) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(48.dp).background(HedefitColors.Lime, CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.Route, null, tint = HedefitColors.OnLime) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Hedefit Rota", style = MaterialTheme.typography.titleLarge)
                    if (route.tracking) Text(if (en) "GPS recording is active" else "GPS kaydı devam ediyor", color = HedefitColors.Lime, style = MaterialTheme.typography.bodySmall)
                }
                Icon(Icons.Default.ChevronRight, null, tint = HedefitColors.Lime)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                RouteHomeMetric(if (en) "Distance" else "Mesafe", MeasurementUnits.formatDistance(route.distanceMeters, unitSystem))
                RouteHomeMetric(if (en) "Time" else "Süre", formatDuration(route.durationSeconds))
                RouteHomeMetric(if (en) "Pace" else "Tempo", MeasurementUnits.formatPace(route.paceSecondsPerKm, unitSystem))
            }
        }
    }
}

@Composable
private fun RouteHomeMetric(label: String, value: String) = Column(horizontalAlignment = Alignment.Start) {
    Text(value, color = HedefitColors.Lime, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
    Text(label, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
}

@Composable
private fun HomeHeader(name: String, avatarUrl: String?, avatarPreview: ByteArray?, onOpenProfile: () -> Unit, onOpenNotifications: () -> Unit, onOpenCalendar: () -> Unit, en: Boolean) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(if (en) "Hello, $name" else "Merhaba, $name", style = MaterialTheme.typography.headlineSmall)
        }
        IconButton(onClick = onOpenCalendar) {
            Icon(Icons.Default.CalendarMonth, if (en) "Workout calendar" else "Antrenman takvimi", tint = HedefitColors.Lime)
        }
        IconButton(onClick = onOpenNotifications) {
            Icon(Icons.Default.NotificationsNone, if (en) "Notifications" else "Bildirimler", tint = HedefitColors.TextSecondary)
        }
        HomeAvatar(avatarUrl, avatarPreview, name, Modifier.size(48.dp).clickable(onClick = onOpenProfile))
    }
}

@Composable
private fun HomeAvatar(url: String?, previewBytes: ByteArray?, name: String, modifier: Modifier) {
    var bitmap by remember(url) { mutableStateOf<android.graphics.Bitmap?>(null) }
    val preview = remember(previewBytes) { previewBytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size) } }
    LaunchedEffect(url) { bitmap = url?.let { address -> withContext(Dispatchers.IO) { runCatching { URL(address).openStream().use(BitmapFactory::decodeStream) }.getOrNull() } } }
    Box(modifier.clip(CircleShape).background(HedefitColors.Lime).padding(2.dp).clip(CircleShape).background(HedefitColors.SurfaceHigh), contentAlignment = Alignment.Center) {
        (preview ?: bitmap)?.let { Image(it.asImageBitmap(), contentDescription = "Profil fotoğrafı", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
            ?: Text(name.take(2).uppercase(), color = HedefitColors.Lime, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun GoalProjectionCard(data: DashboardData, onOpen: () -> Unit, en: Boolean, unitSystem: String) {
    val current = data.measurements.lastOrNull()?.weightKg ?: data.profile.weightKg
    val target = data.profile.targetWeightKg
    val weeks = estimatedGoalWeeks(current, target)
    HedefitCard(Modifier.fillMaxWidth(), onClick = onOpen) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(if (en) "My goal journey" else "Hedef yolculuğum", color = HedefitColors.Lime, style = MaterialTheme.typography.titleLarge)
                    Text(if (weeks != null) (if (en) "About $weeks weeks to target" else "Hedefe yaklaşık $weeks hafta") else if (en) "View progress and estimate" else "İlerlemeni ve tahmini süreni gör", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                }
                if (current != null && target != null) Text("${MeasurementUnits.formatWeight(current, unitSystem, 0)} → ${MeasurementUnits.formatWeight(target, unitSystem, 0)}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelLarge)
            }
            Sparkline(
                if (current != null && target != null) List(7) { index -> (current + (target - current) * index / 6f).toFloat() } else listOf(2f, 2.4f, 3.2f, 4.1f, 5.7f, 7f),
                Modifier.fillMaxWidth().height(48.dp), showGrid = true,
            )
            Text(if (en) "The estimate updates using a sustainable weekly rate." else "Tahmin, haftalık sürdürülebilir değişim hızına göre güncellenir.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            Text(if (en) "Open details" else "Detayları aç", color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun HomePrograms(
    data: DashboardData,
    en: Boolean,
    onOpenProgram: (String?) -> Unit,
    onVisibilityChange: (WorkoutProgramData, Boolean) -> Unit,
) {
    var showPicker by remember { mutableStateOf(false) }
    val programs = data.workoutPrograms.filter(WorkoutProgramData::showOnHome)
    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(if (en) "Programs" else "Programlar", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            IconButton(onClick = { showPicker = true }) { Icon(Icons.Default.Add, if (en) "Add program" else "Program ekle", tint = HedefitColors.Lime) }
        }
        if (programs.isEmpty()) {
            TextButton(onClick = { showPicker = true }) { Icon(Icons.Default.Add, null, tint = HedefitColors.Lime); Spacer(Modifier.width(6.dp)); Text(if (en) "Add a program" else "Program Ekle", color = HedefitColors.Lime) }
        } else LazyRow(horizontalArrangement = Arrangement.spacedBy(9.dp), contentPadding = PaddingValues(end = 18.dp)) {
            items(programs, key = { it.id }) { program ->
                HedefitCard(Modifier.width(218.dp).height(108.dp), onClick = { onOpenProgram(program.id) }, contentPadding = PaddingValues(14.dp)) {
                    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(30.dp).background(HedefitColors.Lime.copy(alpha = .15f), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.FitnessCenter, null, tint = HedefitColors.Lime, modifier = Modifier.size(17.dp))
                            }
                            Spacer(Modifier.width(8.dp))
                            Text(if (en) "PROGRAM" else "PROGRAM", color = HedefitColors.Lime, style = MaterialTheme.typography.labelSmall)
                        }
                        Column {
                            Text(program.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
                            Text(
                                listOfNotNull(program.focusArea.takeIf { it.isNotBlank() }, if (en) "${program.exercises.size} exercises" else "${program.exercises.size} hareket").joinToString(" • "),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = HedefitColors.TextSecondary,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
    }
    if (showPicker) AlertDialog(
        onDismissRequest = { showPicker = false },
        title = { Text(if (en) "Add programs" else "Program Ekle") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (data.workoutPrograms.isEmpty()) Text(if (en) "Create a program from the Workout tab first." else "Önce Antrenman sekmesinden bir program oluştur.", color = HedefitColors.TextSecondary)
            data.workoutPrograms.forEach { program ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(program.name); Text(if (en) "${program.exercises.size} exercises" else "${program.exercises.size} hareket", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                    androidx.compose.material3.Checkbox(checked = program.showOnHome, onCheckedChange = { onVisibilityChange(program, it) })
                }
            }
        } },
        confirmButton = { TextButton(onClick = { showPicker = false }) { Text(if (en) "Done" else "Tamam") } },
    )
}

@Composable
private fun CompactDailySummary(data: DashboardData, en: Boolean, unitSystem: String, stepSource: StepSource, onSteps: () -> Unit, onCalories: () -> Unit, onWater: () -> Unit) {
    val sourceLabel = when (stepSource) {
        StepSource.HEALTH_CONNECT -> if (en) "Health Connect" else "Health Connect"
        StepSource.DEVICE_STEP_COUNTER, StepSource.DEVICE_STEP_DETECTOR -> if (en) "This device" else "Bu cihaz"
        StepSource.UNAVAILABLE -> null
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CompactMetricCard(Icons.Default.DirectionsWalk, "%,d".format(data.steps).replace(',', '.'), sourceLabel, HedefitColors.Lime, onSteps, Modifier.weight(1f))
        CalorieBalanceCompactCard(data, en, stepSource, onCalories, Modifier.weight(1f))
        CompactMetricCard(Icons.Default.LocalDrink, MeasurementUnits.formatWater(data.waterMl, unitSystem), null, HedefitColors.Water, onWater, Modifier.weight(1f))
    }
}

@Composable
private fun CalorieBalanceCompactCard(data: DashboardData, en: Boolean, stepSource: StepSource, onClick: () -> Unit, modifier: Modifier) {
    val consumed = data.nutritionLogs.sumOf { it.calories }
    val today = LocalDate.now()
    val manualBurned = data.sessions.filter { session ->
        session.manualActivityKey != null && runCatching { java.time.Instant.parse(session.completedAt).atZone(java.time.ZoneId.systemDefault()).toLocalDate() == today }.getOrDefault(false)
    }.sumOf { it.calories }
    // Health Connect aktifken onun birleştirilmiş kalorisi kanonik kaynaktır;
    // aynı seansı manuel kayıtla ikinci kez eklemeyiz.
    val burned = data.activeCalories + if (stepSource == StepSource.HEALTH_CONNECT) 0 else manualBurned
    HedefitCard(modifier.height(96.dp), onClick = onClick, contentPadding = PaddingValues(horizontal = 7.dp, vertical = 9.dp)) {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Icon(Icons.Default.LocalFireDepartment, null, tint = HedefitColors.Warning, modifier = Modifier.size(19.dp))
            Spacer(Modifier.height(3.dp))
            Text(if (en) "IN $consumed" else "ALINAN $consumed", maxLines = 1, style = MaterialTheme.typography.labelMedium)
            Text(if (en) "OUT $burned" else "YAKILAN $burned", maxLines = 1, color = HedefitColors.Warning, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun CompactMetricCard(icon: androidx.compose.ui.graphics.vector.ImageVector, value: String?, label: String?, accent: Color, onClick: () -> Unit, modifier: Modifier) {
    HedefitCard(modifier.height(96.dp), onClick = onClick, contentPadding = PaddingValues(horizontal = 10.dp, vertical = 12.dp)) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, null, tint = accent, modifier = Modifier.size(if (value == null) 42.dp else 20.dp))
            if (value != null) Spacer(Modifier.height(4.dp))
            value?.let { Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleLarge) }
            label?.let { Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun DailyMotivationCard(en: Boolean) {
    val messages = if (en) listOf(
        "Consistency beats intensity you cannot repeat.",
        "One controlled rep is progress you can build on.",
        "Train for the person you want to be tomorrow.",
        "A short workout still keeps the promise you made to yourself.",
        "Good form today creates strength for the long run.",
        "You do not need perfect conditions; you need the next step.",
        "Recovery is part of training, not time away from it.",
    ) else listOf(
        "Tekrarlayabildiğin düzen, sürdüremediğin yoğunluktan güçlüdür.",
        "Kontrollü yapılan tek bir tekrar bile üzerine koyabileceğin ilerlemedir.",
        "Yarın olmak istediğin kişi için bugün hareket et.",
        "Kısa bir antrenman da kendine verdiğin sözü tutar.",
        "Bugünkü iyi form, uzun vadeli gücün temelidir.",
        "Mükemmel koşullara değil, sıradaki adıma ihtiyacın var.",
        "Toparlanma antrenmanın dışında değil, onun bir parçasıdır.",
    )
    val message = messages[(LocalDate.now().dayOfYear - 1) % messages.size]
    HedefitCard(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.size(46.dp).background(HedefitColors.Lime.copy(alpha = .14f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.AutoAwesome, null, tint = HedefitColors.Lime) }
            Column(Modifier.weight(1f)) {
                Text(if (en) "Today" else "Bugünün sözü", color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge)
                Text(message, style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
private fun StepDetailDialog(steps: Int, goal: Int, history: List<com.hedefit.app.data.model.DailyStepData>, en: Boolean, onDismiss: () -> Unit, onSave: (Int) -> Unit) {
    var target by remember(goal) { mutableStateOf(goal.toString()) }
    var historyDays by remember { mutableStateOf(7) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (en) "Step details" else "Adım detayları") }, text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (en) "$steps steps today" else "Bugün $steps adım", color = HedefitColors.Lime, style = MaterialTheme.typography.headlineSmall)
        Text(if (en) "You completed %${(steps * 100 / goal.coerceAtLeast(1)).coerceAtMost(999)} of your target." else "Hedefinin %${(steps * 100 / goal.coerceAtLeast(1)).coerceAtMost(999)} kadarını tamamladın.", color = HedefitColors.TextSecondary)
        OutlinedTextField(target, { target = it.filter(Char::isDigit).take(5) }, label = { Text(if (en) "Daily step target" else "Günlük adım hedefi") }, singleLine = true)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { listOf(6000, 8000, 10000, 12000).forEach { value -> TextButton(onClick = { target = value.toString() }) { Text("${value / 1000}K") } } }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { TextButton(onClick = { historyDays = 7 }) { Text(if (en) "7 days" else "7 gün") }; TextButton(onClick = { historyDays = 30 }) { Text(if (en) "30 days" else "30 gün") } }
        history.takeLast(historyDays).joinToString(" · ") { "${it.localDate.dayOfMonth}: ${it.steps / 1000}K" }.takeIf { it.isNotBlank() }?.let { Text(it, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
    } }, dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Close" else "Kapat") } }, confirmButton = { Button(onClick = { onSave(target.toIntOrNull()?.coerceIn(1000, 50000) ?: goal) }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "Save target" else "Hedefi kaydet") } })
}

@Composable
private fun CalorieDetailDialog(data: DashboardData?, en: Boolean, stepSource: StepSource, onDismiss: () -> Unit) {
    val consumed = data?.nutritionLogs.orEmpty().sumOf { it.calories }
    val base = data?.nutritionGoal?.calories ?: 0
    val manualBurned = data?.sessions.orEmpty().filter { session -> session.manualActivityKey != null && runCatching { java.time.Instant.parse(session.completedAt).atZone(java.time.ZoneId.systemDefault()).toLocalDate() == LocalDate.now() }.getOrDefault(false) }.sumOf { it.calories }
    val burned = (data?.activeCalories ?: 0) + if (stepSource == StepSource.HEALTH_CONNECT) 0 else manualBurned
    val target = base + burned.coerceIn(0, 600)
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (en) "Calorie balance" else "Kalori dengesi") }, text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (en) "Your target is $target kcal" else "$target kcal almalısın", color = HedefitColors.Lime, style = MaterialTheme.typography.headlineSmall)
        HedefitCard { Column(verticalArrangement = Arrangement.spacedBy(7.dp)) { Text(if (en) "Consumed: $consumed kcal" else "Alınan: $consumed kcal"); Text(if (en) "Active burn: $burned kcal" else "Aktivitede harcanan: $burned kcal"); Text(if (en) "Remaining: ${(target - consumed).coerceAtLeast(0)} kcal" else "Kalan: ${(target - consumed).coerceAtLeast(0)} kcal", color = HedefitColors.Lime) } }
        Text(if (en) "Health Connect and manually logged sports update this value." else "Health Connect ve elle eklediğin sporlar bu değeri günceller.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
    } }, confirmButton = { TextButton(onClick = onDismiss) { Text(if (en) "Done" else "Tamam") } })
}

@Composable
private fun WaterAddDialog(currentMl: Int, goalMl: Int, en: Boolean, unitSystem: String, onDismiss: () -> Unit, onGoalChange: (Int) -> Unit, onAdd: (Int) -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (en) "Add water" else "Su ekle") }, text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (en) "${MeasurementUnits.formatWater(currentMl, unitSystem)} today" else "Bugün ${MeasurementUnits.formatWater(currentMl, unitSystem)} içtin", color = HedefitColors.Water, style = MaterialTheme.typography.headlineSmall)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(if (en) "Daily goal" else "Günlük hedef", color = HedefitColors.TextSecondary)
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { onGoalChange((goalMl - 250).coerceAtLeast(500)) }) { Icon(Icons.Default.Remove, if (en) "Decrease goal" else "Hedefi azalt") }
                Text(MeasurementUnits.formatWater(goalMl, unitSystem), color = HedefitColors.Water, fontWeight = FontWeight.Bold)
                IconButton(onClick = { onGoalChange((goalMl + 250).coerceAtMost(10_000)) }) { Icon(Icons.Default.Add, if (en) "Increase goal" else "Hedefi artır") }
            }
        }
        Box(Modifier.fillMaxWidth().height(7.dp).background(HedefitColors.Divider, CircleShape)) { Box(Modifier.fillMaxWidth((currentMl / goalMl.toFloat()).coerceIn(0f, 1f)).height(7.dp).background(HedefitColors.Water, CircleShape)) }
        listOf(200, 300, 500).forEach { amount -> Button(onClick = { onAdd(amount) }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.SurfaceHigh, contentColor = HedefitColors.Water)) { Text("+${if (MeasurementUnits.isImperial(unitSystem)) MeasurementUnits.formatWater(amount, unitSystem) else "$amount ml"}") } }
    } }, dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Close" else "Kapat") } }, confirmButton = {})
}

@Composable
private fun CompactRecovery(data: DashboardData, en: Boolean) {
    val latestFatigue = data.sessions.firstOrNull()?.fatigue
    val ready = data.sleepMinutes >= 360 && (latestFatigue == null || latestFatigue <= 3)
    Row(Modifier.fillMaxWidth().background(HedefitColors.SurfaceHigh, RoundedCornerShape(14.dp)).padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.Bedtime, null, tint = if (ready) HedefitColors.Lime else HedefitColors.Warning, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Text(if (ready) (if (en) "Recovered • Ready today" else "Toparlanman iyi • Bugün hazırsın") else (if (en) "Low recovery • Keep it light" else "Toparlanma düşük • Yükü kontrollü tut"), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Icon(Icons.Default.ChevronRight, null, tint = HedefitColors.TextSecondary, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun WorkoutHero(workout: WorkoutExerciseData?, onStartWorkout: () -> Unit) {
    HedefitCard(contentPadding = PaddingValues(0.dp)) {
        Box(Modifier.fillMaxWidth().height(280.dp)) {
            Image(
                painterResource(R.drawable.exercise_curl),
                contentDescription = "Üst vücut antrenmanı",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(listOf(Color.Transparent, HedefitColors.Background.copy(alpha = .45f), HedefitColors.Background.copy(alpha = .96f))),
                ),
            )
            Column(
                Modifier.fillMaxSize().padding(18.dp),
                verticalArrangement = Arrangement.Bottom,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.FitnessCenter, null, tint = HedefitColors.Lime, modifier = Modifier.size(22.dp))
                    Text("${workout?.sets ?: 3} set • ${workout?.reps ?: "8–12"} tekrar", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodyMedium)
                }
                Spacer(Modifier.height(5.dp))
                Text(workout?.name ?: "Programını oluştur", style = MaterialTheme.typography.headlineMedium)
                Spacer(Modifier.height(12.dp))
                Box(Modifier.fillMaxWidth().height(6.dp).background(HedefitColors.Divider, CircleShape)) {
                    Box(Modifier.fillMaxWidth(.70f).height(6.dp).background(HedefitColors.Lime, CircleShape))
                }
                Spacer(Modifier.height(12.dp))
                PrimaryButton(if (workout == null) "Antrenman Sekmesine Git" else "Başla", onStartWorkout, icon = Icons.Default.PlayArrow)
            }
        }
    }
}

@Composable
private fun NutritionSummary(logs: List<NutritionLogData>, goal: NutritionGoalData) {
    val calories = logs.sumOf { it.calories }
    val protein = logs.sumOf { it.protein }
    val carbs = logs.sumOf { it.carbs }
    val fat = logs.sumOf { it.fat }
    HedefitCard(Modifier.fillMaxWidth()) {
        BoxWithConstraints {
            val compact = maxWidth < 310.dp
            val ring: @Composable () -> Unit = {
                ProgressRing(calories / goal.calories.toFloat(), Modifier.size(124.dp), strokeWidth = 10.dp) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.LocalFireDepartment, null, tint = HedefitColors.Lime, modifier = Modifier.size(18.dp))
                        Text("$calories", style = MaterialTheme.typography.headlineSmall)
                        Text("kcal", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            val macros: @Composable () -> Unit = {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                    MacroBar("Protein", "${protein.toInt()} / ${goal.protein} g", (protein / goal.protein).toFloat())
                    MacroBar("Karbonhidrat", "${carbs.toInt()} / ${goal.carbs} g", (carbs / goal.carbs).toFloat())
                    MacroBar("Yağ", "${fat.toInt()} / ${goal.fat} g", (fat / goal.fat).toFloat())
                }
            }
            if (compact) {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
                    ring()
                    macros()
                }
            } else Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                ring()
                Box(Modifier.weight(1f)) { macros() }
            }
        }
    }
}

@Composable
private fun ActivityMetrics(data: DashboardData) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard(Icons.Default.DirectionsWalk, "%,d".format(data.steps).replace(',', '.'), "adım", Modifier.weight(1f)) {
                Sparkline(listOf(1f, 3f, 2f, 5f, 4f, 8f, 7f), Modifier.fillMaxWidth().height(24.dp))
            }
            MetricCard(Icons.Default.LocalFireDepartment, "${data.streakDays} gün", "günlük seri", Modifier.weight(1f), HedefitColors.Warning) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    repeat(7) { index -> Box(Modifier.size(8.dp).background(if (index < data.streakDays.coerceAtMost(7)) HedefitColors.Lime else HedefitColors.Divider, CircleShape)) }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard(Icons.Default.LocalDrink, "%.1f L".format(data.waterMl / 1000.0), "su", Modifier.weight(1f), HedefitColors.Water)
            MetricCard(Icons.Default.Bedtime, "${data.sleepMinutes / 60} sa ${data.sleepMinutes % 60} dk", "uyku", Modifier.weight(1f), HedefitColors.Sleep)
        }
    }
}

@Composable
private fun RecoveryCard(data: DashboardData) {
    val latestFatigue = data.sessions.firstOrNull()?.fatigue
    val ready = data.sleepMinutes >= 360 && (latestFatigue == null || latestFatigue <= 3)
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionTitle("Toparlanma")
            Text(if (ready) "Bugünkü antrenman için hazırsın" else "Bugün yükü kontrollü tut", style = MaterialTheme.typography.titleMedium)
            Text(
                "${data.sleepMinutes / 60} saat ${data.sleepMinutes % 60} dakika uyku ve son antrenmandaki ${latestFatigue ?: "—"}/5 yorgunluk puanın birlikte değerlendirildi.",
                color = HedefitColors.TextSecondary,
                style = MaterialTheme.typography.bodyMedium,
            )
            Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(HedefitColors.Divider)) {
                Box(Modifier.fillMaxWidth(if (ready) .78f else .42f).height(6.dp).background(if (ready) HedefitColors.Lime else HedefitColors.Warning, CircleShape))
            }
        }
    }
}

@Composable
private fun HomeDataState(loading: Boolean, error: String?, onRetry: () -> Unit) {
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp)) {
            if (loading) CircularProgressIndicator(color = HedefitColors.Lime)
            Text(if (loading) "Verilerin yükleniyor…" else error ?: "Henüz veri bulunamadı.", color = HedefitColors.TextSecondary)
            if (!loading) PrimaryButton("Tekrar Dene", onRetry, Modifier.fillMaxWidth(.7f))
        }
    }
}
