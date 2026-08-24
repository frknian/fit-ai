package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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

@OptIn(ExperimentalMaterial3Api::class)
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
    val activeFilterCount = listOf(muscle, equipment, level, environment, force, mechanic, category).count(String::isNotBlank)
    val clearFilters = {
        muscle = ""; equipment = ""; level = ""; environment = ""; muscleRole = ""; force = ""; mechanic = ""; category = ""
        onSearch(query, "", "", "", "", "", "", "", "")
    }
    Column(Modifier.fillMaxSize().background(HedefitColors.Background).statusBarsPadding().navigationBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().padding(start = 6.dp, end = 12.dp, top = 8.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, if (en) "Back" else "Geri", tint = HedefitColors.TextPrimary) }
            OutlinedTextField(
                query,
                { query = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text(if (en) "Search movements" else "Hareket ara") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                trailingIcon = { IconButton(onClick = { onSearch(query, muscle, equipment, level, environment, muscleRole, force, mechanic, category) }) { Icon(Icons.Default.Search, if (en) "Search" else "Ara") } },
                singleLine = true,
                shape = RoundedCornerShape(18.dp),
            )
            IconButton(onClick = { showCustom = true }) { Icon(Icons.Default.Add, if (en) "Custom movement" else "Özel hareket", tint = HedefitColors.Lime) }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(
                onClick = { showFilters = true },
                colors = ButtonDefaults.buttonColors(containerColor = if (activeFilterCount > 0) HedefitColors.Lime else HedefitColors.Surface, contentColor = if (activeFilterCount > 0) HedefitColors.OnLime else HedefitColors.TextPrimary),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 9.dp),
            ) {
                Icon(Icons.Default.FilterList, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(if (activeFilterCount > 0) (if (en) "Filter · $activeFilterCount" else "Filtre · $activeFilterCount") else if (en) "Filter" else "Filtre")
            }
            Text(if (loading) (if (en) "Loading…" else "Yükleniyor…") else if (en) "${items.size} results" else "${items.size} sonuç", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.weight(1f))
            if (activeFilterCount > 0) TextButton(onClick = clearFilters) { Text(if (en) "Clear" else "Temizle") }
        }
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = HedefitColors.Lime)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(items, key = { it.id }) { item ->
                HedefitCard(Modifier.fillMaxWidth(), onClick = { selected = item }) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        ExerciseMedia(item.imageUrls.firstOrNull(), item.name, Modifier.size(64.dp).clip(RoundedCornerShape(14.dp)))
                        Column(Modifier.weight(1f)) {
                            Text(item.name, style = MaterialTheme.typography.titleMedium)
                            Text(
                                (if (en) "Main: " else "Ana: ") + item.primaryMuscles.joinToString(),
                                color = HedefitColors.TextSecondary,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            if (item.secondaryMuscles.isNotEmpty()) Text(
                                (if (en) "Supporting: " else "Yardımcı: ") + item.secondaryMuscles.joinToString(),
                                color = HedefitColors.TextSecondary.copy(alpha = .78f),
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                            )
                        }
                        Text(item.level, color = HedefitColors.Lime, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
    if (showFilters) ModalBottomSheet(onDismissRequest = { showFilters = false }, containerColor = HedefitColors.Surface) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp).padding(bottom = 18.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(if (en) "Narrow results" else "Sonuçları daralt", style = MaterialTheme.typography.titleLarge)
                    Text(if (en) "Choose only what matters" else "Yalnızca ihtiyacın olanı seç", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                }
                if (activeFilterCount > 0) TextButton(onClick = clearFilters) { Text(if (en) "Reset" else "Sıfırla") }
            }
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 560.dp), contentPadding = PaddingValues(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { FilterSection(if (en) "Place" else "Ortam", environmentOptions(en), environment) { environment = it } }
                item { FilterSection(if (en) "Target muscle" else "Hedef kas", muscleOptions(en), muscle) { muscle = it; muscleRole = if (it.isBlank()) "" else "primary" } }
                if (muscle.isNotBlank()) item { FilterSection(if (en) "Muscle role" else "Kasın rolü", muscleRoleOptions(en), muscleRole) { muscleRole = it } }
                item { FilterSection(if (en) "Training type" else "Antrenman türü", categoryOptions(en), category) { category = it } }
                item { HorizontalDivider(color = HedefitColors.Divider) }
                item { Text(if (en) "More precise" else "Daha seçici", color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge) }
                item { FilterSection(if (en) "Level" else "Seviye", levelOptions(en), level) { level = it } }
                item { FilterSection(if (en) "Equipment" else "Ekipman", equipmentOptions(en), equipment) { equipment = it } }
                item { FilterSection(if (en) "Movement" else "Hareket yönü", forceOptions(en), force) { force = it } }
                item { FilterSection(if (en) "Structure" else "Yapı", mechanicOptions(en), mechanic) { mechanic = it } }
            }
            Button(
                onClick = { onSearch(query, muscle, equipment, level, environment, muscleRole, force, mechanic, category); showFilters = false },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime),
            ) { Text(if (en) "Show matching movements" else "Uygun hareketleri göster") }
        }
    }
    selected?.let { exercise ->
        AlertDialog(onDismissRequest = { selected = null }, title = { Text(exercise.name) }, text = { LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { ExerciseMotionPlayer(exercise.imageUrls, exercise.name, Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(18.dp))) }
            item { MuscleConnections(exercise, en) }
            item { Text(if (en) "How to perform" else "Nasıl yapılır?", style = MaterialTheme.typography.titleMedium) }
            items(exercise.instructions.size) { index -> Text("${index + 1}. ${exercise.instructions[index]}") }
        } }, dismissButton = { TextButton(onClick = { selected = null }) { Text(if (en) "Close" else "Kapat") } }, confirmButton = { Button(onClick = { onUse(exercise); selected = null }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "Add to program" else "Programda kullan") } })
    }
    if (showCustom) CustomExerciseDialog(onDismiss = { showCustom = false }) { exercise -> onUse(exercise); showCustom = false }
}

