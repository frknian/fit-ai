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
) {
    val en = language == "en"
    var showFoodSearch by remember { mutableStateOf(false) }
    LaunchedEffect(openMealComposer) {
        if (openMealComposer) {
            showFoodSearch = true
            onMealComposerOpened()
        }
    }
    val logs = data?.nutritionLogs.orEmpty()

    ScreenContainer(padding) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 16.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(15.dp),
        ) {
            item { NutritionHeader(en) }
            item { DateSelector(en) }
            if (expanded) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(.85f), verticalArrangement = Arrangement.spacedBy(15.dp)) {
                            CalorieCard(logs, data?.nutritionGoal ?: NutritionGoalData(), data?.activeCalories ?: 0)
                            MealEntryCard(en, busy, { showFoodSearch = true }, onAddWithAi)
                            WaterQuickAdd(data?.waterMl ?: 0, onAddWater)
                            MicroNutrientCard(logs)
                            NutritionTip()
                        }
                        Column(Modifier.weight(1.15f), verticalArrangement = Arrangement.spacedBy(15.dp)) {
                            SectionTitle(if (en) "Meals" else "Öğünler", if (en) "View all" else "Tümünü Gör")
                            FavoriteMeals(data?.favoriteMeals.orEmpty(), onRepeatFavorite, onRemoveFavorite)
                            MealList(logs, onAddFavorite)
                        }
                    }
                }
            } else {
                item { CalorieCard(logs, data?.nutritionGoal ?: NutritionGoalData(), data?.activeCalories ?: 0) }
                item { MealEntryCard(en, busy, { showFoodSearch = true }, onAddWithAi) }
                item { WaterQuickAdd(data?.waterMl ?: 0, onAddWater) }
                item { MicroNutrientCard(logs) }
                if (!data?.favoriteMeals.isNullOrEmpty()) item { FavoriteMeals(data?.favoriteMeals.orEmpty(), onRepeatFavorite, onRemoveFavorite) }
                item { SectionTitle(if (en) "Meals" else "Öğünler") }
                item { MealList(logs, onAddFavorite) }
                item { NutritionTip() }
            }
        }
    }

    if (showFoodSearch) FoodSearchDialog(foodResults, foodSearchBusy, busy, onDismiss = { showFoodSearch = false }, onSearch = onSearchFoods, onAdd = { item, amount, type -> onAddCatalogFood(item, amount, type); showFoodSearch = false })
}

@Composable
private fun MealEntryCard(en: Boolean, busy: Boolean, onOpenCatalog: () -> Unit, onAdd: (String, Double, String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("100") }
    var unit by remember { mutableStateOf("g") }
    var unitWeight by remember { mutableStateOf("100") }
    var meal by remember { mutableStateOf("Atıştırmalık") }
    val numericAmount = amount.replace(',', '.').toDoubleOrNull()
    val grams = when (unit) { "porsiyon", "adet" -> numericAmount?.times(unitWeight.replace(',', '.').toDoubleOrNull() ?: 0.0); else -> numericAmount }
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Restaurant, null, tint = HedefitColors.Lime); Spacer(Modifier.width(8.dp))
                Text(if (en) "Add a meal" else "Öğün ekle", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.weight(1f)); TextButton(onClick = onOpenCatalog) { Text(if (en) "Catalog" else "Katalog") }
            }
            OutlinedTextField(name, { name = it.take(80) }, modifier = Modifier.fillMaxWidth(), placeholder = { Text(if (en) "Meal name" else "Öğün adı, örn. tavuklu pilav") }, singleLine = true, colors = nutritionFieldColors())
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(listOf("g", "ml", "porsiyon", "adet")) { value -> FilterChip(unit == value, { unit = value; amount = if (value == "adet" || value == "porsiyon") "1" else "100" }, label = { Text(if (en && value == "porsiyon") "portion" else if (en && value == "adet") "piece" else value) }) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(7) }, Modifier.weight(1f), label = { Text(if (en) "Amount" else "Miktar") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), colors = nutritionFieldColors())
                if (unit == "porsiyon" || unit == "adet") OutlinedTextField(unitWeight, { unitWeight = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(7) }, Modifier.weight(1f), label = { Text(if (en) "g each" else "birimi (g)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), colors = nutritionFieldColors())
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(listOf("Kahvaltı", "Öğle yemeği", "Akşam yemeği", "Atıştırmalık")) { type -> FilterChip(meal == type, { meal = type }, label = { Text(type.substringBefore(' ')) }) } }
            Button(enabled = !busy && name.trim().length >= 2 && grams != null && grams > 0, onClick = { grams?.let { onAdd(name.trim(), it, meal); name = "" } }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (busy) (if (en) "Adding…" else "Ekleniyor…") else if (en) "Add meal" else "Öğünü ekle") }
        }
    }
}

