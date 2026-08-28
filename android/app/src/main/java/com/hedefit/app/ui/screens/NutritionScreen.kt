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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.EggAlt
import androidx.compose.material.icons.filled.LocalDining
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.RamenDining
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.SoupKitchen
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapHoriz
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
import androidx.compose.ui.text.input.ImeAction
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
import com.hedefit.app.ui.validation.validateFoodGrams
import com.hedefit.app.data.model.DashboardData
import com.hedefit.app.data.model.NutritionGoalData
import com.hedefit.app.data.model.NutritionLogData
import com.hedefit.app.data.model.FoodSearchData
import com.hedefit.app.data.model.FavoriteMealData
import kotlinx.coroutines.delay
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun NutritionScreen(
    padding: PaddingValues,
    expanded: Boolean,
    data: DashboardData?,
    busy: Boolean,
    foodSearchBusy: Boolean,
    foodResults: List<FoodSearchData>,
    foodSearchQuery: String?,
    onAddWithAi: (food: String, grams: Double, meal: String) -> Unit,
    onSearchFoods: (String) -> Unit,
    onAddCatalogFood: (FoodSearchData, Double, String) -> Unit,
    onAddFavorite: (NutritionLogData) -> Unit,
    onRemoveNutritionLog: (NutritionLogData) -> Unit,
    onUpdateNutritionLog: (NutritionLogData, Double, String) -> Unit,
    onRemoveFavorite: (String) -> Unit,
    onRepeatFavorite: (FavoriteMealData) -> Unit,
    onAddWater: (Int) -> Unit,
    waterGoalMl: Int,
    onWaterGoalChange: (Int) -> Unit,
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
            item { CalorieCard(logs, data?.nutritionGoal ?: NutritionGoalData(), if (canLog) data?.activeCalories ?: 0 else 0, en) }
            item { MicroNutrientCard(logs, en) }
            item {
                MealEntryCard(
                    en = en,
                    busy = busy,
                    enabled = canLog,
                    results = foodResults,
                    searching = foodSearchBusy,
                    searchedQuery = foodSearchQuery,
                    onSearch = onSearchFoods,
                    onOpenCatalog = { showFoodSearch = true },
                    onAddWithAi = onAddWithAi,
                    onAddCatalog = onAddCatalogFood,
                    recentLogs = logs,
                    favorites = data?.favoriteMeals.orEmpty(),
                )
            }
            item { SectionTitle(if (en) "Meals" else "Öğünler") }
            item { MealList(logs, onAddFavorite, onRemoveNutritionLog, onUpdateNutritionLog, busy, en) }
            if (!data?.favoriteMeals.isNullOrEmpty()) item { FavoriteMeals(data?.favoriteMeals.orEmpty(), onRepeatFavorite, onRemoveFavorite, en) }
            item { NutritionTip(en) }
            item { WaterQuickAdd(data?.waterMl ?: 0, waterGoalMl, onAddWater, onWaterGoalChange, en, canLog) }
        }
    }

    if (showFoodSearch) FoodSearchDialog(foodResults, foodSearchBusy, foodSearchQuery, busy, en, onDismiss = { showFoodSearch = false }, onSearch = onSearchFoods, onAdd = { item, amount, type -> onAddCatalogFood(item, amount, type); showFoodSearch = false })
    if (showCalendar) NutritionCalendarDialog(selectedDate, (historyLogs + logs).distinctBy { it.id }, en, dateLoading, onDismiss = { showCalendar = false }, onSelect = { onSelectDate(it); showCalendar = false })
}

