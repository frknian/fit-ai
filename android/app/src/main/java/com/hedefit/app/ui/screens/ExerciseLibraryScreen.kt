package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hedefit.app.data.model.ExerciseCatalogData
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.ExerciseMedia
import com.hedefit.app.ui.components.ExerciseMotionPlayer
import com.hedefit.app.ui.theme.HedefitColors
import java.util.UUID

@Composable
fun ExerciseLibraryScreen(items: List<ExerciseCatalogData>, loading: Boolean, language: String, onBack: () -> Unit, onSearch: (String, String, String, String, String, String, String, String, String) -> Unit, onUse: (ExerciseCatalogData) -> Unit) {
    val en = language == "en"
    var query by remember { mutableStateOf("") }
    var muscle by remember { mutableStateOf("") }
    var equipment by remember { mutableStateOf("") }
    var level by remember { mutableStateOf("") }
    var environment by remember { mutableStateOf("") }
    var muscleRole by remember { mutableStateOf("primary") }
    var force by remember { mutableStateOf("") }
    var mechanic by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var showFilters by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<ExerciseCatalogData?>(null) }
    var showCustom by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(HedefitColors.Background).statusBarsPadding()) {
        UtilityHeader(if (en) "Movement Atlas" else "Hareket Atlası", onBack)
        Column(Modifier.padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            HedefitCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Box(Modifier.size(56.dp).background(HedefitColors.Lime, RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Default.MenuBook, null, tint = HedefitColors.OnLime, modifier = Modifier.size(30.dp)) }
                    Column(Modifier.weight(1f)) { Text(if (en) "Open the movement atlas" else "Hareket atlasını aç", style = MaterialTheme.typography.titleLarge); Text(if (en) "873 illustrated exercises" else "873 görselli hareket", color = HedefitColors.TextSecondary) }
                }
            }
            OutlinedTextField(query, { query = it }, modifier = Modifier.fillMaxWidth(), placeholder = { Text(if (en) "Search a movement" else "Hareket ara") }, leadingIcon = { Icon(Icons.Default.Search, null) }, trailingIcon = { IconButton(onClick = { onSearch(query, muscle, equipment, level, environment, muscleRole, force, mechanic, category) }) { Icon(Icons.Default.Search, if (en) "Search" else "Ara") } }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { showFilters = !showFilters }, modifier = Modifier.weight(1f)) { Icon(Icons.Default.FilterList, null); Spacer(Modifier.width(7.dp)); Text(if (en) "Filters" else "Filtreler"); Text(" • ${listOf(muscle, equipment, level, environment, force, mechanic, category).count(String::isNotBlank)}") }
                OutlinedButton(onClick = { showCustom = true }, modifier = Modifier.weight(1f)) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(7.dp)); Text(if (en) "Custom" else "Özel hareket") }
            }
            if (showFilters) {
                val applyFilters = { onSearch(query, muscle, equipment, level, environment, muscleRole, force, mechanic, category) }
                FilterSection(if (en) "Place" else "Ortam", listOf("" to if (en) "Any" else "Tümü", "gym" to if (en) "Gym" else "Spor salonu", "home" to if (en) "Home" else "Ev"), environment) { environment = it; applyFilters() }
                FilterSection(if (en) "Muscle" else "Kas grubu", if (en) listOf("" to "All", "chest" to "Chest", "forearms" to "Forearms", "back" to "Back", "quadriceps" to "Quads", "hamstrings" to "Hamstrings", "glutes" to "Glutes", "shoulders" to "Shoulders", "biceps" to "Biceps", "triceps" to "Triceps", "abdominals" to "Abs", "calves" to "Calves") else listOf("" to "Tümü", "chest" to "Göğüs", "forearms" to "Ön kol", "back" to "Sırt", "quadriceps" to "Ön bacak", "hamstrings" to "Arka bacak", "glutes" to "Kalça", "shoulders" to "Omuz", "biceps" to "Biseps", "triceps" to "Arka kol", "abdominals" to "Karın", "calves" to "Baldır"), muscle) { muscle = it; applyFilters() }
                if (muscle.isNotBlank()) FilterSection(if (en) "Muscle role" else "Kas rolü", listOf("primary" to if (en) "Primary" else "Ana kas", "secondary" to if (en) "Secondary" else "Yardımcı kas", "" to if (en) "Either" else "Her ikisi"), muscleRole) { muscleRole = it; applyFilters() }
                FilterSection(if (en) "Training type" else "Antrenman türü", listOf("strength" to if (en) "Strength" else "Kuvvet", "stretching" to if (en) "Mobility" else "Mobilite", "plyometrics" to if (en) "Explosive" else "Patlayıcı", "" to if (en) "All" else "Tümü"), category) { category = it; applyFilters() }
                FilterSection(if (en) "Movement pattern" else "Hareket paterni", listOf("" to if (en) "All" else "Tümü", "push" to if (en) "Push" else "İtiş", "pull" to if (en) "Pull" else "Çekiş", "static" to if (en) "Static" else "Statik"), force) { force = it; applyFilters() }
                FilterSection(if (en) "Structure" else "Yapı", listOf("" to if (en) "All" else "Tümü", "compound" to if (en) "Compound" else "Bileşik", "isolation" to if (en) "Isolation" else "İzolasyon"), mechanic) { mechanic = it; applyFilters() }
                FilterSection(if (en) "Level" else "Seviye", listOf("" to if (en) "All" else "Tümü", "beginner" to if (en) "Easy" else "Kolay", "intermediate" to if (en) "Medium" else "Orta", "expert" to if (en) "Advanced" else "İleri"), level) { level = it; applyFilters() }
                FilterSection(if (en) "Equipment" else "Ekipman", listOf("" to if (en) "All" else "Tümü", "body only" to if (en) "Bodyweight" else "Vücut", "dumbbell" to if (en) "Dumbbell" else "Dambıl", "barbell" to if (en) "Barbell" else "Halter", "machine" to if (en) "Machine" else "Makine", "cable" to if (en) "Cable" else "Kablo", "bands" to if (en) "Band" else "Bant", "kettlebells" to "Kettlebell"), equipment) { equipment = it; applyFilters() }
            }
        }
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = HedefitColors.Lime)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Text(if (en) "${items.size} movements" else "${items.size} hareket", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelLarge) }
            items(items.size) { index ->
                val item = items[index]
                HedefitCard(Modifier.fillMaxWidth(), onClick = { selected = item }) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        ExerciseMedia(item.imageUrls.firstOrNull(), item.name, Modifier.size(64.dp).clip(RoundedCornerShape(14.dp)))
                        Column(Modifier.weight(1f)) { Text(item.name, style = MaterialTheme.typography.titleMedium); Text("${item.primaryMuscles.joinToString()} • ${item.equipment.ifBlank { if (en) "no equipment" else "ekipmansız" }}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                        Text(item.level, color = HedefitColors.Lime, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
    selected?.let { exercise ->
        AlertDialog(onDismissRequest = { selected = null }, title = { Text(exercise.name) }, text = { LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { ExerciseMotionPlayer(exercise.imageUrls, exercise.name, Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(18.dp))) }
            item { Text("${exercise.primaryMuscles.joinToString()} • ${exercise.equipment}", color = HedefitColors.Lime) }
            item { Text(if (en) "How to perform" else "Nasıl yapılır?", style = MaterialTheme.typography.titleMedium) }
            items(exercise.instructions.size) { index -> Text("${index + 1}. ${exercise.instructions[index]}") }
        } }, dismissButton = { TextButton(onClick = { selected = null }) { Text(if (en) "Close" else "Kapat") } }, confirmButton = { Button(onClick = { onUse(exercise); selected = null }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "Add to program" else "Programda kullan") } })
    }
    if (showCustom) CustomExerciseDialog(onDismiss = { showCustom = false }) { exercise -> onUse(exercise); showCustom = false }
}