@Composable
private fun NutritionHeader(en: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(if (en) "Nutrition" else "Beslenme", style = MaterialTheme.typography.headlineMedium)
            Text(if (en) "Calories and macro tracking" else "Kalori ve makro takibi", color = HedefitColors.TextSecondary)
        }
        IconButton(onClick = {}) { Icon(Icons.Default.CalendarMonth, "Takvim", tint = HedefitColors.Lime) }
    }
}

@Composable
private fun DateSelector(en: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = {}) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Önceki gün") }
        Box(Modifier.background(HedefitColors.SurfaceHigh, RoundedCornerShape(22.dp)).padding(horizontal = 24.dp, vertical = 10.dp)) {
            Text(if (en) "Today" else "Bugün", fontWeight = FontWeight.SemiBold)
        }
        IconButton(onClick = {}) { Icon(Icons.AutoMirrored.Filled.ArrowForward, "Sonraki gün") }
    }
}

@Composable
private fun CalorieCard(logs: List<NutritionLogData>, goal: NutritionGoalData, activeCalories: Int) {
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
                        Text("${target - consumed} kcal kaldı", color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge)
                        if (activityBonus > 0) Text("+$activityBonus aktivite", color = HedefitColors.Water, style = MaterialTheme.typography.bodySmall)
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
private fun MealList(logs: List<NutritionLogData>, onFavorite: (NutritionLogData) -> Unit) {
    val meals = logs.map { it.toMealUi() }
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (meals.isEmpty()) Text("Bugün henüz öğün kaydı yok.", color = HedefitColors.TextSecondary, modifier = Modifier.padding(vertical = 18.dp))
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
                    IconButton(onClick = { onFavorite(log) }) { Icon(Icons.Default.Favorite, "Favoriye ekle", tint = HedefitColors.Coral, modifier = Modifier.size(19.dp)) }
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

@Composable
private fun nutritionFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = HedefitColors.Lime,
    unfocusedBorderColor = HedefitColors.Divider,
    focusedContainerColor = HedefitColors.Surface,
    unfocusedContainerColor = HedefitColors.Surface,
)

@Composable
private fun WaterQuickAdd(currentMl: Int, onAdd: (Int) -> Unit) {
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.WaterDrop, null, tint = HedefitColors.Water)
                Spacer(Modifier.width(9.dp))
                Column(Modifier.weight(1f)) { Text("Su", style = MaterialTheme.typography.titleMedium); Text("${currentMl} / 2500 ml", color = HedefitColors.TextSecondary) }
                Text("%${(currentMl / 25).coerceAtMost(100)}", color = HedefitColors.Water, fontWeight = FontWeight.Bold)
            }
            Box(Modifier.fillMaxWidth().height(7.dp).background(HedefitColors.Divider, CircleShape)) { Box(Modifier.fillMaxWidth((currentMl / 2500f).coerceIn(0f, 1f)).height(7.dp).background(HedefitColors.Water, CircleShape)) }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                listOf(200, 300, 500).forEach { amount -> TextButton(onClick = { onAdd(amount) }, modifier = Modifier.weight(1f)) { Text("+$amount ml", color = HedefitColors.Water) } }
            }
        }
    }
}

