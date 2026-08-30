package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.hedefit.app.data.model.FoodSearchData
import com.hedefit.app.data.model.MealPlanItemData
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.theme.HedefitColors
import kotlinx.coroutines.delay
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.Locale

@Composable
fun WeeklyMealPlanner(
    items: List<MealPlanItemData>, results: List<FoodSearchData>, searching: Boolean, searchedQuery: String?, busy: Boolean, en: Boolean,
    onSearch: (String) -> Unit, onAdd: (FoodSearchData, Double, LocalDate, String) -> Unit,
    onToggle: (MealPlanItemData, Boolean) -> Unit, onRemove: (MealPlanItemData) -> Unit,
) {
    var weekStart by remember { mutableStateOf(LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))) }
    var selectedDate by remember { mutableStateOf(LocalDate.now()) }
    var showAdd by remember { mutableStateOf(false) }
    val weekDays = (0L..6L).map(weekStart::plusDays)
    val weekItems = items.filter { it.plannedDate in weekStart.toString()..weekStart.plusDays(6).toString() }
    val dayItems = weekItems.filter { it.plannedDate == selectedDate.toString() }
    val dayTotals = totals(dayItems)
    val weekTotals = totals(weekItems)

    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(if (en) "Weekly meal plan" else "Haftalık öğün planı", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(if (en) "Plan, check off, track nutrients" else "Planla, tamamla, besin değerlerini izle", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                }
                IconButton(onClick = { showAdd = true }, modifier = Modifier.background(HedefitColors.Lime, CircleShape)) { Icon(Icons.Default.Add, null, tint = HedefitColors.OnLime) }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { weekStart = weekStart.minusWeeks(1); selectedDate = weekStart }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) }
                Text("${weekStart.format(DateTimeFormatter.ofPattern("d MMM", locale(en)))} – ${weekStart.plusDays(6).format(DateTimeFormatter.ofPattern("d MMM", locale(en)))}", fontWeight = FontWeight.SemiBold)
                IconButton(onClick = { weekStart = weekStart.plusWeeks(1); selectedDate = weekStart }) { Icon(Icons.AutoMirrored.Filled.ArrowForward, null) }
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                items(weekDays) { day ->
                    val count = weekItems.count { it.plannedDate == day.toString() }
                    FilterChip(selected = selectedDate == day, onClick = { selectedDate = day }, label = {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(day.format(DateTimeFormatter.ofPattern("EEE", locale(en))).take(3))
                            Text(day.dayOfMonth.toString(), fontWeight = FontWeight.Bold)
                            if (count > 0) Text("$count", style = MaterialTheme.typography.labelSmall)
                        }
                    })
                }
            }
            NutrientSummary(dayTotals, if (en) "Day" else "Gün", en)
            if (dayItems.isEmpty()) {
                Text(if (en) "No meals planned for this day." else "Bu gün için henüz öğün planlanmadı.", color = HedefitColors.TextSecondary, modifier = Modifier.padding(vertical = 10.dp))
            } else {
                listOf("breakfast", "lunch", "dinner", "snack").forEach { meal ->
                    val mealItems = dayItems.filter { it.mealType == meal }
                    if (mealItems.isNotEmpty()) {
                        Text(mealPlanLabel(meal, en), color = HedefitColors.Lime, fontWeight = FontWeight.Bold)
                        mealItems.forEach { item ->
                            Row(Modifier.fillMaxWidth().background(HedefitColors.SurfaceHigh, RoundedCornerShape(13.dp)).padding(7.dp), verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(checked = item.completed, enabled = !busy, onCheckedChange = { onToggle(item, it) })
                                Column(Modifier.weight(1f)) {
                                    Text(item.name, fontWeight = FontWeight.SemiBold, textDecoration = if (item.completed) TextDecoration.LineThrough else null)
                                    Text("${item.grams.toInt()} g • ${item.calories} kcal • P ${item.protein.toInt()} • K ${item.carbs.toInt()} • Y ${item.fat.toInt()} g", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                                }
                                IconButton(enabled = !busy, onClick = { onRemove(item) }) { Icon(Icons.Default.DeleteOutline, null, tint = HedefitColors.Coral) }
                            }
                        }
                    }
                }
            }
            val completed = weekItems.count(MealPlanItemData::completed)
            Text(if (en) "Week: $completed/${weekItems.size} completed" else "Hafta: $completed/${weekItems.size} tamamlandı", fontWeight = FontWeight.SemiBold)
            NutrientSummary(weekTotals, if (en) "Week" else "Hafta", en)
        }
    }
    if (showAdd) MealPlanAddDialog(selectedDate, results, searching, searchedQuery, busy, en, onSearch, { showAdd = false }) { food, grams, meal ->
        onAdd(food, grams, selectedDate, meal); showAdd = false
    }
}

