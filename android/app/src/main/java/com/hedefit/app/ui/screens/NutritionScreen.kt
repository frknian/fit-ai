package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.EggAlt
import androidx.compose.material.icons.filled.LocalDining
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.RamenDining
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.MacroBar
import com.hedefit.app.ui.components.OutlineAction
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.components.ProgressRing
import com.hedefit.app.ui.components.ScreenContainer
import com.hedefit.app.ui.components.SectionTitle
import com.hedefit.app.ui.theme.HedefitColors
import com.hedefit.app.data.model.DashboardData
import com.hedefit.app.data.model.NutritionGoalData
import com.hedefit.app.data.model.NutritionLogData
import com.hedefit.app.data.model.FoodSearchData
import com.hedefit.app.data.model.FavoriteMealData
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

private data class MealUi(val name: String, val time: String, val calories: Int, val detail: String, val icon: ImageVector, val tint: Color)

@Composable
fun NutritionScreen(
    padding: PaddingValues,
    expanded: Boolean,
    data: DashboardData?,
    busy: Boolean,
    foodSearchBusy: Boolean,
    foodResults: List<FoodSearchData>,
    onAddWithAi: (food: String, grams: Double, meal: String) -> Unit,
    onSearchFoods: (String) -> Unit,
    onAddCatalogFood: (FoodSearchData, Double, String) -> Unit,
    onAddFavorite: (NutritionLogData) -> Unit,
    onRemoveFavorite: (String) -> Unit,
    onRepeatFavorite: (FavoriteMealData) -> Unit,
    onAddWater: (Int) -> Unit,
    language: String = "tr",
    openMealComposer: Boolean = false,
    onMealComposerOpened: () -> Unit = {},
    selectedDate: LocalDate = LocalDate.now(),
    selectedLogs: List<NutritionLogData> = data?.nutritionLogs.orEmpty(),
    historyLogs: List<NutritionLogData> = emptyList(),
    dateLoading: Boolean = false,
    onSelectDate: (LocalDate) -> Unit = {},
    onLoadHistory: () -> Unit = {},
) {
    val en = language == "en"
    var showFoodSearch by remember { mutableStateOf(false) }
    var showCalendar by remember { mutableStateOf(false) }
    LaunchedEffect(openMealComposer) {
        if (openMealComposer) {
            showFoodSearch = true
            onMealComposerOpened()
        }
    }
    val logs = selectedLogs
    val canLog = selectedDate == LocalDate.now()
    LaunchedEffect(Unit) { onLoadHistory() }

    ScreenContainer(padding) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 16.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(15.dp),
        ) {
            item { NutritionHeader(en) { showCalendar = true } }
            item { DateSelector(selectedDate, en, onSelectDate) }
            if (!canLog) item { HistoricalDayNotice(selectedDate, en) }
            if (expanded) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(.85f), verticalArrangement = Arrangement.spacedBy(15.dp)) {
                            CalorieCard(logs, data?.nutritionGoal ?: NutritionGoalData(), if (canLog) data?.activeCalories ?: 0 else 0, en)
                            MealEntryCard(en, busy, canLog, { showFoodSearch = true }, onAddWithAi)
                            WaterQuickAdd(data?.waterMl ?: 0, onAddWater, en, canLog)
                            MicroNutrientCard(logs, en)
                            NutritionTip(en)
                        }
                        Column(Modifier.weight(1.15f), verticalArrangement = Arrangement.spacedBy(15.dp)) {
                            SectionTitle(if (en) "Meals" else "Öğünler", if (en) "View all" else "Tümünü Gör")
                            FavoriteMeals(data?.favoriteMeals.orEmpty(), onRepeatFavorite, onRemoveFavorite, en)
                            MealList(logs, onAddFavorite, en)
                        }
                    }
                }
            } else {
                item { CalorieCard(logs, data?.nutritionGoal ?: NutritionGoalData(), if (canLog) data?.activeCalories ?: 0 else 0, en) }
                item { MealEntryCard(en, busy, canLog, { showFoodSearch = true }, onAddWithAi) }
                item { WaterQuickAdd(data?.waterMl ?: 0, onAddWater, en, canLog) }
                item { MicroNutrientCard(logs, en) }
                if (!data?.favoriteMeals.isNullOrEmpty()) item { FavoriteMeals(data?.favoriteMeals.orEmpty(), onRepeatFavorite, onRemoveFavorite, en) }
                item { SectionTitle(if (en) "Meals" else "Öğünler") }
                item { MealList(logs, onAddFavorite, en) }
                item { NutritionTip(en) }
            }
        }
    }

    if (showFoodSearch) FoodSearchDialog(foodResults, foodSearchBusy, busy, en, onDismiss = { showFoodSearch = false }, onSearch = onSearchFoods, onAdd = { item, amount, type -> onAddCatalogFood(item, amount, type); showFoodSearch = false })
    if (showCalendar) NutritionCalendarDialog(selectedDate, (historyLogs + logs).distinctBy { it.id }, en, dateLoading, onDismiss = { showCalendar = false }, onSelect = { onSelectDate(it); showCalendar = false })
}