private fun environmentOptions(en: Boolean) = listOf(
    "" to if (en) "Any" else "Tümü",
    "gym" to if (en) "Gym" else "Spor salonu",
    "home" to if (en) "Home" else "Ev",
)

private fun muscleRoleOptions(en: Boolean) = listOf(
    "primary" to if (en) "Main target" else "Ana hedef",
    "secondary" to if (en) "Supporting" else "Yardımcı",
    "" to if (en) "Either" else "Her ikisi",
)

private fun categoryOptions(en: Boolean) = listOf(
    "" to if (en) "All" else "Tümü",
    "strength" to if (en) "Strength" else "Kuvvet",
    "stretching" to if (en) "Mobility" else "Mobilite",
    "plyometrics" to if (en) "Explosive" else "Patlayıcı",
    "cardio" to if (en) "Cardio" else "Kardiyo",
)

private fun levelOptions(en: Boolean) = listOf(
    "" to if (en) "All" else "Tümü",
    "beginner" to if (en) "Easy" else "Kolay",
    "intermediate" to if (en) "Medium" else "Orta",
    "expert" to if (en) "Advanced" else "İleri",
)

private fun equipmentOptions(en: Boolean) = listOf(
    "" to if (en) "All" else "Tümü",
    "body only" to if (en) "Bodyweight" else "Vücut ağırlığı",
    "dumbbell" to if (en) "Dumbbell" else "Dambıl",
    "barbell" to if (en) "Barbell" else "Halter",
    "machine" to if (en) "Machine" else "Makine",
    "cable" to if (en) "Cable" else "Kablo",
    "bands" to if (en) "Band" else "Direnç bandı",
    "kettlebells" to "Kettlebell",
)

private fun forceOptions(en: Boolean) = listOf(
    "" to if (en) "All" else "Tümü",
    "push" to if (en) "Push" else "İtiş",
    "pull" to if (en) "Pull" else "Çekiş",
    "static" to if (en) "Static" else "Statik",
)

private fun mechanicOptions(en: Boolean) = listOf(
    "" to if (en) "All" else "Tümü",
    "compound" to if (en) "Compound" else "Bileşik",
    "isolation" to if (en) "Isolation" else "İzolasyon",
)

private fun muscleOptions(en: Boolean) = if (en) listOf(
    "" to "All", "arms" to "Arms · all", "back" to "Back · all", "legs" to "Legs · all", "core" to "Core · all", "hips" to "Hips · all", "chest" to "Chest", "lats" to "Lats", "middle back" to "Mid back", "lower back" to "Lower back", "traps" to "Traps", "neck" to "Neck",
    "shoulders" to "Shoulders", "biceps" to "Front arm · biceps", "triceps" to "Back arm · triceps", "forearms" to "Forearm & wrist", "abdominals" to "Abs",
    "glutes" to "Glutes", "quadriceps" to "Front thigh · quads", "hamstrings" to "Back thigh · hamstrings", "calves" to "Calves", "adductors" to "Inner thigh · adductors", "abductors" to "Outer hip · abductors",
) else listOf(
    "" to "Tümü", "arms" to "Kollar · tümü", "back" to "Sırt · tümü", "legs" to "Bacaklar · tümü", "core" to "Merkez bölge · tümü", "hips" to "Kalça çevresi · tümü", "chest" to "Göğüs", "lats" to "Kanat sırtı (lat)", "middle back" to "Orta sırt (romboid)", "lower back" to "Bel (erektör spinae)", "traps" to "Trapez", "neck" to "Boyun",
    "shoulders" to "Omuz (deltoid)", "biceps" to "Ön kol (biseps)", "triceps" to "Arka kol (triseps)", "forearms" to "Bilek ve ön kol", "abdominals" to "Karın",
    "glutes" to "Kalça (gluteal)", "quadriceps" to "Ön uyluk (kuadriseps)", "hamstrings" to "Arka uyluk (hamstring)", "calves" to "Baldır", "adductors" to "İç uyluk (addüktör)", "abductors" to "Dış kalça (abdüktör)",
)

@Composable
private fun MuscleConnections(exercise: ExerciseCatalogData, en: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(if (en) "Muscles involved" else "Çalışan kas grupları", style = MaterialTheme.typography.titleMedium)
        Text(
            (if (en) "Main target · " else "Ana hedef · ") + exercise.primaryMuscles.joinToString(),
            color = HedefitColors.Lime,
            style = MaterialTheme.typography.bodyMedium,
        )
        Text(
            if (exercise.secondaryMuscles.isEmpty()) {
                if (en) "Supporting muscles · No additional group listed" else "Yardımcı kaslar · Ek grup belirtilmemiş"
            } else {
                (if (en) "Supporting muscles · " else "Yardımcı kaslar · ") + exercise.secondaryMuscles.joinToString()
            },
            color = HedefitColors.TextSecondary,
            style = MaterialTheme.typography.bodySmall,
        )
        Text(exercise.equipment.ifBlank { if (en) "No equipment" else "Ekipmansız" }, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium)
    }
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
