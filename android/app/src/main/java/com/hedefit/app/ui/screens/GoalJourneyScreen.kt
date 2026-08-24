package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.MonitorWeight
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material3.Icon
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.hedefit.app.data.model.DashboardData
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.Sparkline
import com.hedefit.app.ui.settings.MeasurementUnits
import com.hedefit.app.ui.settings.estimatedGoalWeeks
import com.hedefit.app.ui.theme.HedefitColors
import kotlin.math.abs

@Composable
fun GoalJourneyScreen(data: DashboardData, onBack: () -> Unit, onSetCurrentWeight: (Double) -> Unit, onSetGoalWeight: (Double) -> Unit, onCreateRegionalProgram: (String, String) -> Unit = { _, _ -> }, language: String = "tr", unitSystem: String = "metric") {
    val en = language == "en"
    var showCurrentEditor by remember { mutableStateOf(false) }
    var showGoalEditor by remember { mutableStateOf(false) }
    var selectedFocus by remember { mutableStateOf("inner_thigh") }
    val current = data.measurements.lastOrNull()?.weightKg ?: data.profile.weightKg
    val target = data.profile.targetWeightKg
    val weeks = estimatedGoalWeeks(current, target)
    val heightMeters = data.profile.heightCm?.div(100.0)
    val bmi = if (current != null && heightMeters != null && heightMeters > 0) current / (heightMeters * heightMeters) else null
    val bmiRange = bmi?.let {
        when {
            it < 18.5 -> if (en) "Below reference range" else "Referans aralığının altında"
            it < 25.0 -> if (en) "Reference range" else "Referans aralığı"
            it < 30.0 -> if (en) "Above reference range" else "Referans aralığının üzerinde"
            else -> if (en) "High range" else "Yüksek aralık"
        }
    }
    val difference = if (current != null && target != null) abs(target - current) else null
    val weeklyRate = if (difference != null && weeks != null && weeks > 0) difference / weeks else null
    Column(Modifier.fillMaxSize().background(HedefitColors.Background).statusBarsPadding()) {
        UtilityHeader(if (en) "My goal journey" else "Hedef yolculuğum", onBack)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(18.dp, 8.dp, 18.dp, 40.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { HedefitCard(Modifier.fillMaxWidth()) { Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Flag, null, tint = HedefitColors.Lime); Spacer(Modifier.width(9.dp)); Text(if (en) "Estimated path to target" else "Hedefe giden tahmini çizgi", style = MaterialTheme.typography.titleLarge) }
                Sparkline(if (current != null && target != null) List(9) { i -> (current + (target - current) * i / 8.0).toFloat() } else listOf(1f, 2f, 3f, 4f), Modifier.fillMaxWidth().height(130.dp), showGrid = true)
                Text(if (target == null) (if (en) "Set your target to create a personal projection." else "Kişisel tahminini oluşturmak için hedefini belirle.") else if (en) "The estimate updates with every new measurement." else "Her yeni ölçümle tahmin otomatik güncellenir.", color = HedefitColors.TextSecondary)
            } } }
            item { LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(end = 18.dp)) {
                item { JourneyValue(Icons.Default.MonitorWeight, if (en) "Current • tap to edit" else "Mevcut • değiştirmek için dokun", current?.let { MeasurementUnits.formatWeight(it, unitSystem) } ?: "—", Modifier.width(190.dp)) { showCurrentEditor = true } }
                item { JourneyValue(Icons.Default.Flag, if (en) "Target • tap to edit" else "Hedef • değiştirmek için dokun", target?.let { MeasurementUnits.formatWeight(it, unitSystem) } ?: if (en) "Set target" else "Hedef belirle", Modifier.width(190.dp)) { showGoalEditor = true } }
                item { JourneyValue(Icons.Default.Schedule, if (en) "Estimate" else "Tahmin", weeks?.let { if (en) "$it weeks" else "$it hafta" } ?: "—", Modifier.width(150.dp)) }
                item { JourneyValue(Icons.Default.Insights, if (en) "Remaining" else "Kalan değişim", difference?.let { MeasurementUnits.formatWeight(it, unitSystem) } ?: "—", Modifier.width(150.dp)) }
            } }
            item {
                val focus = regionalFocuses(en).first { it.id == selectedFocus }
                HedefitCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.FitnessCenter, null, tint = HedefitColors.Lime)
                            Spacer(Modifier.width(9.dp))
                            Column { Text(if (en) "Body-part focus" else "Bölgesel odak", style = MaterialTheme.typography.titleLarge); Text(if (en) "Strength plan + realistic body-composition estimate" else "Kuvvet planı + gerçekçi vücut kompozisyonu tahmini", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                        }
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(regionalFocuses(en).size) { index ->
                                val item = regionalFocuses(en)[index]
                                val active = item.id == selectedFocus
                                Text(item.label, Modifier.background(if (active) HedefitColors.Lime else HedefitColors.SurfaceHigh, androidx.compose.foundation.shape.RoundedCornerShape(18.dp)).clickable { selectedFocus = item.id }.padding(horizontal = 13.dp, vertical = 8.dp), color = if (active) HedefitColors.OnLime else HedefitColors.TextPrimary, style = MaterialTheme.typography.labelLarge)
                            }
                        }
                        Text(
                            if (en) "${focus.label} plan: train ${focus.muscleLabel.lowercase()} 2 times a week, then log your body measurements. Fat loss cannot be predicted for one body part; your overall target estimate is ${weeks?.let { "$it weeks" } ?: "set after choosing a target weight"}."
                            else "${focus.label} planı: ${focus.muscleLabel.lowercase()} bölgesini haftada 2 kez çalıştır, sonra vücut ölçülerini kaydet. Yağ kaybı tek bir bölge için tahmin edilemez; genel hedefin için tahmin ${weeks?.let { "$it hafta" } ?: "hedef kilo belirlediğinde oluşur"}.",
                            color = HedefitColors.TextSecondary,
                        )
                        Button(onClick = { onCreateRegionalProgram(focus.muscleKey, focus.label) }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "Create a ${focus.label} program" else "${focus.label} programı oluştur") }
                    }
                }
            }
            item { HedefitCard(Modifier.fillMaxWidth()) { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (en) "Body and target details" else "Vücut ve hedef detayları", style = MaterialTheme.typography.titleLarge)
                GoalDetailRow(if (en) "BMI" else "VKİ", bmi?.let { "%.1f".format(it) } ?: "—")
                if (bmiRange != null) GoalDetailRow(if (en) "BMI range" else "VKİ aralığı", bmiRange)
                GoalDetailRow(if (en) "Planned weekly change" else "Planlanan haftalık değişim", weeklyRate?.let { MeasurementUnits.formatWeight(it, unitSystem, 2) } ?: "—")
                GoalDetailRow(if (en) "Saved measurements" else "Kayıtlı ölçüm", "${data.measurements.size}")
                GoalDetailRow(if (en) "Goal type" else "Hedef türü", data.profile.goal.ifBlank { "—" })
                Text(if (en) "BMI is a general screening indicator; it is not a medical diagnosis." else "VKİ genel bir tarama göstergesidir; tıbbi tanı değildir.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            } } }
            item { HedefitCard(Modifier.fillMaxWidth()) { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (en) "This week" else "Bu hafta", style = MaterialTheme.typography.titleLarge)
                Text(if (en) "• Complete your planned workouts\n• Track your daily steps and water\n• Measure once a week under the same conditions" else "• Planlanan antrenmanlarını tamamla\n• Günlük adım ve su hedefini takip et\n• Haftada bir, aynı koşullarda ölçüm gir", color = HedefitColors.TextSecondary)
            } } }
        }
    }
    if (showCurrentEditor) WeightEditDialog(
        currentValue = current,
        editingTarget = false,
        en = en,
        unitSystem = unitSystem,
        onDismiss = { showCurrentEditor = false },
        onSave = { onSetCurrentWeight(it); showCurrentEditor = false },
    )
    if (showGoalEditor) GoalWeightDialog(
        currentTarget = target,
        en = en,
        unitSystem = unitSystem,
        onDismiss = { showGoalEditor = false },
        onSave = { onSetGoalWeight(it); showGoalEditor = false },
    )
}