@Composable
private fun MealEntryCard(en: Boolean, busy: Boolean, enabled: Boolean, onOpenCatalog: () -> Unit, onAdd: (String, Double, String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("100") }
    var unit by remember { mutableStateOf("g") }
    var unitWeight by remember { mutableStateOf("100") }
    var meal by remember { mutableStateOf("Atıştırmalık") }
    var showRecipe by remember { mutableStateOf(false) }
    val numericAmount = amount.replace(',', '.').toDoubleOrNull()
    val grams = when (unit) { "porsiyon", "adet" -> numericAmount?.times(unitWeight.replace(',', '.').toDoubleOrNull() ?: 0.0); else -> numericAmount }
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Restaurant, null, tint = HedefitColors.Lime); Spacer(Modifier.width(8.dp))
                Text(if (en) "Add a meal" else "Öğün ekle", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.weight(1f)); TextButton(enabled = enabled, onClick = { showRecipe = true }) { Text(if (en) "Recipe" else "Tarif") }; TextButton(enabled = enabled, onClick = onOpenCatalog) { Text(if (en) "Catalog" else "Katalog") }
            }
            OutlinedTextField(name, { name = it.take(80) }, modifier = Modifier.fillMaxWidth(), placeholder = { Text(if (en) "Meal name" else "Öğün adı, örn. tavuklu pilav") }, singleLine = true, colors = nutritionFieldColors())
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(listOf("g", "ml", "porsiyon", "adet")) { value -> FilterChip(unit == value, { unit = value; amount = if (value == "adet" || value == "porsiyon") "1" else "100" }, label = { Text(if (en && value == "porsiyon") "portion" else if (en && value == "adet") "piece" else value) }) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(7) }, Modifier.weight(1f), label = { Text(if (en) "Amount" else "Miktar") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), colors = nutritionFieldColors())
                if (unit == "porsiyon" || unit == "adet") OutlinedTextField(unitWeight, { unitWeight = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(7) }, Modifier.weight(1f), label = { Text(if (en) "g each" else "birimi (g)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), colors = nutritionFieldColors())
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(listOf("Kahvaltı", "Öğle yemeği", "Akşam yemeği", "Atıştırmalık")) { type -> FilterChip(meal == type, { meal = type }, label = { Text(mealLabel(type, en)) }) } }
            Button(enabled = enabled && !busy && name.trim().length >= 2 && grams != null && grams > 0, onClick = { grams?.let { onAdd(name.trim(), it, meal); name = "" } }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (!enabled) (if (en) "Past day" else "Geçmiş gün") else if (busy) (if (en) "Adding…" else "Ekleniyor…") else if (en) "Add meal" else "Öğünü ekle") }
        }
    }
    if (showRecipe) RecipeComposerDialog(en, busy, meal, onDismiss = { showRecipe = false }) { recipe, grams ->
        showRecipe = false
        onAdd(recipe, grams, meal)
    }
}