@Composable
private fun MealEntryCard(
    en: Boolean,
    busy: Boolean,
    enabled: Boolean,
    results: List<FoodSearchData>,
    searching: Boolean,
    searchedQuery: String?,
    onSearch: (String) -> Unit,
    onOpenCatalog: () -> Unit,
    onAddWithAi: (String, Double, String) -> Unit,
    onAddCatalog: (FoodSearchData, Double, String) -> Unit,
    recentLogs: List<NutritionLogData>,
    favorites: List<FavoriteMealData>,
) {
    var name by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("100") }
    var unit by remember { mutableStateOf("g") }
    var manuallySelectedUnit by remember { mutableStateOf(false) }
    var selectedFood by remember { mutableStateOf<FoodSearchData?>(null) }
    var meal by remember { mutableStateOf(smartMealForCurrentTime()) }
    var showRecipe by remember { mutableStateOf(false) }
    val numericAmount = amount.replace(',', '.').toDoubleOrNull()
    val unitGrams = when (unit) { "adet" -> 100.0; "porsiyon" -> 200.0; else -> 1.0 }
    val grams = numericAmount?.times(unitGrams)
    val inferredUnit = smartFoodUnit(name)
    val cleanName = name.trim()
    val suggestions = if (cleanName.length >= 2 && searchedQuery == cleanName) results.take(4) else emptyList()

    LaunchedEffect(cleanName, searching, searchedQuery) {
        if (cleanName.length >= 2 && !searching && cleanName != searchedQuery) {
            delay(300)
            onSearch(cleanName)
        }
    }
    LaunchedEffect(inferredUnit) {
        if (!manuallySelectedUnit && name.isNotBlank() && unit != inferredUnit) {
            unit = inferredUnit
            amount = defaultAmountForUnit(inferredUnit)
        }
    }

    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(42.dp).background(HedefitColors.Lime.copy(alpha = .14f), RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Restaurant, null, tint = HedefitColors.Lime)
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (en) "Smart meal entry" else "Akıllı öğün ekle", style = MaterialTheme.typography.titleLarge)
                    Text(if (en) "Search, select a unit and scale instantly" else "Yaz, birimi seç; değerler otomatik hesaplansın", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                }
                IconButton(enabled = enabled, onClick = onOpenCatalog, modifier = Modifier.background(HedefitColors.SurfaceHigh, CircleShape)) {
                    Icon(Icons.Default.MenuBook, if (en) "Food catalogue" else "Besin kataloğu", tint = HedefitColors.Lime)
                }
                Spacer(Modifier.width(6.dp))
                IconButton(enabled = enabled, onClick = { showRecipe = true }, modifier = Modifier.background(HedefitColors.SurfaceHigh, CircleShape)) {
                    Icon(Icons.Default.SoupKitchen, if (en) "Add recipe" else "Tarif ekle", tint = HedefitColors.Warning)
                }
            }
            OutlinedTextField(
                value = name,
                onValueChange = {
                    val parsed = parseNaturalFoodEntry(it)
                    name = parsed.name.take(80)
                    if (parsed.amount != null) amount = parsed.amount.cleanNumber()
                    if (parsed.unit != null) {
                        unit = parsed.unit
                        manuallySelectedUnit = false
                    }
                    if (selectedFood?.name != name) selectedFood = null
                },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(if (en) "Start typing a food…" else "Besin yazmaya başla…") },
                leadingIcon = { Icon(Icons.Default.Search, null, tint = HedefitColors.TextSecondary) },
                trailingIcon = { if (searching) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = HedefitColors.Lime) },
                singleLine = true,
                colors = nutritionFieldColors(),
            )
            if (suggestions.isNotEmpty()) {
                Column(Modifier.fillMaxWidth().background(HedefitColors.SurfaceHigh, RoundedCornerShape(14.dp)).padding(6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    suggestions.forEach { food ->
                        Row(
                            Modifier.fillMaxWidth().clickable {
                                selectedFood = food
                                name = food.name
                                manuallySelectedUnit = false
                                unit = smartFoodUnit(food.name)
                                amount = defaultAmountForUnit(unit)
                            }.padding(horizontal = 10.dp, vertical = 9.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(food.name, fontWeight = FontWeight.SemiBold)
                                Text("${food.calories} kcal / 100 g${food.brand?.let { " • $it" }.orEmpty()}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                            }
                            if (food.verified) Icon(Icons.Default.Verified, null, tint = HedefitColors.Lime, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
            val recent = recentLogs.sortedByDescending { it.date }.distinctBy { it.name.lowercase(Locale("tr")) }.take(3)
            if (cleanName.length < 2 && (recent.isNotEmpty() || favorites.isNotEmpty())) {
                Column(Modifier.fillMaxWidth().background(HedefitColors.SurfaceHigh, RoundedCornerShape(14.dp)).padding(10.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    if (recent.isNotEmpty()) {
                        Text(if (en) "Recent" else "Son eklenenler", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium)
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            items(recent) { log ->
                                FilterChip(selected = false, onClick = {
                                    name = log.name; amount = (log.grams ?: 100.0).cleanNumber(); unit = "g"; manuallySelectedUnit = true
                                }, label = { Text(log.name) })
                            }
                        }
                    }
                    if (favorites.isNotEmpty()) {
                        Text(if (en) "Favourites" else "Favoriler", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium)
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            items(favorites.take(4)) { favorite ->
                                FilterChip(selected = false, onClick = {
                                    name = favorite.name; amount = favorite.grams.cleanNumber(); unit = "g"; manuallySelectedUnit = true
                                }, label = { Text("♥ ${favorite.name}") })
                            }
                        }
                    }
                }
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(listOf("g", "ml", "porsiyon", "adet")) { value ->
                    FilterChip(
                        selected = unit == value,
                        onClick = { manuallySelectedUnit = true; unit = value; amount = defaultAmountForUnit(value) },
                        label = { Text(if (en && value == "porsiyon") "portion" else if (en && value == "adet") "piece" else value) },
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButton(onClick = { amount = ((numericAmount ?: 1.0) - amountStep(unit)).coerceAtLeast(amountStep(unit)).cleanNumber() }, modifier = Modifier.background(HedefitColors.SurfaceHigh, CircleShape)) { Icon(Icons.Default.Remove, null) }
                OutlinedTextField(
                    amount,
                    { amount = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(7) },
                    Modifier.weight(1f),
                    label = { Text(if (en) "Amount ($unit)" else "Miktar ($unit)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    colors = nutritionFieldColors(),
                )
                IconButton(onClick = { amount = ((numericAmount ?: 0.0) + amountStep(unit)).cleanNumber() }, modifier = Modifier.background(HedefitColors.Lime, CircleShape)) { Icon(Icons.Default.Add, null, tint = HedefitColors.OnLime) }
            }
            grams?.takeIf { it > 0 }?.let { totalGrams ->
                val ratio = totalGrams / 100.0
                Column(Modifier.fillMaxWidth().background(HedefitColors.Lime.copy(alpha = .08f), RoundedCornerShape(13.dp)).padding(11.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        when (unit) {
                            "adet" -> if (en) "${amount} piece × 100 g = ${totalGrams.cleanNumber()} g" else "${amount} adet × 100 g = ${totalGrams.cleanNumber()} g"
                            "porsiyon" -> if (en) "${amount} portion × 200 g = ${totalGrams.cleanNumber()} g" else "${amount} porsiyon × 200 g = ${totalGrams.cleanNumber()} g"
                            "ml" -> if (en) "${amount} ml ≈ ${totalGrams.cleanNumber()} g" else "${amount} ml ≈ ${totalGrams.cleanNumber()} g"
                            else -> "${totalGrams.cleanNumber()} g"
                        },
                        color = HedefitColors.Lime,
                        fontWeight = FontWeight.Bold,
                    )
                    selectedFood?.let { food ->
                        Text(
                            "${(food.calories * ratio).toInt()} kcal • P ${(food.protein * ratio).toInt()} g • K ${(food.carbs * ratio).toInt()} g • Y ${(food.fat * ratio).toInt()} g",
                            color = HedefitColors.TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(listOf("Kahvaltı", "Öğle yemeği", "Akşam yemeği", "Atıştırmalık")) { type -> FilterChip(meal == type, { meal = type }, label = { Text(mealLabel(type, en)) }) }
            }
            Text(if (en) "Catalogue values are used first. If no match exists, AI estimates it and you can edit it from the meal card." else "Önce katalog değeri kullanılır. Eşleşme yoksa AI tahmin eder; öğün kartından her zaman düzenleyebilirsin.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            Button(
                enabled = enabled && !busy && cleanName.length >= 2 && grams != null && grams > 0,
                onClick = {
                    grams?.let { total ->
                        // Search suggestions are never silently accepted: the user must tap one.
                        // Otherwise the full phrase goes to the server, where exact catalogue
                        // matches are used and compound dishes are analysed by AI.
                        selectedFood?.takeIf { it.name == cleanName }?.let { onAddCatalog(it, total, meal) }
                            ?: onAddWithAi(cleanName, total, meal)
                        name = ""
                        selectedFood = null
                        unit = "g"
                        amount = "100"
                        manuallySelectedUnit = false
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime),
            ) { Text(if (!enabled) (if (en) "Past day" else "Geçmiş gün") else if (busy) (if (en) "Adding…" else "Ekleniyor…") else if (en) "Add to ${mealLabel(meal, true)}" else "${mealLabel(meal, false)} öğününe ekle") }
        }
    }
    if (showRecipe) RecipeComposerDialog(en, busy, meal, onDismiss = { showRecipe = false }) { recipe, grams ->
        showRecipe = false
        onAddWithAi(recipe, grams, meal)
    }
}

private fun smartMealForCurrentTime(): String = when (LocalTime.now().hour) {
    in 4..10 -> "Kahvaltı"
    in 11..14 -> "Öğle yemeği"
    in 15..17 -> "Atıştırmalık"
    else -> "Akşam yemeği"
}

private fun smartFoodUnit(name: String): String {
    val clean = name.lowercase(Locale("tr"))
    return when {
        listOf("su", "süt", "ayran", "kefir", "meyve suyu", "kahve", "çay", "çorba").any(clean::contains) -> "ml"
        listOf("yumurta", "elma", "muz", "portakal", "mandalina", "simit", "dilim", "bar").any(clean::contains) -> "adet"
        listOf("pilav", "makarna", "salata", "yemek", "tabak", "kase", "menü").any(clean::contains) -> "porsiyon"
        else -> "g"
    }
}

private data class ParsedFoodEntry(val name: String, val amount: Double? = null, val unit: String? = null)

/** Understands short Turkish entries such as "2 yumurta" and "250 ml ayran" before catalogue search. */
private fun parseNaturalFoodEntry(value: String): ParsedFoodEntry {
    val match = Regex("^\\s*(\\d+(?:[.,]\\d+)?)\\s*(g|gr|gram|ml|adet|tane|porsiyon|portion)?\\s+(.+)$", RegexOption.IGNORE_CASE).matchEntire(value.trim())
        ?: return ParsedFoodEntry(value)
    val amount = match.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return ParsedFoodEntry(value)
    val food = match.groupValues[3].trim()
    if (food.length < 2) return ParsedFoodEntry(value)
    val explicitUnit = when (match.groupValues[2].lowercase(Locale("tr"))) {
        "g", "gr", "gram" -> "g"
        "ml" -> "ml"
        "adet", "tane" -> "adet"
        "porsiyon", "portion" -> "porsiyon"
        else -> smartFoodUnit(food)
    }
    return ParsedFoodEntry(food, amount, explicitUnit)
}

private fun defaultAmountForUnit(unit: String) = if (unit == "adet" || unit == "porsiyon") "1" else "100"
private fun amountStep(unit: String) = if (unit == "adet" || unit == "porsiyon") 1.0 else 10.0
private fun Double.cleanNumber(): String = if (this % 1.0 == 0.0) toInt().toString() else "%.1f".format(Locale.US, this)

@Composable
private fun RecipeComposerDialog(en: Boolean, busy: Boolean, meal: String, onDismiss: () -> Unit, onAnalyze: (String, Double) -> Unit) {
    var title by remember { mutableStateOf("") }
    var ingredients by remember { mutableStateOf("") }
    var grams by remember { mutableStateOf("") }
    var servings by remember { mutableStateOf("1") }
    var eatenServings by remember { mutableStateOf("1") }
    val totalGrams = grams.replace(',', '.').toDoubleOrNull()
    val totalServings = servings.toIntOrNull()
    val eaten = eatenServings.replace(',', '.').toDoubleOrNull()
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (en) "Add recipe" else "Tarif ekle") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(if (en) "Write the ingredients and amounts. Hedefit estimates the recipe's calories, macros, and micronutrients for the total portion." else "Malzemeleri ve miktarlarını yaz. Hedefit, tarifin toplam porsiyonu için kalori, makro ve mikro besin tahmini çıkarır.", color = HedefitColors.TextSecondary)
                OutlinedTextField(title, { title = it.take(80) }, label = { Text(if (en) "Recipe name" else "Tarif adı") }, placeholder = { Text(if (en) "e.g. chicken pasta" else "örn. tavuklu makarna") }, singleLine = true)
                OutlinedTextField(ingredients, { ingredients = it.take(850) }, label = { Text(if (en) "Ingredients and amounts" else "Malzemeler ve miktarları") }, placeholder = { Text(if (en) "150 g chicken, 80 g pasta, 1 tsp olive oil" else "150 g tavuk, 80 g makarna, 1 çay kaşığı zeytinyağı") }, minLines = 4, maxLines = 6)
                OutlinedTextField(grams, { grams = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(5) }, label = { Text(if (en) "Whole recipe weight (g)" else "Tarifin toplam ağırlığı (g)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(servings, { servings = it.filter(Char::isDigit).take(2) }, Modifier.weight(1f), label = { Text(if (en) "Recipe servings" else "Tarif porsiyonu") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    OutlinedTextField(eatenServings, { eatenServings = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(4) }, Modifier.weight(1f), label = { Text(if (en) "You ate" else "Yediğin porsiyon") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                }
                Text(if (en) "Each ingredient is calculated for the whole recipe, then divided by servings. Recipes remain editable after saving." else "Malzemeler önce toplam tarif için hesaplanır, sonra porsiyona bölünür. Kaydettikten sonra da düzenleyebilirsin.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } },
        confirmButton = {
            Button(
                enabled = !busy && title.trim().length >= 2 && ingredients.trim().length >= 4 && totalGrams != null && totalGrams in 1.0..5000.0 && totalServings != null && totalServings in 1..30 && eaten != null && eaten > 0 && eaten <= totalServings,
                onClick = { onAnalyze("${title.trim()}: ${ingredients.trim()}. Toplam tarif: ${totalGrams!!.cleanNumber()} g, $totalServings porsiyon. Kaydedilen miktar: ${eaten!!.cleanNumber()} porsiyon.", totalGrams * eaten / totalServings!!) },
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
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
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
                        Text(if (target >= consumed) (if (en) "${target - consumed} kcal left" else "${target - consumed} kcal kaldı") else (if (en) "${consumed - target} kcal over" else "${consumed - target} kcal aştın"), color = if (target >= consumed) HedefitColors.Lime else HedefitColors.Coral, style = MaterialTheme.typography.labelLarge)
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
        val kcalSummary = if (target >= consumed) (if (en) "${target - consumed} kcal remaining" else "Kalan ${target - consumed} kcal") else (if (en) "${consumed - target} kcal above target" else "Hedefin ${consumed - target} kcal üzerindesin")
        val proteinGap = (goal.protein - protein).coerceAtLeast(0.0)
        Text("$kcalSummary • ${if (proteinGap > 0) (if (en) "protein missing ${proteinGap.toInt()} g" else "protein eksik ${proteinGap.toInt()} g") else (if (en) "protein target reached" else "protein hedefi tamam")}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun MealList(
    logs: List<NutritionLogData>,
    onFavorite: (NutritionLogData) -> Unit,
    onRemove: (NutritionLogData) -> Unit,
    onUpdate: (NutritionLogData, Double, String) -> Unit,
    busy: Boolean,
    en: Boolean,
) {
    var pendingRemoval by remember { mutableStateOf<NutritionLogData?>(null) }
    var editing by remember { mutableStateOf<NutritionLogData?>(null) }
    val mealTypes = listOf("Kahvaltı", "Öğle yemeği", "Akşam yemeği", "Atıştırmalık")
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        mealTypes.forEach { type ->
            val entries = logs.filter { if (type == "Atıştırmalık") it.meal == type || it.meal !in mealTypes else it.meal == type }
            val (icon, tint) = mealStyle(type)
            HedefitCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(42.dp).background(tint.copy(alpha = .14f), RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint) }
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(mealLabel(type, en), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(if (entries.isEmpty()) (if (en) "No food added" else "Henüz besin eklenmedi") else if (en) "${entries.size} foods" else "${entries.size} besin", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        }
                        Text("${entries.sumOf { it.calories }} kcal", color = tint, fontWeight = FontWeight.Black)
                    }
                    if (entries.isNotEmpty()) {
                        TextButton(enabled = !busy, onClick = { onFavorite(entries.asSavedMeal(type)) }, modifier = Modifier.align(Alignment.End)) {
                            Icon(Icons.Default.Favorite, null, tint = HedefitColors.Coral, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(5.dp))
                            Text(if (en) "Save as a meal" else "Öğün olarak kaydet", color = HedefitColors.Coral)
                        }
                    }
                    entries.forEachIndexed { index, log ->
                        if (index == 0) Spacer(Modifier.height(4.dp))
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(7.dp).background(tint, CircleShape))
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(log.name, fontWeight = FontWeight.SemiBold)
                                Text("${log.grams?.cleanNumber() ?: "—"} g • P ${log.protein.toInt()} • K ${log.carbs.toInt()} • Y ${log.fat.toInt()}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                            }
                            Text("${log.calories} kcal", color = HedefitColors.TextPrimary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
                            IconButton(enabled = !busy, onClick = { editing = log }) { Icon(Icons.Default.Edit, if (en) "Edit or move food" else "Besini düzenle veya taşı", tint = HedefitColors.Lime, modifier = Modifier.size(18.dp)) }
                            IconButton(onClick = { onFavorite(log) }) { Icon(Icons.Default.Favorite, if (en) "Add to favourites" else "Favoriye ekle", tint = HedefitColors.Coral, modifier = Modifier.size(18.dp)) }
                            IconButton(enabled = !busy, onClick = { pendingRemoval = log }) {
                                Icon(Icons.Default.DeleteOutline, if (en) "Remove food" else "Besini kaldır", tint = HedefitColors.TextSecondary, modifier = Modifier.size(20.dp))
                            }
                        }
                        if (index < entries.lastIndex) Box(Modifier.fillMaxWidth().height(.6.dp).background(HedefitColors.Divider))
                    }
                }
            }
        }
    }
    pendingRemoval?.let { log ->
        AlertDialog(
            onDismissRequest = { if (!busy) pendingRemoval = null },
            title = { Text(if (en) "Remove food?" else "Besin kaldırılsın mı?") },
            text = { Text(if (en) "${log.name} will be removed from ${mealLabel(log.meal, true).lowercase()}." else "${log.name}, ${mealLabel(log.meal, false).lowercase()} öğününden kaldırılacak.") },
            confirmButton = {
                TextButton(enabled = !busy, onClick = { pendingRemoval = null; onRemove(log) }) {
                    Text(if (en) "Remove" else "Kaldır", color = HedefitColors.Coral, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = { TextButton(enabled = !busy, onClick = { pendingRemoval = null }) { Text(if (en) "Cancel" else "Vazgeç") } },
        )
    }
    editing?.let { log -> EditMealLogDialog(log, busy, en, onDismiss = { editing = null }, onSave = { grams, meal -> editing = null; onUpdate(log, grams, meal) }) }
}

/** A saved combination is kept as one reusable, fully calculated meal to make repeat logging one touch. */
private fun List<NutritionLogData>.asSavedMeal(meal: String): NutritionLogData = NutritionLogData(
    id = "saved-$meal",
    date = LocalDate.now().toString(),
    meal = meal,
    name = "$meal paketi",
    calories = sumOf { it.calories },
    protein = sumOf { it.protein },
    carbs = sumOf { it.carbs },
    fat = sumOf { it.fat },
    grams = sumOf { it.grams ?: 0.0 }.takeIf { it > 0 },
    fiber = sumOf { it.fiber },
    sugar = sumOf { it.sugar },
    sodiumMg = sumOf { it.sodiumMg },
    potassiumMg = sumOf { it.potassiumMg },
    calciumMg = sumOf { it.calciumMg },
    ironMg = sumOf { it.ironMg },
    vitaminCMg = sumOf { it.vitaminCMg },
)

@Composable
private fun EditMealLogDialog(log: NutritionLogData, busy: Boolean, en: Boolean, onDismiss: () -> Unit, onSave: (Double, String) -> Unit) {
    var amount by remember(log.id) { mutableStateOf((log.grams ?: 100.0).cleanNumber()) }
    var meal by remember(log.id) { mutableStateOf(log.meal) }
    val grams = amount.replace(',', '.').toDoubleOrNull()
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (en) "Edit food" else "Besini düzenle") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(log.name, fontWeight = FontWeight.Bold)
                OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(7) }, label = { Text(if (en) "Amount (g)" else "Miktar (g)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), colors = nutritionFieldColors())
                Text(if (en) "Move to meal" else "Öğün değiştir", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(listOf("Kahvaltı", "Öğle yemeği", "Akşam yemeği", "Atıştırmalık")) { type ->
                        FilterChip(selected = meal == type, onClick = { meal = type }, label = { Text(mealLabel(type, en)) })
                    }
                }
                Text(if (en) "Calories and macros scale from the saved catalogue value." else "Kalori ve makrolar kayıtlı katalog değerine göre otomatik ölçeklenir.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } },
        confirmButton = { Button(enabled = !busy && grams != null && grams in 1.0..5000.0, onClick = { onSave(grams!!, meal) }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Icon(Icons.Default.SwapHoriz, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(if (en) "Save" else "Kaydet") } },
    )
}

private fun mealStyle(meal: String): Pair<ImageVector, Color> = when (meal) {
    "Kahvaltı" -> Icons.Default.EggAlt to HedefitColors.Warning
    "Öğle yemeği" -> Icons.Default.RamenDining to HedefitColors.Lime
    "Akşam yemeği" -> Icons.Default.LocalDining to HedefitColors.Coral
    else -> Icons.Default.Restaurant to HedefitColors.Sleep
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
private fun WaterQuickAdd(currentMl: Int, goalMl: Int, onAdd: (Int) -> Unit, onGoalChange: (Int) -> Unit, en: Boolean, enabled: Boolean) {
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.WaterDrop, null, tint = HedefitColors.Water)
                Spacer(Modifier.width(9.dp))
                Column(Modifier.weight(1f)) { Text(if (en) "Water" else "Su", style = MaterialTheme.typography.titleMedium); Text("${currentMl} / $goalMl ml", color = HedefitColors.TextSecondary) }
                Text("%${(currentMl * 100 / goalMl.coerceAtLeast(1)).coerceAtMost(100)}", color = HedefitColors.Water, fontWeight = FontWeight.Bold)
            }
            Box(Modifier.fillMaxWidth().height(7.dp).background(HedefitColors.Divider, CircleShape)) { Box(Modifier.fillMaxWidth((currentMl / goalMl.toFloat()).coerceIn(0f, 1f)).height(7.dp).background(HedefitColors.Water, CircleShape)) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                Text(if (en) "Goal" else "Hedef", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium)
                TextButton(onClick = { onGoalChange((goalMl - 250).coerceAtLeast(500)) }) { Text("−250") }
                TextButton(onClick = { onGoalChange((goalMl + 250).coerceAtMost(10_000)) }) { Text("+250") }
            }
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
                MicroValue(if (en) "Potassium" else "Potasyum", "${potassium.toInt()} / 3500 mg", Modifier.weight(1f))
                MicroValue(if (en) "Calcium" else "Kalsiyum", "${calcium.toInt()} / 1000 mg", Modifier.weight(1f))
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
private fun FoodSearchDialog(results: List<FoodSearchData>, searching: Boolean, searchedQuery: String?, adding: Boolean, en: Boolean, onDismiss: () -> Unit, onSearch: (String) -> Unit, onAdd: (FoodSearchData, Double, String) -> Unit) {
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<FoodSearchData?>(null) }
    var grams by remember { mutableStateOf("100") }
    var addAttempted by remember { mutableStateOf(false) }
    var meal by remember { mutableStateOf("Atıştırmalık") }
    LaunchedEffect(query, searching, searchedQuery) {
        val clean = query.trim()
        if (clean.length >= 2 && !searching && clean != searchedQuery) {
            delay(350)
            onSearch(clean)
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (en) "Verified food catalogue" else "Doğrulanmış besin kataloğu") },
        text = { Column(Modifier.fillMaxWidth().heightIn(max = 560.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(
                query,
                { query = it.take(80) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(if (en) "Food or brand" else "Besin veya marka") },
                trailingIcon = { IconButton(onClick = { onSearch(query.trim()) }) { Icon(Icons.Default.Search, if (en) "Search" else "Ara") } },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { if (query.trim().length >= 2) onSearch(query.trim()) }),
            )
            if (searching) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally), color = HedefitColors.Lime)
            if (!searching && searchedQuery != null && results.isEmpty()) {
                Text(
                    if (en) "No verified result for “$searchedQuery”. Try another name or brand."
                    else "“$searchedQuery” için doğrulanmış sonuç bulunamadı. Farklı bir ad veya marka dene.",
                    color = HedefitColors.TextSecondary,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            selected?.let { food ->
                HedefitCard {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row { Text(food.name, Modifier.weight(1f), fontWeight = FontWeight.Bold); if (food.verified) Icon(Icons.Default.Verified, "Doğrulanmış", tint = HedefitColors.Lime) }
                        Text("${food.calories} kcal • P ${food.protein.toInt()} • K ${food.carbs.toInt()} • Y ${food.fat.toInt()} • Lif ${food.fiber.toInt()}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        val gramsError = if (addAttempted) validateFoodGrams(grams) else null
                        OutlinedTextField(
                            grams,
                            { grams = it.filter { c -> c.isDigit() || c == '.' } },
                            label = { Text(if (en) "Grams" else "Gram") },
                            singleLine = true,
                            isError = gramsError != null,
                            supportingText = gramsError?.let { error -> ({ Text(if (en) "Enter a value between 0 and 5000 grams." else error) }) },
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { listOf("Kahvaltı", "Öğle yemeği", "Akşam yemeği", "Atıştırmalık").forEach { type -> FilterChip(meal == type, { meal = type }, label = { Text(mealLabel(type, en), style = MaterialTheme.typography.labelMedium) }) } }
                        Button(enabled = !adding, onClick = {
                            addAttempted = true
                            if (validateFoodGrams(grams) == null) onAdd(food, requireNotNull(grams.toDoubleOrNull()), meal)
                        }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "Add to meal" else "Öğüne ekle") }
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