private data class RegionalFocus(val id: String, val label: String, val muscleLabel: String, val muscleKey: String)
private fun regionalFocuses(en: Boolean) = if (en) listOf(
    RegionalFocus("inner_thigh", "Inner thigh", "adductors", "adductors"),
    RegionalFocus("abs", "Abs", "abdominals", "abdominals"),
    RegionalFocus("glutes", "Glutes", "glutes", "glutes"),
    RegionalFocus("back", "Back", "back", "back"),
) else listOf(
    RegionalFocus("inner_thigh", "İç bacak", "iç bacak kasları", "adductors"),
    RegionalFocus("abs", "Karın", "karın", "abdominals"),
    RegionalFocus("glutes", "Kalça", "kalça", "glutes"),
    RegionalFocus("back", "Sırt", "sırt", "back"),
)

@Composable
private fun WeightEditDialog(currentValue: Double?, editingTarget: Boolean, en: Boolean, unitSystem: String, onDismiss: () -> Unit, onSave: (Double) -> Unit) {
    var value by remember(currentValue, unitSystem) { mutableStateOf(currentValue?.let { "%.1f".format(MeasurementUnits.weightValue(it, unitSystem)).replace(',', '.') }.orEmpty()) }
    val parsed = value.replace(',', '.').toDoubleOrNull()
    val unit = MeasurementUnits.weightUnit(unitSystem)
    val title = if (editingTarget) (if (en) "Target weight" else "Hedef kilo") else if (en) "Current weight" else "Mevcut kilo"
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    if (editingTarget) (if (en) "Only your target weight changes. Your profile test answers stay untouched." else "Yalnız hedef kilon değişir. Profil testi cevapların aynı kalır.")
                    else if (en) "This is saved as today's weight measurement and updates your progress chart. Your profile test answers stay untouched."
                    else "Bugünün kilo ölçümü olarak kaydedilir ve ilerleme grafiğini günceller. Profil testi cevapların değişmez.",
                    color = HedefitColors.TextSecondary,
                )
                OutlinedTextField(
                    value = value,
                    onValueChange = { input -> value = input.filter { it.isDigit() || it == ',' || it == '.' }.take(6) },
                    label = { Text("$title ($unit)") },
                    suffix = { Text(unit) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                )
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } },
        confirmButton = {
            Button(
                enabled = parsed?.let { MeasurementUnits.weightToKg(it, unitSystem) in 30.0..300.0 } == true,
                onClick = { onSave(MeasurementUnits.weightToKg(parsed!!, unitSystem)) },
                colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime),
            ) { Text(if (en) "Save" else "Kaydet") }
        },
    )
}

@Composable
private fun JourneyValue(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String, modifier: Modifier, onClick: (() -> Unit)? = null) {
    HedefitCard(modifier, onClick = onClick) { Column(verticalArrangement = Arrangement.spacedBy(5.dp)) { Icon(icon, null, tint = HedefitColors.Lime); Text(label, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall); Text(value, style = MaterialTheme.typography.titleMedium) } }
}

@Composable
private fun GoalDetailRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = HedefitColors.TextSecondary)
        Text(value, style = MaterialTheme.typography.titleSmall)
    }
}

@Composable
private fun GoalWeightDialog(currentTarget: Double?, en: Boolean, unitSystem: String, onDismiss: () -> Unit, onSave: (Double) -> Unit) {
    WeightEditDialog(currentTarget, true, en, unitSystem, onDismiss, onSave)
}