@Composable
private fun RecipeComposerDialog(en: Boolean, busy: Boolean, meal: String, onDismiss: () -> Unit, onAnalyze: (String, Double) -> Unit) {
    var title by remember { mutableStateOf("") }
    var ingredients by remember { mutableStateOf("") }
    var grams by remember { mutableStateOf("") }
    val totalGrams = grams.replace(',', '.').toDoubleOrNull()
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (en) "Add recipe" else "Tarif ekle") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(if (en) "Write the ingredients and amounts. Hedefit estimates the recipe's calories, macros, and micronutrients for the total portion." else "Malzemeleri ve miktarlarını yaz. Hedefit, tarifin toplam porsiyonu için kalori, makro ve mikro besin tahmini çıkarır.", color = HedefitColors.TextSecondary)
                OutlinedTextField(title, { title = it.take(80) }, label = { Text(if (en) "Recipe name" else "Tarif adı") }, placeholder = { Text(if (en) "e.g. chicken pasta" else "örn. tavuklu makarna") }, singleLine = true)
                OutlinedTextField(ingredients, { ingredients = it.take(850) }, label = { Text(if (en) "Ingredients and amounts" else "Malzemeler ve miktarları") }, placeholder = { Text(if (en) "150 g chicken, 80 g pasta, 1 tsp olive oil" else "150 g tavuk, 80 g makarna, 1 çay kaşığı zeytinyağı") }, minLines = 4, maxLines = 6)
                OutlinedTextField(grams, { grams = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(5) }, label = { Text(if (en) "Total portion (g)" else "Toplam porsiyon (g)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                Text(if (en) "This is an AI estimate; brands, recipes, and cooking oil can change the values." else "Bu bir yapay zekâ tahminidir; marka, tarif ve pişirme yağı değerleri değiştirebilir.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } },
        confirmButton = {
            Button(
                enabled = !busy && title.trim().length >= 2 && ingredients.trim().length >= 4 && totalGrams != null && totalGrams in 1.0..5000.0,
                onClick = { onAnalyze("${title.trim()}: ${ingredients.trim()}", totalGrams!!) },
                colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime),
            ) { Text(if (busy) (if (en) "Analyzing…" else "Analiz ediliyor…") else if (en) "Analyze recipe" else "Tarifi analiz et") }
        },
    )
}

@Composable
private fun NutritionHeader(en: Boolean, onOpenCalendar: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(if (en) "Nutrition" else "Beslenme", style = MaterialTheme.typography.headlineMedium)
            Text(if (en) "Calories and macro tracking" else "Kalori ve makro takibi", color = HedefitColors.TextSecondary)
        }
        IconButton(onClick = onOpenCalendar) { Icon(Icons.Default.CalendarMonth, if (en) "Open calorie calendar" else "Kalori takvimini aç", tint = HedefitColors.Lime) }
    }
}

@Composable
private fun DateSelector(selectedDate: LocalDate, en: Boolean, onSelect: (LocalDate) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onSelect(selectedDate.minusDays(1)) }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, if (en) "Previous day" else "Önceki gün") }
        Box(Modifier.background(HedefitColors.SurfaceHigh, RoundedCornerShape(22.dp)).padding(horizontal = 24.dp, vertical = 10.dp)) {
            Text(if (selectedDate == LocalDate.now()) (if (en) "Today" else "Bugün") else selectedDate.format(DateTimeFormatter.ofPattern(if (en) "d MMM yyyy" else "d MMMM yyyy", Locale(if (en) "en" else "tr"))), fontWeight = FontWeight.SemiBold)
        }
        IconButton(enabled = selectedDate < LocalDate.now(), onClick = { onSelect(selectedDate.plusDays(1)) }) { Icon(Icons.AutoMirrored.Filled.ArrowForward, if (en) "Next day" else "Sonraki gün") }
    }
}

@Composable
private fun CalorieCard(logs: List<NutritionLogData>, goal: NutritionGoalData, activeCalories: Int, en: Boolean) {
    val consumed = logs.sumOf { it.calories }
    val protein = logs.sumOf { it.protein }
    val carbs = logs.sumOf { it.carbs }
    val fat = logs.sumOf { it.fat }
    val activityBonus = activeCalories.coerceIn(0, 600)
    val target = goal.calories + activityBonus
    HedefitCard(Modifier.fillMaxWidth()) {
        BoxWithConstraints {
            val compact = maxWidth < 320.dp
            val ringSize = if (maxWidth < 500.dp) 132.dp else 160.dp
            val ring: @Composable () -> Unit = {
                ProgressRing(consumed / target.toFloat(), Modifier.size(ringSize), 12.dp) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.LocalFireDepartment, null, tint = HedefitColors.Lime)
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text("$consumed", style = MaterialTheme.typography.headlineMedium)
                            Text(" / $target", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodyMedium)
                        }
                        Text(if (en) "${target - consumed} kcal left" else "${target - consumed} kcal kaldı", color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge)
                        if (activityBonus > 0) Text(if (en) "+$activityBonus activity" else "+$activityBonus aktivite", color = HedefitColors.Water, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            val macros: @Composable () -> Unit = {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
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
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    ring()
                    Box(Modifier.weight(1f)) { macros() }
                }
            }
        }
    }
}