@Composable
private fun MicroNutrientCard(logs: List<NutritionLogData>) {
    val fiber = logs.sumOf { it.fiber }
    val sugar = logs.sumOf { it.sugar }
    val sodium = logs.sumOf { it.sodiumMg }
    val potassium = logs.sumOf { it.potassiumMg }
    val calcium = logs.sumOf { it.calciumMg }
    val iron = logs.sumOf { it.ironMg }
    val vitaminC = logs.sumOf { it.vitaminCMg }
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionTitle("Lif ve mikro besinler")
            MacroBar("Lif", "${fiber.toInt()} / 30 g", (fiber / 30).toFloat())
            MacroBar("Şeker", "${sugar.toInt()} g", (sugar / 50).toFloat())
            MacroBar("Sodyum", "${sodium.toInt()} / 2300 mg", (sodium / 2300).toFloat())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MicroValue("Potasyum", "${potassium.toInt()} mg", Modifier.weight(1f))
                MicroValue("Kalsiyum", "${calcium.toInt()} mg", Modifier.weight(1f))
                MicroValue("Demir", "%.1f mg".format(iron), Modifier.weight(1f))
            }
            MicroValue("C Vitamini", "${vitaminC.toInt()} / 90 mg", Modifier.fillMaxWidth())
        }
    }
}

@Composable private fun MicroValue(label: String, value: String, modifier: Modifier) {
    Column(modifier.background(HedefitColors.SurfaceHigh, RoundedCornerShape(11.dp)).padding(9.dp)) { Text(label, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall); Text(value, style = MaterialTheme.typography.labelLarge) }
}

@Composable
private fun FavoriteMeals(favorites: List<FavoriteMealData>, onRepeat: (FavoriteMealData) -> Unit, onRemove: (String) -> Unit) {
    if (favorites.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionTitle("Favori öğünler", "Tekrar ekle")
        favorites.take(4).forEach { favorite ->
            HedefitCard(Modifier.fillMaxWidth(), onClick = { onRepeat(favorite) }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Favorite, null, tint = HedefitColors.Coral)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) { Text(favorite.name, style = MaterialTheme.typography.titleMedium); Text("${favorite.grams.toInt()} g • ${favorite.calories} kcal", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                    TextButton(onClick = { onRemove(favorite.id) }) { Text("Kaldır", color = HedefitColors.TextSecondary) }
                }
            }
        }
    }
}

@Composable
private fun FoodSearchDialog(results: List<FoodSearchData>, searching: Boolean, adding: Boolean, onDismiss: () -> Unit, onSearch: (String) -> Unit, onAdd: (FoodSearchData, Double, String) -> Unit) {
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<FoodSearchData?>(null) }
    var grams by remember { mutableStateOf("100") }
    var meal by remember { mutableStateOf("Atıştırmalık") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Doğrulanmış besin kataloğu") },
        text = { Column(Modifier.fillMaxWidth().heightIn(max = 560.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(query, { query = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Besin veya marka") }, trailingIcon = { IconButton(onClick = { onSearch(query) }) { Icon(Icons.Default.Search, "Ara") } }, singleLine = true)
            if (searching) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally), color = HedefitColors.Lime)
            selected?.let { food ->
                HedefitCard {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row { Text(food.name, Modifier.weight(1f), fontWeight = FontWeight.Bold); if (food.verified) Icon(Icons.Default.Verified, "Doğrulanmış", tint = HedefitColors.Lime) }
                        Text("${food.calories} kcal • P ${food.protein.toInt()} • K ${food.carbs.toInt()} • Y ${food.fat.toInt()} • Lif ${food.fiber.toInt()}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        OutlinedTextField(grams, { grams = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Gram") }, singleLine = true)
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { listOf("Kahvaltı", "Öğle yemeği", "Akşam yemeği", "Atıştırmalık").forEach { type -> FilterChip(meal == type, { meal = type }, label = { Text(type.substringBefore(' '), style = MaterialTheme.typography.labelMedium) }) } }
                        Button(enabled = !adding, onClick = { grams.toDoubleOrNull()?.let { onAdd(food, it, meal) } }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text("Öğüne ekle") }
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
        confirmButton = {}, dismissButton = { TextButton(onClick = onDismiss) { Text("Kapat") } },
    )
}

@Composable
private fun NutritionTip() {
    HedefitCard(Modifier.fillMaxWidth()) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.size(42.dp).background(HedefitColors.Lime.copy(alpha = .16f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.AutoAwesome, null, tint = HedefitColors.Lime)
            }
            Column(Modifier.weight(1f)) {
                Text("Fit Koç önerisi", style = MaterialTheme.typography.titleMedium)
                Text("Protein hedefini tamamlamak için sonraki öğününde yoğurt, yumurta veya yağsız et tercih edebilirsin.", color = HedefitColors.TextSecondary)
            }
        }
    }
}
