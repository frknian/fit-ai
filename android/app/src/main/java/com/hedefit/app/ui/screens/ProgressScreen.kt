package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.MonitorWeight
import androidx.compose.material.icons.filled.TrackChanges
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Route
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.LabeledValue
import com.hedefit.app.ui.components.MetricCard
import com.hedefit.app.ui.components.ScreenContainer
import com.hedefit.app.ui.components.SectionTitle
import com.hedefit.app.ui.components.Sparkline
import com.hedefit.app.ui.theme.HedefitColors
import com.hedefit.app.ui.settings.MeasurementUnits
import com.hedefit.app.data.model.DashboardData
import com.hedefit.app.data.model.BodyMeasurementData
import com.hedefit.app.data.model.WorkoutSessionData
import com.hedefit.app.data.model.RouteActivityData
import com.hedefit.app.data.model.WorkoutExercisePerformanceData
import com.hedefit.app.data.model.manualActivityTypes
import com.hedefit.app.route.formatDuration
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale

@Composable
fun ProgressScreen(
    padding: PaddingValues,
    expanded: Boolean,
    data: DashboardData?,
    language: String = "tr",
    unitSystem: String = "metric",
    weeklyWorkoutGoal: Int = 3,
    onWeeklyWorkoutGoalChange: (Int) -> Unit = {},
    measurementSaving: Boolean = false,
    onSaveMeasurement: (BodyMeasurementData) -> Unit = {},
    onDeleteRoute: (RouteActivityData) -> Unit = {},
) {
    val en = language == "en"
    var range by remember { mutableStateOf("30G") }
    var showGoalEditor by remember { mutableStateOf(false) }
    var showMeasurementEditor by remember { mutableStateOf(false) }
    var showWeeklyReview by remember { mutableStateOf(false) }
    val filteredData = filterProgressData(data, range)
    ScreenContainer(padding) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 16.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(15.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (en) "Progress" else "İlerleme", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
                    IconButton(onClick = { showMeasurementEditor = true }) { Icon(Icons.Default.MonitorWeight, if (en) "Add measurement" else "Ölçüm ekle", tint = HedefitColors.Lime) }
                }
            }
            item { TimeRangeSelector(range, en) { range = it } }
            if (expanded) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(1.2f), verticalArrangement = Arrangement.spacedBy(15.dp)) {
                            WeightChart(range, filteredData, en, unitSystem)
                            BodyMeasurements(filteredData, en, unitSystem) { showMeasurementEditor = true }
                        }
                        Column(Modifier.weight(.8f), verticalArrangement = Arrangement.spacedBy(15.dp)) {
                            ProgressMetrics(filteredData, data?.sessions.orEmpty(), weeklyWorkoutGoal, en) { showGoalEditor = true }
                            WorkoutHistory(filteredData, en)
                            ExercisePerformanceHistory(filteredData?.exercisePerformance.orEmpty(), en)
                            RouteHistory(filteredData?.routeActivities.orEmpty(), en, unitSystem, onDeleteRoute)
                            WeeklyReviewCard(filteredData, en) { showWeeklyReview = true }
                        }
                    }
                }
            } else {
                item { WeightChart(range, filteredData, en, unitSystem) }
                item { ProgressMetrics(filteredData, data?.sessions.orEmpty(), weeklyWorkoutGoal, en) { showGoalEditor = true } }
                item { WorkoutHistory(filteredData, en) }
                item { ExercisePerformanceHistory(filteredData?.exercisePerformance.orEmpty(), en) }
                item { RouteHistory(filteredData?.routeActivities.orEmpty(), en, unitSystem, onDeleteRoute) }
                item { BodyMeasurements(filteredData, en, unitSystem) { showMeasurementEditor = true } }
                item { WeeklyReviewCard(filteredData, en) { showWeeklyReview = true } }
            }
        }
    }
    if (showGoalEditor) WeeklyGoalDialog(weeklyWorkoutGoal, en, { showGoalEditor = false }) { onWeeklyWorkoutGoalChange(it); showGoalEditor = false }
    if (showMeasurementEditor) BodyMeasurementDialog(
        latest = data?.measurements?.lastOrNull(),
        profileWeightKg = data?.profile?.weightKg,
        en = en,
        unitSystem = unitSystem,
        saving = measurementSaving,
        onDismiss = { if (!measurementSaving) showMeasurementEditor = false },
        onSave = { onSaveMeasurement(it); showMeasurementEditor = false },
    )
    if (showWeeklyReview) WeeklyReviewDialog(filteredData, en) { showWeeklyReview = false }
}