@Composable
private fun MealList(logs: List<NutritionLogData>, onFavorite: (NutritionLogData) -> Unit, en: Boolean) {
    val meals = logs.map { it.toMealUi() }
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (meals.isEmpty()) Text(if (en) "No meals logged today yet." else "Bugün henüz öğün kaydı yok.", color = HedefitColors.TextSecondary, modifier = Modifier.padding(vertical = 18.dp))
            meals.forEachIndexed { index, meal ->
                val log = logs[index]
                Row(
                    Modifier.fillMaxWidth().clickable { }.padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(48.dp).background(meal.tint.copy(alpha = .14f), RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) {
                        Icon(meal.icon, null, tint = meal.tint)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(meal.name, style = MaterialTheme.typography.titleMedium)
                        Text("${meal.time} • ${meal.detail}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                    }
                    Text("${meal.calories} kcal", color = HedefitColors.Lime, fontWeight = FontWeight.Bold)
                    IconButton(onClick = { onFavorite(log) }) { Icon(Icons.Default.Favorite, if (en) "Add to favourites" else "Favoriye ekle", tint = HedefitColors.Coral, modifier = Modifier.size(19.dp)) }
                }
                if (index < meals.lastIndex) Box(Modifier.fillMaxWidth().height(.6.dp).background(HedefitColors.Divider))
            }
        }
    }
}

private fun NutritionLogData.toMealUi(): MealUi {
    val (icon, tint) = when (meal) {
        "Kahvaltı" -> Icons.Default.EggAlt to HedefitColors.Warning
        "Öğle yemeği" -> Icons.Default.RamenDining to HedefitColors.Lime
        "Akşam yemeği" -> Icons.Default.LocalDining to HedefitColors.Coral
        else -> Icons.Default.Restaurant to HedefitColors.Sleep
    }
    return MealUi(meal, "Bugün", calories, "${name}${grams?.let { " • ${it.toInt()} g" }.orEmpty()}", icon, tint)
}

private fun mealLabel(meal: String, en: Boolean) = if (!en) meal else when (meal) {
    "Kahvaltı" -> "Breakfast"
    "Öğle yemeği" -> "Lunch"
    "Akşam yemeği" -> "Dinner"
    else -> "Snack"
}

@Composable
private fun nutritionFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = HedefitColors.Lime,
    unfocusedBorderColor = HedefitColors.Divider,
    focusedContainerColor = HedefitColors.Surface,
    unfocusedContainerColor = HedefitColors.Surface,
)

@Composable
private fun WaterQuickAdd(currentMl: Int, onAdd: (Int) -> Unit, en: Boolean, enabled: Boolean) {
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.WaterDrop, null, tint = HedefitColors.Water)
                Spacer(Modifier.width(9.dp))
                Column(Modifier.weight(1f)) { Text(if (en) "Water" else "Su", style = MaterialTheme.typography.titleMedium); Text("${currentMl} / 2500 ml", color = HedefitColors.TextSecondary) }
                Text("%${(currentMl / 25).coerceAtMost(100)}", color = HedefitColors.Water, fontWeight = FontWeight.Bold)
            }
            Box(Modifier.fillMaxWidth().height(7.dp).background(HedefitColors.Divider, CircleShape)) { Box(Modifier.fillMaxWidth((currentMl / 2500f).coerceIn(0f, 1f)).height(7.dp).background(HedefitColors.Water, CircleShape)) }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                listOf(200, 300, 500).forEach { amount -> TextButton(enabled = enabled, onClick = { onAdd(amount) }, modifier = Modifier.weight(1f)) { Text("+$amount ml", color = HedefitColors.Water) } }
            }
        }
    }
}

@Composable
private fun HistoricalDayNotice(date: LocalDate, en: Boolean) = HedefitCard(Modifier.fillMaxWidth()) {
    Text(
        if (en) "Viewing ${date.format(DateTimeFormatter.ofPattern("d MMMM", Locale.ENGLISH))}. Past days are read-only."
        else "${date.format(DateTimeFormatter.ofPattern("d MMMM", Locale("tr")))} kaydını görüntülüyorsun. Geçmiş günler sadece okunabilir.",
        color = HedefitColors.TextSecondary,
    )
}