@Composable
private fun FilterSection(title: String, options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(options) { (value, label) -> FilterChip(selected == value, { onSelect(value) }, label = { Text(label) }) } }
    }
}

@Composable
private fun CustomExerciseDialog(onDismiss: () -> Unit, onCreate: (ExerciseCatalogData) -> Unit) {
    var name by remember { mutableStateOf("") }
    var muscle by remember { mutableStateOf("") }
    var equipment by remember { mutableStateOf("") }
    var instruction by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Özel hareket") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            OutlinedTextField(name, { name = it }, label = { Text("Hareket adı") }, singleLine = true)
            OutlinedTextField(muscle, { muscle = it }, label = { Text("Kas grubu") }, singleLine = true)
            OutlinedTextField(equipment, { equipment = it }, label = { Text("Ekipman") }, singleLine = true)
            OutlinedTextField(instruction, { instruction = it }, label = { Text("Uygulama notu") })
        } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Vazgeç") } },
        confirmButton = { Button(enabled = name.trim().length >= 2, onClick = { onCreate(ExerciseCatalogData("custom-${UUID.randomUUID()}", name.trim(), "custom", equipment.trim(), listOf(muscle.trim().ifBlank { "Tüm Vücut" }), listOf(instruction.trim()).filter(String::isNotBlank), "custom", emptyList())) }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text("Programa ekle") } },
    )
}
