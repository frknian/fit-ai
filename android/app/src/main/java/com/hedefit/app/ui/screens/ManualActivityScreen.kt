package com.hedefit.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.hedefit.app.data.model.ManualActivityInput
import com.hedefit.app.data.model.ManualActivityType
import com.hedefit.app.data.model.estimateManualActivityEnergy
import com.hedefit.app.data.model.manualActivityTypes
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.theme.HedefitColors

@Composable
fun ManualActivityScreen(
    language: String,
    weightKg: Double?,
    saving: Boolean,
    onBack: () -> Unit,
    onSave: (ManualActivityInput) -> Unit,
) {
    val en = language == "en"
    var selectedKey by rememberSaveable { mutableStateOf<String?>(null) }
    val selected = manualActivityTypes.firstOrNull { it.key == selectedKey }
    BackHandler { if (selected != null) selectedKey = null else onBack() }
    Column(Modifier.fillMaxSize().background(HedefitColors.Background).systemBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { if (selected != null) selectedKey = null else onBack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, if (en) "Back" else "Geri") }
            Text("HEDEFIT", color = HedefitColors.Lime, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleLarge)
        }
        if (selected == null) ActivityPicker(en, onSelect = { selectedKey = it.key })
        else ActivityForm(selected, en, weightKg, saving, onSave)
    }
}

@Composable
private fun ActivityPicker(en: Boolean, onSelect: (ManualActivityType) -> Unit) {
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Text(if (en) "SELECT ACTIVITY TYPE" else "AKTİVİTE TÜRÜNÜ SEÇ", color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge)
        Text(if (en) "What are you tracking today?" else "Bugün hangi sporu kaydediyorsun?", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(18.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(bottom = 28.dp)) {
            items(manualActivityTypes.chunked(3)) { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { activity ->
                        HedefitCard(
                            modifier = Modifier.weight(1f).height(108.dp),
                            onClick = { onSelect(activity) },
                            contentPadding = PaddingValues(8.dp),
                        ) {
                            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                Text(activity.emoji, style = MaterialTheme.typography.headlineMedium)
                                Spacer(Modifier.height(6.dp))
                                Text(if (en) activity.titleEn else activity.titleTr, maxLines = 2, style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun ActivityForm(activity: ManualActivityType, en: Boolean, weightKg: Double?, saving: Boolean, onSave: (ManualActivityInput) -> Unit) {
    var duration by rememberSaveable { mutableStateOf("60") }
    var distance by rememberSaveable { mutableStateOf("") }
    var incline by rememberSaveable { mutableStateOf("0") }
    var variantKey by rememberSaveable(activity.key) { mutableStateOf(activity.variants.firstOrNull()?.key) }
    var notes by rememberSaveable { mutableStateOf("") }
    val minutes = duration.toIntOrNull()?.coerceIn(1, 600) ?: 0
    val usesDistance = activity.key in setOf("walking", "running", "cycling", "swimming", "hiking", "rowing")
    val usesIncline = activity.key in setOf("walking", "running", "hiking")
    val enteredDistanceKm = distance.replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 }?.let { if (activity.key == "swimming") it / 1_000.0 else it }
    val input = ManualActivityInput(activity.key, minutes.coerceAtLeast(1), enteredDistanceKm, incline.replace(',', '.').toDoubleOrNull()?.coerceIn(0.0, 40.0) ?: 0.0, variantKey, notes.trim())
    val estimate = if (minutes > 0) estimateManualActivityEnergy(activity, input, weightKg) else null
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(78.dp).background(HedefitColors.SurfaceHigh, CircleShape), contentAlignment = Alignment.Center) { Text(activity.emoji, style = MaterialTheme.typography.headlineLarge) }
                Spacer(Modifier.height(8.dp)); Text(if (en) activity.titleEn else activity.titleTr, style = MaterialTheme.typography.headlineMedium)
            }
        }
        item { HedefitCard { Column {
            Text(if (en) "DURATION (MIN)" else "SÜRE (DK)", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelLarge)
            OutlinedTextField(duration, { duration = it.filter(Char::isDigit).take(3) }, modifier = Modifier.fillMaxWidth(), trailingIcon = { Icon(Icons.Default.Timer, null) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
        } } }
        if (usesDistance) item { HedefitCard { Column {
            Text(if (activity.key == "swimming") (if (en) "DISTANCE (METERS)" else "MESAFE (METRE)") else if (en) "DISTANCE (KM)" else "MESAFE (KM)", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelLarge)
            OutlinedTextField(distance, { value -> distance = value.filter { it.isDigit() || it == ',' || it == '.' }.take(7) }, modifier = Modifier.fillMaxWidth(), placeholder = { Text(if (en) "Optional, improves accuracy" else "İsteğe bağlı, doğruluğu artırır") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true)
        } } }
        if (usesIncline) item { HedefitCard { Column {
            Text(if (en) "AVERAGE INCLINE (%)" else "ORTALAMA EĞİM (%)", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelLarge)
            OutlinedTextField(incline, { value -> incline = value.filter { it.isDigit() || it == ',' || it == '.' }.take(4) }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true)
        } } }
        if (activity.variants.isNotEmpty()) item { HedefitCard { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (en) "ACTIVITY TYPE" else "AKTİVİTE DETAYI", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelLarge)
            activity.variants.forEach { variant -> FilterChip(selected = variantKey == variant.key, onClick = { variantKey = variant.key }, label = { Text(if (en) variant.titleEn else variant.titleTr) }) }
        } } }
        item { HedefitCard { Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(48.dp).background(HedefitColors.Warning.copy(alpha = .15f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.LocalFireDepartment, null, tint = HedefitColors.Warning) }
            Spacer(Modifier.width(12.dp)); Column { Text(if (en) "ESTIMATED ACTIVE BURN" else "TAHMİNİ AKTİF YAKIM", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelLarge); Text("${estimate?.activeCalories ?: 0} kcal", style = MaterialTheme.typography.headlineSmall); Text("MET ${"%.1f".format(estimate?.met ?: 0.0)} • ${when (estimate?.confidence) { "high" -> if (en) "High confidence" else "Yüksek güven"; "medium" -> if (en) "Medium confidence" else "Orta güven"; else -> if (en) "Low confidence" else "Düşük güven" }}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
        } } }
        item { OutlinedTextField(notes, { notes = it.take(500) }, modifier = Modifier.fillMaxWidth(), label = { Text(if (en) "Session notes (optional)" else "Seans notu (isteğe bağlı)") }, minLines = 3, supportingText = { Text("${notes.length}/500") }) }
        item { PrimaryButton(if (saving) (if (en) "Saving…" else "Kaydediliyor…") else if (en) "Save activity" else "Aktiviteyi kaydet", onClick = { if (!saving && minutes > 0) onSave(input) }, enabled = !saving && minutes > 0, icon = Icons.Default.CheckCircle) }
        item { Text(if (en) "Active calories use the 2024 Compendium MET model. Distance, pace, incline and sport type improve the estimate; resting energy is excluded." else "Aktif kalori 2024 Compendium MET modeliyle hesaplanır. Mesafe, tempo, eğim ve spor detayı tahmini iyileştirir; dinlenme enerjisi dahil edilmez.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
    }
}