@Composable
private fun NutritionCalendarDialog(
    selectedDate: LocalDate,
    history: List<NutritionLogData>,
    en: Boolean,
    loading: Boolean,
    onDismiss: () -> Unit,
    onSelect: (LocalDate) -> Unit,
) {
    var month by remember { mutableStateOf(YearMonth.from(selectedDate)) }
    val calories = history.groupBy { runCatching { LocalDate.parse(it.date.take(10)) }.getOrNull() }
        .filterKeys { it != null }.mapKeys { it.key!! }.mapValues { (_, logs) -> logs.sumOf { it.calories } }
    val firstOffset = (month.atDay(1).dayOfWeek.value - DayOfWeek.MONDAY.value + 7) % 7
    val cells = List(firstOffset) { null } + (1..month.lengthOfMonth()).map { month.atDay(it) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (en) "Calorie calendar" else "Kalori takvimi") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { month = month.minusMonths(1) }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, if (en) "Previous month" else "Önceki ay") }
                    Text(month.atDay(1).format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale(if (en) "en" else "tr"))), modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold)
                    IconButton(enabled = month < YearMonth.now(), onClick = { month = month.plusMonths(1) }) { Icon(Icons.AutoMirrored.Filled.ArrowForward, if (en) "Next month" else "Sonraki ay") }
                }
                Row(Modifier.fillMaxWidth()) {
                    (if (en) listOf("M", "T", "W", "T", "F", "S", "S") else listOf("P", "S", "Ç", "P", "C", "C", "P")).forEach { day -> Text(day, Modifier.weight(1f), color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelSmall) }
                }
                cells.chunked(7).forEach { week ->
                    Row(Modifier.fillMaxWidth()) {
                        week.forEach { date ->
                            if (date == null) Box(Modifier.weight(1f).height(48.dp))
                            else {
                                val total = calories[date]
                                val active = date == selectedDate
                                Column(
                                    Modifier.weight(1f).height(48.dp).padding(2.dp)
                                        .background(if (active) HedefitColors.Lime else HedefitColors.SurfaceHigh, RoundedCornerShape(10.dp))
                                        .clickable(enabled = date <= LocalDate.now()) { onSelect(date) },
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    Text(date.dayOfMonth.toString(), color = if (active) HedefitColors.OnLime else HedefitColors.TextPrimary, style = MaterialTheme.typography.labelMedium)
                                    if (total != null) Text(if (total >= 1_000) "${total / 1000}k" else total.toString(), color = if (active) HedefitColors.OnLime else HedefitColors.Lime, style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                        repeat(7 - week.size) { Box(Modifier.weight(1f).height(48.dp)) }
                    }
                }
                if (loading) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally), color = HedefitColors.Lime)
                Text(if (en) "Each value is that day's total calories." else "Her değer o günün toplam kalorisini gösterir.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(if (en) "Close" else "Kapat") } },
    )
}

@Composable
private fun MicroNutrientCard(logs: List<NutritionLogData>, en: Boolean) {
    val fiber = logs.sumOf { it.fiber }
    val sugar = logs.sumOf { it.sugar }
    val sodium = logs.sumOf { it.sodiumMg }
    val potassium = logs.sumOf { it.potassiumMg }
    val calcium = logs.sumOf { it.calciumMg }
    val iron = logs.sumOf { it.ironMg }
    val vitaminC = logs.sumOf { it.vitaminCMg }
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionTitle(if (en) "Fibre and micronutrients" else "Lif ve mikro besinler")
            MacroBar(if (en) "Fibre" else "Lif", "${fiber.toInt()} / 30 g", (fiber / 30).toFloat())
            MacroBar(if (en) "Sugar" else "Şeker", "${sugar.toInt()} g", (sugar / 50).toFloat())
            MacroBar(if (en) "Sodium" else "Sodyum", "${sodium.toInt()} / 2300 mg", (sodium / 2300).toFloat())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MicroValue(if (en) "Potassium" else "Potasyum", "${potassium.toInt()} mg", Modifier.weight(1f))
                MicroValue(if (en) "Calcium" else "Kalsiyum", "${calcium.toInt()} mg", Modifier.weight(1f))
                MicroValue(if (en) "Iron" else "Demir", "%.1f mg".format(iron), Modifier.weight(1f))
            }
            MicroValue(if (en) "Vitamin C" else "C Vitamini", "${vitaminC.toInt()} / 90 mg", Modifier.fillMaxWidth())
        }
    }
}

@Composable private fun MicroValue(label: String, value: String, modifier: Modifier) {
    Column(modifier.background(HedefitColors.SurfaceHigh, RoundedCornerShape(11.dp)).padding(9.dp)) { Text(label, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall); Text(value, style = MaterialTheme.typography.labelLarge) }
}