private data class PlanTotals(val kcal: Int, val protein: Double, val carbs: Double, val fat: Double, val fiber: Double, val sugar: Double, val sodium: Double, val potassium: Double, val calcium: Double, val iron: Double, val vitaminC: Double)
private fun totals(items: List<MealPlanItemData>) = PlanTotals(items.sumOf { it.calories }, items.sumOf { it.protein }, items.sumOf { it.carbs }, items.sumOf { it.fat }, items.sumOf { it.fiber }, items.sumOf { it.sugar }, items.sumOf { it.sodiumMg }, items.sumOf { it.potassiumMg }, items.sumOf { it.calciumMg }, items.sumOf { it.ironMg }, items.sumOf { it.vitaminCMg })

@Composable private fun NutrientSummary(value: PlanTotals, title: String, en: Boolean) {
    Column(Modifier.fillMaxWidth().background(HedefitColors.Lime.copy(alpha = .08f), RoundedCornerShape(13.dp)).padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text("$title • ${value.kcal} kcal", color = HedefitColors.Lime, fontWeight = FontWeight.Bold)
        Text("P ${value.protein.toInt()} g • ${if (en) "C" else "K"} ${value.carbs.toInt()} g • ${if (en) "F" else "Y"} ${value.fat.toInt()} g • ${if (en) "Fiber" else "Lif"} ${value.fiber.toInt()} g", style = MaterialTheme.typography.bodySmall)
        Text("${if (en) "Sugar" else "Şeker"} ${value.sugar.toInt()} g • Na ${value.sodium.toInt()} mg • K ${value.potassium.toInt()} mg • Ca ${value.calcium.toInt()} mg • Fe ${"%.1f".format(value.iron)} mg • C ${value.vitaminC.toInt()} mg", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable private fun MealPlanAddDialog(date: LocalDate, results: List<FoodSearchData>, searching: Boolean, searchedQuery: String?, busy: Boolean, en: Boolean, onSearch: (String) -> Unit, onDismiss: () -> Unit, onAdd: (FoodSearchData, Double, String) -> Unit) {
    var query by remember { mutableStateOf("") }; var selected by remember { mutableStateOf<FoodSearchData?>(null) }; var grams by remember { mutableStateOf("100") }; var meal by remember { mutableStateOf("breakfast") }
    LaunchedEffect(query) { if (query.trim().length >= 2) { delay(300); if (searchedQuery != query.trim()) onSearch(query.trim()) } }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (en) "Add planned meal" else "Planlanan öğün ekle") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text(date.format(DateTimeFormatter.ofPattern("d MMMM EEEE", locale(en))), color = HedefitColors.Lime)
            OutlinedTextField(query, { query = it.take(80); selected = null }, Modifier.fillMaxWidth(), leadingIcon = { Icon(Icons.Default.Search, null) }, trailingIcon = { if (searching) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) }, placeholder = { Text(if (en) "Search food" else "Besin ara") }, singleLine = true)
            if (query.trim().length >= 2) LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false)) {
                items(results.take(6)) { food -> Row(Modifier.fillMaxWidth().clickable { selected = food; query = food.name }.padding(9.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(food.name, fontWeight = FontWeight.SemiBold); Text("${food.calories} kcal / 100 g", style = MaterialTheme.typography.bodySmall, color = HedefitColors.TextSecondary) }; if (selected?.id == food.id) Text("✓", color = HedefitColors.Lime) } }
            }
            OutlinedTextField(grams, { grams = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(7) }, Modifier.fillMaxWidth(), label = { Text(if (en) "Amount (g)" else "Miktar (g)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(listOf("breakfast", "lunch", "dinner", "snack")) { value -> FilterChip(meal == value, { meal = value }, label = { Text(mealPlanLabel(value, en)) }) } }
        }
    }, confirmButton = { Button(enabled = !busy && selected != null && (grams.replace(',', '.').toDoubleOrNull() ?: 0.0) in 1.0..5000.0, onClick = { selected?.let { onAdd(it, grams.replace(',', '.').toDouble(), meal) } }) { Text(if (en) "Add to plan" else "Plana ekle") } }, dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } })
}

private fun mealPlanLabel(value: String, en: Boolean) = if (en) when (value) { "breakfast" -> "Breakfast"; "lunch" -> "Lunch"; "dinner" -> "Dinner"; else -> "Snack" } else when (value) { "breakfast" -> "Kahvaltı"; "lunch" -> "Öğle"; "dinner" -> "Akşam"; else -> "Atıştırmalık" }
private fun locale(en: Boolean) = if (en) Locale.ENGLISH else Locale("tr", "TR")