private fun filterProgressData(data: DashboardData?, range: String): DashboardData? {
    data ?: return null
    val days = when (range) { "7G" -> 7L; "30G" -> 30L; "90G" -> 90L; "1Y" -> 365L; else -> null }
    val cutoff = days?.let { LocalDate.now().minusDays(it - 1) } ?: return data
    return data.copy(
        measurements = data.measurements.filter { runCatching { LocalDate.parse(it.date.take(10)) >= cutoff }.getOrDefault(false) },
        sessions = data.sessions.filter { sessionDate(it) >= cutoff },
        exercisePerformance = data.exercisePerformance.filter { performanceDate(it) >= cutoff },
        routeActivities = data.routeActivities.filter { routeDate(it) >= cutoff },
    )
}

@Composable
private fun TimeRangeSelector(selected: String, en: Boolean, onSelect: (String) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("7G", "30G", "90G", "1Y", "Tümü").forEach { item ->
            val active = item == selected
            Box(
                Modifier.weight(1f).background(if (active) HedefitColors.Lime else HedefitColors.SurfaceHigh, RoundedCornerShape(20.dp))
                    .clickable { onSelect(item) }.padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(if (en) when (item) { "7G" -> "7D"; "30G" -> "30D"; "90G" -> "90D"; "1Y" -> "1Y"; else -> "All" } else item, color = if (active) HedefitColors.OnLime else HedefitColors.TextPrimary, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable
private fun WeightChart(range: String, data: DashboardData?, en: Boolean, unitSystem: String) {
    val weights = data?.measurements?.mapNotNull { it.weightKg?.toFloat() }.orEmpty()
    val current = weights.lastOrNull() ?: data?.profile?.weightKg?.toFloat()
    val change = if (weights.size >= 2) current!! - weights.first() else null
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (en) "Weight" else "Kilo", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodyMedium)
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(current?.let { "%.1f".format(MeasurementUnits.weightValue(it.toDouble(), unitSystem)) } ?: "—", style = MaterialTheme.typography.displaySmall)
                Text(MeasurementUnits.weightUnit(unitSystem), modifier = Modifier.padding(bottom = 6.dp), color = HedefitColors.TextSecondary)
            }
            Text(change?.let { "%+.1f %s  %s".format(MeasurementUnits.weightValue(it.toDouble(), unitSystem), MeasurementUnits.weightUnit(unitSystem), if (it <= 0) "↓" else "↑") } ?: if (en) "At least 2 measurements are needed" else "Trend için en az 2 ölçüm gerekli", color = if (change != null) HedefitColors.Lime else HedefitColors.TextSecondary, fontWeight = FontWeight.Bold)
            Sparkline(
                if (weights.size >= 2) weights.map { MeasurementUnits.weightValue(it.toDouble(), unitSystem).toFloat() } else listOf(0f, 0f),
                Modifier.fillMaxWidth().height(if (range == "7G") 130.dp else 190.dp),
                showGrid = true,
            )
            val dates = data?.measurements.orEmpty().map { it.date.take(10) }
            if (dates.isNotEmpty()) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                listOf(dates.first(), dates[dates.lastIndex / 2], dates.last()).forEach { Text(formatDate(it, en), color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
private fun ProgressMetrics(data: DashboardData?, allSessions: List<WorkoutSessionData>, weeklyGoal: Int, en: Boolean, onEditGoal: () -> Unit) {
    val sessions = data?.sessions.orEmpty()
    val totalMinutes = sessions.sumOf { it.durationSeconds } / 60
    val totalCalories = sessions.sumOf { it.calories }
    val plannedSessions = sessions.filter { it.manualActivityKey == null }
    val totalPlanned = plannedSessions.sumOf { it.totalExercises }.coerceAtLeast(1)
    val completion = (plannedSessions.sumOf { it.completedExercises } * 100 / totalPlanned).coerceIn(0, 100)
    val weekStart = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
    val weeklyDone = allSessions.count { sessionDate(it) >= weekStart }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard(Icons.Default.FitnessCenter, "${sessions.size}", if (en) "Completed workouts" else "Tamamlanan antrenman", Modifier.weight(1f))
            MetricCard(Icons.Default.Timer, "$totalMinutes ${if (en) "min" else "dk"}", if (en) "Training time" else "Toplam antrenman süresi", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard(Icons.Default.LocalFireDepartment, "$totalCalories kcal", if (en) "Workout calories" else "Antrenman kalorisi", Modifier.weight(1f), HedefitColors.Warning)
            MetricCard(Icons.Default.CheckCircle, "%$completion", if (en) "Exercise completion" else "Hareket tamamlama", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard(Icons.Default.LocalFireDepartment, "${data?.streakDays ?: 0} ${if (en) "days" else "gün"}", if (en) "Current streak" else "Güncel seri", Modifier.weight(1f), HedefitColors.Warning)
            MetricCard(Icons.Default.TrackChanges, "$weeklyDone / $weeklyGoal", if (en) "Weekly workout target • tap to edit" else "Haftalık antrenman hedefi • değiştirmek için dokun", Modifier.weight(1f), onClick = onEditGoal)
        }
    }
}

@Composable
private fun WeeklyGoalDialog(current: Int, en: Boolean, onDismiss: () -> Unit, onSave: (Int) -> Unit) {
    var value by remember(current) { mutableStateOf(current.toFloat()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (en) "Weekly workout target" else "Haftalık antrenman hedefi") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (en) "${value.toInt()} completed workouts per week" else "Haftada ${value.toInt()} tamamlanmış antrenman", style = MaterialTheme.typography.titleLarge, color = HedefitColors.Lime)
            Text(if (en) "Choose how many separate workouts you realistically want to complete in one week." else "Bir hafta içinde gerçekçi olarak tamamlamak istediğin ayrı antrenman sayısını seç.", color = HedefitColors.TextSecondary)
            Slider(value = value, onValueChange = { value = it }, valueRange = 1f..7f, steps = 5)
        } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } },
        confirmButton = { Button(onClick = { onSave(value.toInt()) }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "Save" else "Kaydet") } },
    )
}