@Composable
private fun FavoriteMeals(favorites: List<FavoriteMealData>, onRepeat: (FavoriteMealData) -> Unit, onRemove: (String) -> Unit, en: Boolean) {
    if (favorites.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionTitle(if (en) "Favourite meals" else "Favori öğünler", if (en) "Add again" else "Tekrar ekle")
        favorites.take(4).forEach { favorite ->
            HedefitCard(Modifier.fillMaxWidth(), onClick = { onRepeat(favorite) }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Favorite, null, tint = HedefitColors.Coral)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) { Text(favorite.name, style = MaterialTheme.typography.titleMedium); Text("${favorite.grams.toInt()} g • ${favorite.calories} kcal", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                    TextButton(onClick = { onRemove(favorite.id) }) { Text(if (en) "Remove" else "Kaldır", color = HedefitColors.TextSecondary) }
                }
            }
        }
    }
}

@Composable
private fun FoodSearchDialog(results: List<FoodSearchData>, searching: Boolean, adding: Boolean, en: Boolean, onDismiss: () -> Unit, onSearch: (String) -> Unit, onAdd: (FoodSearchData, Double, String) -> Unit) {
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<FoodSearchData?>(null) }
    var grams by remember { mutableStateOf("100") }
    var meal by remember { mutableStateOf("Atıştırmalık") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (en) "Verified food catalogue" else "Doğrulanmış besin kataloğu") },
        text = { Column(Modifier.fillMaxWidth().heightIn(max = 560.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(query, { query = it }, modifier = Modifier.fillMaxWidth(), label = { Text(if (en) "Food or brand" else "Besin veya marka") }, trailingIcon = { IconButton(onClick = { onSearch(query) }) { Icon(Icons.Default.Search, if (en) "Search" else "Ara") } }, singleLine = true)
            if (searching) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally), color = HedefitColors.Lime)
            selected?.let { food ->
                HedefitCard {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row { Text(food.name, Modifier.weight(1f), fontWeight = FontWeight.Bold); if (food.verified) Icon(Icons.Default.Verified, "Doğrulanmış", tint = HedefitColors.Lime) }
                        Text("${food.calories} kcal • P ${food.protein.toInt()} • K ${food.carbs.toInt()} • Y ${food.fat.toInt()} • Lif ${food.fiber.toInt()}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        OutlinedTextField(grams, { grams = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text(if (en) "Grams" else "Gram") }, singleLine = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { listOf("Kahvaltı", "Öğle yemeği", "Akşam yemeği", "Atıştırmalık").forEach { type -> FilterChip(meal == type, { meal = type }, label = { Text(mealLabel(type, en), style = MaterialTheme.typography.labelMedium) }) } }
                        Button(enabled = !adding, onClick = { grams.toDoubleOrNull()?.let { onAdd(food, it, meal) } }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "Add to meal" else "Öğüne ekle") }
                    }
                }
            } ?: LazyColumn(Modifier.weight(1f, fill = false)) {
                items(results.size) { index ->
                    val food = results[index]
                    Row(Modifier.fillMaxWidth().clickable { selected = food; grams = food.servingGrams.toInt().toString() }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { Row(verticalAlignment = Alignment.CenterVertically) { Text(food.name, fontWeight = FontWeight.SemiBold); if (food.verified) { Spacer(Modifier.width(5.dp)); Icon(Icons.Default.Verified, null, tint = HedefitColors.Lime, modifier = Modifier.size(16.dp)) } }; Text("${food.source} • ${food.calories} kcal/100g", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = HedefitColors.TextSecondary)
                    }
                }
            }
        } },
        confirmButton = {}, dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Close" else "Kapat") } },
    )
}

@Composable
private fun NutritionTip(en: Boolean) {
    HedefitCard(Modifier.fillMaxWidth()) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.size(42.dp).background(HedefitColors.Lime.copy(alpha = .16f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.AutoAwesome, null, tint = HedefitColors.Lime)
            }
            Column(Modifier.weight(1f)) {
                Text(if (en) "Fit Coach tip" else "Fit Koç önerisi", style = MaterialTheme.typography.titleMedium)
                Text(if (en) "To reach your protein target, choose yoghurt, eggs, or lean meat in your next meal." else "Protein hedefini tamamlamak için sonraki öğününde yoğurt, yumurta veya yağsız et tercih edebilirsin.", color = HedefitColors.TextSecondary)
            }
        }
    }
}