@Composable
private fun WorkoutHistory(data: DashboardData?, en: Boolean) {
    val sessions = data?.sessions.orEmpty().take(5)
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionTitle(if (en) "Recent workouts" else "Son antrenmanlar")
            if (sessions.isEmpty()) Text(if (en) "Completed workouts will appear here." else "Tamamladığın antrenmanlar burada tarihleriyle görünecek.", color = HedefitColors.TextSecondary)
            sessions.forEach { session ->
                val manualActivity = session.manualActivityKey?.let { key -> manualActivityTypes.firstOrNull { it.key == key } }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(manualActivity?.let { "${it.emoji} ${if (en) it.titleEn else it.titleTr}" } ?: formatDate(session.completedAt.take(10), en), style = MaterialTheme.typography.titleMedium)
                        Text(if (manualActivity != null) formatDate(session.completedAt.take(10), en) else if (en) "${session.completedExercises}/${session.totalExercises} movements completed" else "${session.completedExercises}/${session.totalExercises} hareket tamamlandı", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                    }
                    Text("${session.durationSeconds / 60} ${if (en) "min" else "dk"} • ${session.calories} kcal", color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

@Composable
private fun ExercisePerformanceHistory(performances: List<WorkoutExercisePerformanceData>, en: Boolean) {
    val latestByExercise = performances.sortedByDescending { it.completedAt }.distinctBy { it.exerciseId ?: it.exerciseName }.take(6)
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionTitle(if (en) "Movement progress" else "Hareket ilerlemesi")
            if (latestByExercise.isEmpty()) Text(if (en) "Complete a movement from your plan or the exercise atlas to see its performance here." else "Programdan veya Hareket Atlası'ndan bir hareketi tamamla; set performansın burada görünür.", color = HedefitColors.TextSecondary)
            latestByExercise.forEach { performance ->
                val best = performance.sets.maxWithOrNull(compareBy<com.hedefit.app.data.model.WorkoutSetPerformanceData> { it.weightKg ?: 0.0 }.thenBy { it.reps ?: 0 })
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(performance.exerciseName, style = MaterialTheme.typography.titleMedium)
                        Text(formatDate(performance.completedAt.take(10), en), color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                    }
                    Text(
                        best?.let { "${it.weightKg?.let { weight -> "${weight.toInt()} kg" } ?: if (en) "Bodyweight" else "Vücut ağırlığı"} × ${it.reps ?: "—"}" } ?: "—",
                        color = HedefitColors.Lime,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
        }
    }
}

@Composable
private fun RouteHistory(routes: List<RouteActivityData>, en: Boolean, unitSystem: String, onDeleteRoute: (RouteActivityData) -> Unit) {
    var selectedRoute by remember { mutableStateOf<RouteActivityData?>(null) }
    var deleteCandidate by remember { mutableStateOf<RouteActivityData?>(null) }
    val totalDistance = routes.sumOf { it.distanceMeters }
    val totalDuration = routes.sumOf { it.durationSeconds }
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionTitle(if (en) "Hedefit Route history" else "Hedefit Rota geçmişi")
            if (routes.isEmpty()) {
                Text(if (en) "Your completed GPS routes will appear here." else "Tamamladığın GPS rotaları burada görünecek.", color = HedefitColors.TextSecondary)
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MetricCard(Icons.Default.Route, MeasurementUnits.formatDistance(totalDistance, unitSystem), if (en) "Total distance" else "Toplam mesafe", Modifier.weight(1f))
                    MetricCard(Icons.Default.Timer, formatDuration(totalDuration), if (en) "Route time" else "Rota süresi", Modifier.weight(1f))
                }
                routes.take(5).forEach { route ->
                    val pace = if (route.distanceMeters >= 50) route.durationSeconds / (route.distanceMeters / 1000.0) else null
                    Row(Modifier.fillMaxWidth().clickable { selectedRoute = route }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Route, null, tint = HedefitColors.Lime, modifier = Modifier.size(20.dp))
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Text(route.title.ifBlank { routeActivityLabel(route.activityType, en) }, style = MaterialTheme.typography.titleMedium)
                            Text(formatDate(route.startedAt.take(10), en), color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(MeasurementUnits.formatDistance(route.distanceMeters, unitSystem), color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge)
                            Text("${formatDuration(route.durationSeconds)} • ${MeasurementUnits.formatPace(pace?.toInt(), unitSystem)}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
    selectedRoute?.let { route -> AlertDialog(
        onDismissRequest = { selectedRoute = null },
        title = { Text(route.title.ifBlank { routeActivityLabel(route.activityType, en) }) },
        text = { Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            RoutePolylinePreview(route, Modifier.fillMaxWidth().height(210.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                LabeledValue(if (en) "Distance" else "Mesafe", MeasurementUnits.formatDistance(route.distanceMeters, unitSystem), accent = HedefitColors.Lime)
                LabeledValue(if (en) "Time" else "Süre", formatDuration(route.movingDurationSeconds))
                LabeledValue(if (en) "Avg pace" else "Ort. Tempo", MeasurementUnits.formatPace(route.averagePaceSecondsPerKm, unitSystem))
            }
            Text("${if (en) "Elapsed" else "Toplam süre"}: ${formatDuration(route.durationSeconds)}  •  ${route.calories} kcal", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
        } },
        dismissButton = { TextButton(onClick = { selectedRoute = null; deleteCandidate = route }) { Text(if (en) "Delete record" else "Kaydı sil", color = HedefitColors.Coral) } },
        confirmButton = { TextButton(onClick = { selectedRoute = null }) { Text(if (en) "Done" else "Tamam") } },
    ) }
    deleteCandidate?.let { route -> AlertDialog(
        onDismissRequest = { deleteCandidate = null },
        title = { Text(if (en) "Delete this route?" else "Bu rota silinsin mi?") },
        text = { Text(if (en) "The GPS track, distance and activity record will be permanently deleted." else "GPS izi, mesafe ve aktivite kaydı kalıcı olarak silinecek.") },
        dismissButton = { TextButton(onClick = { deleteCandidate = null }) { Text(if (en) "Cancel" else "Vazgeç") } },
        confirmButton = { Button(onClick = { onDeleteRoute(route); deleteCandidate = null; selectedRoute = null }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Coral, contentColor = androidx.compose.ui.graphics.Color.White)) { Text(if (en) "Delete" else "Sil") } },
    ) }
}

@Composable
private fun RoutePolylinePreview(route: RouteActivityData, modifier: Modifier) {
    val points = route.routePoints
    Box(modifier.background(HedefitColors.SurfaceHigh, RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) {
        if (points.size < 2) Text("Rota önizlemesi bulunmuyor", color = HedefitColors.TextSecondary)
        else Canvas(Modifier.fillMaxSize().padding(18.dp)) {
            val minLat = points.minOf { it.latitude }; val maxLat = points.maxOf { it.latitude }
            val minLng = points.minOf { it.longitude }; val maxLng = points.maxOf { it.longitude }
            val latRange = (maxLat - minLat).coerceAtLeast(.000001); val lngRange = (maxLng - minLng).coerceAtLeast(.000001)
            val path = Path()
            points.forEachIndexed { index, point ->
                val x = ((point.longitude - minLng) / lngRange * size.width).toFloat()
                val y = (size.height - (point.latitude - minLat) / latRange * size.height).toFloat()
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(path, HedefitColors.Lime, style = Stroke(width = 8f, cap = StrokeCap.Round))
            val first = points.first(); val last = points.last()
            fun offset(point: com.hedefit.app.data.model.ActivityRoutePointData) = Offset(((point.longitude - minLng) / lngRange * size.width).toFloat(), (size.height - (point.latitude - minLat) / latRange * size.height).toFloat())
            drawCircle(androidx.compose.ui.graphics.Color.White, 9f, offset(first)); drawCircle(HedefitColors.Lime, 11f, offset(last))
        }
    }
}

private fun routeActivityLabel(type: String, en: Boolean) = when (type.lowercase()) {
    "run", "running", "koşu" -> if (en) "Run" else "Koşu"
    "ride", "cycling", "bisiklet" -> if (en) "Ride" else "Bisiklet"
    else -> if (en) "Walk" else "Yürüyüş"
}

@Composable
private fun BodyMeasurements(data: DashboardData?, en: Boolean, unitSystem: String, onClick: () -> Unit) {
    val latest = data?.measurements?.lastOrNull()
    val first = data?.measurements?.firstOrNull()
    HedefitCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            SectionTitle(if (en) "Body measurements" else "Vücut Ölçüleri", if (en) "Add / Edit" else "Ekle / Düzenle")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                LabeledValue(if (en) "Waist" else "Bel", latest?.waistCm?.let { MeasurementUnits.formatLength(it, unitSystem) } ?: "—", accent = HedefitColors.TextPrimary)
                LabeledValue(if (en) "Chest" else "Göğüs", latest?.chestCm?.let { MeasurementUnits.formatLength(it, unitSystem) } ?: "—")
                LabeledValue(if (en) "Arm" else "Kol", latest?.armCm?.let { MeasurementUnits.formatLength(it, unitSystem) } ?: "—")
                LabeledValue(if (en) "Leg" else "Bacak", latest?.thighCm?.let { MeasurementUnits.formatLength(it, unitSystem) } ?: "—")
            }
            if (first != null && latest != null && first != latest) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                listOf(measurementDelta(first.waistCm, latest.waistCm, unitSystem), measurementDelta(first.chestCm, latest.chestCm, unitSystem), measurementDelta(first.armCm, latest.armCm, unitSystem), measurementDelta(first.thighCm, latest.thighCm, unitSystem)).forEach { delta -> Text(delta ?: "—", color = if (delta != null) HedefitColors.Lime else HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
private fun BodyMeasurementDialog(
    latest: BodyMeasurementData?,
    profileWeightKg: Double?,
    en: Boolean,
    unitSystem: String,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (BodyMeasurementData) -> Unit,
) {
    fun initial(value: Double?) = value?.let { "%.1f".format(MeasurementUnits.heightValue(it, unitSystem)) }.orEmpty()
    var weight by remember(latest, unitSystem) { mutableStateOf(latest?.weightKg?.let { "%.1f".format(MeasurementUnits.weightValue(it, unitSystem)) } ?: profileWeightKg?.let { "%.1f".format(MeasurementUnits.weightValue(it, unitSystem)) }.orEmpty()) }
    var waist by remember(latest, unitSystem) { mutableStateOf(initial(latest?.waistCm)) }
    var hips by remember(latest, unitSystem) { mutableStateOf(initial(latest?.hipsCm)) }
    var chest by remember(latest, unitSystem) { mutableStateOf(initial(latest?.chestCm)) }
    var arm by remember(latest, unitSystem) { mutableStateOf(initial(latest?.armCm)) }
    var thigh by remember(latest, unitSystem) { mutableStateOf(initial(latest?.thighCm)) }
    var validationError by remember { mutableStateOf<String?>(null) }
    val keyboard = KeyboardOptions(keyboardType = KeyboardType.Decimal)
    fun parsed(raw: String) = raw.trim().replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 }
    fun lengthCm(raw: String) = parsed(raw)?.let { MeasurementUnits.heightToCm(it, unitSystem) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (en) "Update body measurements" else "Vücut ölçülerini güncelle") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    if (en) "Today's record is updated. Leave a field blank if you do not want to track it."
                    else "Bugünün kaydı güncellenir. Takip etmek istemediğin alanı boş bırakabilirsin.",
                    color = HedefitColors.TextSecondary,
                )
                OutlinedTextField(
                    value = weight,
                    onValueChange = { weight = it; validationError = null },
                    label = { Text(if (en) "Weight (${MeasurementUnits.weightUnit(unitSystem)})" else "Kilo (${MeasurementUnits.weightUnit(unitSystem)})") },
                    singleLine = true,
                    keyboardOptions = keyboard,
                    modifier = Modifier.fillMaxWidth(),
                )
                MeasurementInputRow(
                    firstValue = waist, onFirstChange = { waist = it; validationError = null }, firstLabel = if (en) "Waist" else "Bel",
                    secondValue = hips, onSecondChange = { hips = it; validationError = null }, secondLabel = if (en) "Hips" else "Kalça",
                    unit = MeasurementUnits.heightUnit(unitSystem), keyboard = keyboard,
                )
                MeasurementInputRow(
                    firstValue = chest, onFirstChange = { chest = it; validationError = null }, firstLabel = if (en) "Chest" else "Göğüs",
                    secondValue = arm, onSecondChange = { arm = it; validationError = null }, secondLabel = if (en) "Arm" else "Kol",
                    unit = MeasurementUnits.heightUnit(unitSystem), keyboard = keyboard,
                )
                OutlinedTextField(
                    value = thigh,
                    onValueChange = { thigh = it; validationError = null },
                    label = { Text("${if (en) "Thigh" else "Bacak"} (${MeasurementUnits.heightUnit(unitSystem)})") },
                    singleLine = true,
                    keyboardOptions = keyboard,
                    modifier = Modifier.fillMaxWidth(),
                )
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text(if (en) "Cancel" else "Vazgeç") } },
        confirmButton = {
            Button(
                enabled = !saving,
                onClick = {
                    val measurement = BodyMeasurementData(
                        date = LocalDate.now().toString(),
                        weightKg = parsed(weight)?.let { MeasurementUnits.weightToKg(it, unitSystem) },
                        waistCm = lengthCm(waist),
                        hipsCm = lengthCm(hips),
                        chestCm = lengthCm(chest),
                        armCm = lengthCm(arm),
                        thighCm = lengthCm(thigh),
                    )
                    val invalidWeight = weight.isNotBlank() && measurement.weightKg?.let { it in 20.0..400.0 } != true
                    val rawLengths = listOf(waist, hips, chest, arm, thigh)
                    val lengths = listOf(measurement.waistCm, measurement.hipsCm, measurement.chestCm, measurement.armCm, measurement.thighCm)
                    val invalidLength = rawLengths.zip(lengths).any { (raw, value) ->
                        raw.isNotBlank() && value?.let { it in 10.0..300.0 } != true
                    }
                    when {
                        invalidWeight -> validationError = if (en) "Weight must be between 20 and 400 kg." else "Kilo 20 ile 400 kg arasında olmalı."
                        invalidLength -> validationError = if (en) "Measurements must be between 10 and 300 cm." else "Çevre ölçüleri 10 ile 300 cm arasında olmalı."
                        listOf(measurement.weightKg, measurement.waistCm, measurement.hipsCm, measurement.chestCm, measurement.armCm, measurement.thighCm).all { it == null } -> validationError = if (en) "Enter at least one valid value." else "En az bir geçerli değer gir."
                        else -> onSave(measurement)
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime),
            ) { Text(if (saving) (if (en) "Saving…" else "Kaydediliyor…") else if (en) "Save" else "Kaydet") }
        },
    )
}

@Composable
private fun MeasurementInputRow(
    firstValue: String,
    onFirstChange: (String) -> Unit,
    firstLabel: String,
    secondValue: String,
    onSecondChange: (String) -> Unit,
    secondLabel: String,
    unit: String,
    keyboard: KeyboardOptions,
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(firstValue, onFirstChange, Modifier.weight(1f), label = { Text("$firstLabel ($unit)") }, singleLine = true, keyboardOptions = keyboard)
        OutlinedTextField(secondValue, onSecondChange, Modifier.weight(1f), label = { Text("$secondLabel ($unit)") }, singleLine = true, keyboardOptions = keyboard)
    }
}

private fun measurementDelta(first: Double?, latest: Double?, unitSystem: String) = if (first != null && latest != null) MeasurementUnits.formatLength(latest - first, unitSystem, signed = true).replace('.', ',') else null

private fun sessionDate(session: WorkoutSessionData): LocalDate = runCatching { Instant.parse(session.completedAt).atZone(ZoneId.systemDefault()).toLocalDate() }.recoverCatching { LocalDate.parse(session.completedAt.take(10)) }.getOrDefault(LocalDate.MIN)
private fun performanceDate(performance: WorkoutExercisePerformanceData): LocalDate = runCatching { Instant.parse(performance.completedAt).atZone(ZoneId.systemDefault()).toLocalDate() }.recoverCatching { LocalDate.parse(performance.completedAt.take(10)) }.getOrDefault(LocalDate.MIN)
private fun routeDate(route: RouteActivityData): LocalDate = runCatching { Instant.parse(route.startedAt).atZone(ZoneId.systemDefault()).toLocalDate() }.recoverCatching { LocalDate.parse(route.startedAt.take(10)) }.getOrDefault(LocalDate.MIN)

private fun formatDate(raw: String, en: Boolean): String = runCatching {
    LocalDate.parse(raw.take(10)).format(DateTimeFormatter.ofPattern(if (en) "d MMM" else "d MMM", if (en) Locale.ENGLISH else Locale("tr", "TR")))
}.getOrDefault(raw.take(10))

@Composable
private fun WeeklyReviewCard(data: DashboardData?, en: Boolean, onClick: () -> Unit) {
    HedefitCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(48.dp).background(HedefitColors.Sleep.copy(alpha = .14f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.AutoAwesome, null, tint = HedefitColors.Sleep)
            }
            Column(Modifier.weight(1f)) {
                Text(if (en) "Weekly Review" else "Haftalık Değerlendirme", style = MaterialTheme.typography.titleMedium)
                Text(if (data?.sessions.isNullOrEmpty()) (if (en) "Your personal review appears after your first workout." else "İlk antrenmanını tamamladıktan sonra kişisel değerlendirmen burada oluşacak.") else if (en) "Your new week is ready to review from ${data?.sessions?.size ?: 0} workouts." else "${data?.sessions?.size ?: 0} antrenman kaydın üzerinden yeni haftan değerlendirilmeye hazır.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodyMedium)
            }
            Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = HedefitColors.TextSecondary)
        }
    }
}

@Composable
private fun WeeklyReviewDialog(data: DashboardData?, en: Boolean, onDismiss: () -> Unit) {
    val sessions = data?.sessions.orEmpty()
    val minutes = sessions.sumOf { it.durationSeconds } / 60
    val completed = sessions.sumOf { it.completedExercises }
    val planned = sessions.sumOf { it.totalExercises }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (en) "Weekly Review" else "Haftalık Değerlendirme") },
        text = {
            if (sessions.isEmpty()) Text(if (en) "Complete your first workout to unlock a personal weekly review." else "Kişisel haftalık değerlendirmeni görmek için ilk antrenmanını tamamla.")
            else Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(if (en) "${sessions.size} workouts • $minutes minutes" else "${sessions.size} antrenman • $minutes dakika", style = MaterialTheme.typography.titleLarge, color = HedefitColors.Lime)
                Text(if (en) "$completed of $planned planned movements were completed." else "Planlanan $planned hareketin $completed tanesi tamamlandı.", color = HedefitColors.TextSecondary)
                Text(if (en) "Use your fatigue and pain feedback to keep next week progressive but sustainable." else "Gelecek haftayı ilerleyici ama sürdürülebilir tutmak için yorgunluk ve ağrı geri bildirimlerini kullan.", color = HedefitColors.TextSecondary)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(if (en) "Close" else "Kapat") } },
    )
}
