package com.hedefit.app.ui.screens

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.EditCalendar
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Whatshot
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hedefit.app.R
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.OutlineAction
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.components.ProgressRing
import com.hedefit.app.ui.components.ScreenContainer
import com.hedefit.app.ui.components.SectionTitle
import com.hedefit.app.ui.components.ExerciseMedia
import com.hedefit.app.ui.components.ExerciseMotionPlayer
import com.hedefit.app.ui.model.ExerciseUi
import com.hedefit.app.ui.model.WorkoutDayUi
import com.hedefit.app.ui.model.weeklyWorkouts
import com.hedefit.app.ui.theme.HedefitColors
import com.hedefit.app.ui.state.prescribedStartingReps
import com.hedefit.app.ui.state.canFinishWorkout
import com.hedefit.app.ui.state.savedWorkoutSet
import com.hedefit.app.ui.state.toSavedWorkoutSet
import com.hedefit.app.ui.state.validateWorkoutReps
import com.hedefit.app.ui.state.validateWorkoutRest
import com.hedefit.app.ui.state.validateWorkoutSets
import com.hedefit.app.data.model.WorkoutExerciseData
import com.hedefit.app.data.model.WorkoutSetInput
import com.hedefit.app.data.model.WorkoutFeedbackData
import com.hedefit.app.data.model.PreviousSetData
import com.hedefit.app.data.model.WorkoutProgramData
import com.hedefit.app.data.model.ExerciseCatalogData
import kotlinx.coroutines.delay
import kotlin.math.ceil
import java.util.Locale

@Composable
fun WorkoutPlanScreen(
    padding: PaddingValues,
    expanded: Boolean,
    workouts: List<WorkoutExerciseData>,
    programs: List<WorkoutProgramData>,
    regionalExercises: List<ExerciseCatalogData>,
    regionalLoading: Boolean,
    loading: Boolean,
    generating: Boolean,
    onGeneratePlan: () -> Unit,
    onStartWorkout: () -> Unit,
    onOpenLibrary: () -> Unit,
    onGenerateRegional: (String, String) -> Unit,
    onLoadRegional: (String) -> Unit,
    onCreateOwnPlan: (String) -> Unit,
    onSelectProgram: (WorkoutProgramData) -> Unit,
    onRemoveProgram: (WorkoutProgramData) -> Unit,
    onUpdateExercise: (WorkoutExerciseData) -> Unit,
    onReplaceExercise: (String, WorkoutExerciseData) -> Unit,
    onRemoveExercise: (String) -> Unit,
    onMoveExercise: (String, Int) -> Unit,
    onLoadReplacementOptions: (WorkoutExerciseData) -> Unit,
    language: String = "tr",
) {
    val en = language == "en"
    var showRegional by remember { mutableStateOf(false) }
    var selectedRegional by remember { mutableStateOf<Pair<String, String>?>(null) }
    var showCustomName by remember { mutableStateOf(false) }
    var removingProgram by remember { mutableStateOf<WorkoutProgramData?>(null) }
    var editingExercise by remember { mutableStateOf<WorkoutExerciseData?>(null) }
    var previewExercise by remember { mutableStateOf<WorkoutExerciseData?>(null) }
    var replacingExercise by remember { mutableStateOf<WorkoutExerciseData?>(null) }
    val activeProgram = programs.firstOrNull { it.isActive }
    if (showRegional) {
        BackHandler {
            if (selectedRegional != null) selectedRegional = null else showRegional = false
        }
        RegionalProgramBrowser(
            padding = padding,
            en = en,
            selectedRegion = selectedRegional,
            exercises = regionalExercises,
            loading = regionalLoading,
            onBack = { if (selectedRegional != null) selectedRegional = null else showRegional = false },
            onSelectRegion = { region -> selectedRegional = region; onLoadRegional(region.first) },
            onCreateProgram = { muscle, label -> onGenerateRegional(muscle, label); showRegional = false; selectedRegional = null },
        )
        return
    }
    ScreenContainer(padding) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 16.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item { Text(if (en) "My Workout" else "Antrenmanım", style = MaterialTheme.typography.headlineMedium) }
            item {
                HedefitCard(Modifier.fillMaxWidth(), onClick = onOpenLibrary) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Box(Modifier.size(56.dp).background(HedefitColors.Lime, RoundedCornerShape(17.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Default.MenuBook, null, tint = HedefitColors.OnLime, modifier = Modifier.size(30.dp)) }
                        Column(Modifier.weight(1f)) { Text(if (en) "Movement Atlas" else "Hareket Atlası", style = MaterialTheme.typography.titleLarge); Text(if (en) "Illustrations • technique • professional filters" else "Görsel • teknik anlatım • profesyonel filtreler", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                        Icon(Icons.Default.KeyboardArrowRight, null, tint = HedefitColors.Lime)
                    }
                }
            }
            item { SectionTitle(if (en) "Create a program" else "Program oluştur") }
            item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ProgramTypeTile(Icons.Default.FitnessCenter, if (en) "Body part" else "Bölgesel", HedefitColors.Lime, Modifier.weight(1f)) { showRegional = true }
                ProgramTypeTile(Icons.Default.Person, if (en) "My own" else "Kendim", HedefitColors.Sleep, Modifier.weight(1f)) { showCustomName = true }
                ProgramTypeTile(Icons.Default.AutoAwesome, if (en) "Fit Coach" else "Fit Koç", HedefitColors.Warning, Modifier.weight(1f), if (generating) ({}) else onGeneratePlan)
            } }
            if (programs.isNotEmpty()) {
                item { SectionTitle(if (en) "My programs" else "Programlarım") }
                item { LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(end = 18.dp)) {
                    items(programs, key = { it.id }) { program -> ProgramCollectionCard(program, en, { onSelectProgram(program) }) { removingProgram = program } }
                } }
            }
            if (loading && workouts.isEmpty()) item { Text(if (en) "Loading your program…" else "Programın yükleniyor…", color = HedefitColors.TextSecondary) }
            else if (workouts.isEmpty()) item {
                HedefitCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(if (en) "No saved program yet" else "Henüz kayıtlı program yok", style = MaterialTheme.typography.titleLarge)
                        Text(if (en) "Start with a body-part, custom, or Fit Coach program above." else "Yukarıdan bölgesel, kendi programın veya Fit Koç seçeneğiyle başlayabilirsin.", color = HedefitColors.TextSecondary)
                    }
                }
            }
            if (workouts.isNotEmpty()) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { Text(activeProgram?.let { programDisplayName(it, en) } ?: workouts.first().area, color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge); Text(if (en) "${workouts.size} movement program" else "${workouts.size} hareketlik program", style = MaterialTheme.typography.titleLarge) }
                        TextButton(onClick = { showRegional = true }) { Text(if (en) "Change area" else "Bölgeyi değiştir") }
                    }
                }
                items(workouts, key = { it.id }) { exercise ->
                    EditableProgramRow(
                        exercise = exercise,
                        en = en,
                        onPreview = { previewExercise = exercise },
                        onEdit = { editingExercise = exercise },
                        onSetCountChange = { count -> onUpdateExercise(exercise.copy(sets = count)) },
                    )
                }
                item { PrimaryButton(if (en) "Start workout" else "Antrenmanı başlat", onStartWorkout, icon = Icons.Default.PlayArrow) }
            }
        }
    }
    if (showCustomName) CustomProgramNameDialog(en, { showCustomName = false }) { name -> showCustomName = false; onCreateOwnPlan(name) }
    removingProgram?.let { program ->
        AlertDialog(
            onDismissRequest = { removingProgram = null },
            title = { Text(if (en) "Remove program?" else "Program kaldırılsın mı?") },
            text = { Text(if (en) "${programDisplayName(program, en)} will be removed. Completed workout records stay safe." else "${programDisplayName(program, en)} kaldırılacak. Tamamlanmış antrenman kayıtların korunur.") },
            dismissButton = { TextButton(onClick = { removingProgram = null }) { Text(if (en) "Cancel" else "Vazgeç") } },
            confirmButton = { Button(onClick = { onRemoveProgram(program); removingProgram = null }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Coral, contentColor = Color.White)) { Text(if (en) "Remove" else "Kaldır") } },
        )
    }
    editingExercise?.let { exercise ->
        val index = workouts.indexOfFirst { it.id == exercise.id }
        WorkoutExerciseEditorDialog(
            exercise, en, index > 0, index in 0 until workouts.lastIndex,
            onDismiss = { editingExercise = null },
            onMove = { onMoveExercise(exercise.id, it); editingExercise = null },
            onRemove = { onRemoveExercise(exercise.id); editingExercise = null },
            onReplace = { replacingExercise = exercise; editingExercise = null; onLoadReplacementOptions(exercise) },
        ) { onUpdateExercise(it); editingExercise = null }
    }
    replacingExercise?.let { exercise ->
        ExerciseReplacementDialog(
            exercise = exercise,
            candidates = regionalExercises.filter { it.id != exercise.id }.take(24),
            loading = regionalLoading,
            en = en,
            onDismiss = { replacingExercise = null },
            onReplace = { selected ->
                onReplaceExercise(exercise.id, exercise.copy(id = selected.id, name = selected.name, area = selected.primaryMuscles.firstOrNull() ?: exercise.area))
                replacingExercise = null
            },
        )
    }
    previewExercise?.let { exercise ->
        AlertDialog(
            onDismissRequest = { previewExercise = null },
            title = { Text(exercise.name) },
            text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ExerciseMotionPlayer(
                    listOf("/exercise-images/${exercise.id}/0.jpg", "/exercise-images/${exercise.id}/1.jpg"),
                    exercise.name,
                    Modifier.fillMaxWidth().height(250.dp).clip(RoundedCornerShape(18.dp)),
                )
                Text(if (en) "Watch the full movement path before starting. Keep the motion controlled and stop if you feel sharp pain." else "Başlamadan önce hareket yolunu izle. Hareketi kontrollü uygula; keskin ağrı hissedersen dur.", color = HedefitColors.TextSecondary)
            } },
            confirmButton = { TextButton(onClick = { previewExercise = null }) { Text(if (en) "Close" else "Kapat") } },
        )
    }
}

@Composable
private fun ProgramTypeTile(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    HedefitCard(modifier.height(108.dp), onClick = onClick, contentPadding = PaddingValues(13.dp)) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
            Box(Modifier.size(42.dp).background(tint.copy(alpha = .16f), CircleShape), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint) }
            Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
private fun ProgramCollectionCard(program: WorkoutProgramData, en: Boolean, onClick: () -> Unit, onRemove: () -> Unit) {
    val tint = when (program.source) { "regional" -> HedefitColors.Lime; "assessment" -> HedefitColors.Warning; else -> HedefitColors.Sleep }
    HedefitCard(Modifier.width(210.dp).height(132.dp), onClick = onClick) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically) { Text(when (program.source) { "regional" -> if (en) "BODY PART" else "BÖLGESEL"; "assessment" -> if (en) "FIT COACH" else "FİT KOÇ"; else -> if (en) "CUSTOM" else "KENDİM" }, color = tint, style = MaterialTheme.typography.labelMedium); Spacer(Modifier.weight(1f)); if (program.isActive) Box(Modifier.size(9.dp).background(HedefitColors.Lime, CircleShape)); IconButton(onClick = onRemove, modifier = Modifier.size(34.dp)) { Icon(Icons.Default.DeleteOutline, if (en) "Remove program" else "Programı kaldır", tint = HedefitColors.TextSecondary, modifier = Modifier.size(19.dp)) } }
            Column { Text(programDisplayName(program, en), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium); Text(if (en) "${program.exercises.size} movements" else "${program.exercises.size} hareket", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

private fun programDisplayName(program: WorkoutProgramData, en: Boolean) =
    if (program.source == "assessment") (if (en) "Fit Coach Program" else "Fit Koç Programı") else program.name

@Composable
private fun CustomProgramNameDialog(en: Boolean, onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (en) "Name your program" else "Programına isim ver") }, text = { OutlinedTextField(name, { name = it.take(80) }, label = { Text(if (en) "Program name" else "Program adı") }, placeholder = { Text(if (en) "Push Day" else "Push Günü") }, singleLine = true) }, dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } }, confirmButton = { Button(enabled = name.trim().length >= 2, onClick = { onCreate(name.trim()) }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "Create" else "Oluştur") } })
}

@Composable
private fun EditableProgramRow(exercise: WorkoutExerciseData, en: Boolean, onPreview: () -> Unit, onEdit: () -> Unit, onSetCountChange: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        ExerciseMedia("/exercise-images/${exercise.id}/0.jpg", exercise.name, Modifier.size(68.dp).clip(RoundedCornerShape(18.dp)).clickable(onClick = onPreview))
        Column(Modifier.weight(1f).clickable(onClick = onPreview)) {
            Text(exercise.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
            Text("${exercise.reps} ${if (en) "reps" else "tekrar"} • ${exercise.restSeconds} ${if (en) "sec rest" else "sn dinlenme"}", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
        }
        Row(Modifier.background(HedefitColors.SurfaceHigh, RoundedCornerShape(14.dp)), verticalAlignment = Alignment.CenterVertically) {
            IconButton(enabled = exercise.sets > 1, onClick = { onSetCountChange((exercise.sets - 1).coerceAtLeast(1)) }, modifier = Modifier.size(34.dp)) {
                Icon(Icons.Default.Remove, if (en) "Decrease sets" else "Set azalt", modifier = Modifier.size(18.dp))
            }
            Text("${exercise.sets}", color = HedefitColors.Lime, fontWeight = FontWeight.Black)
            IconButton(enabled = exercise.sets < 10, onClick = { onSetCountChange((exercise.sets + 1).coerceAtMost(10)) }, modifier = Modifier.size(34.dp)) {
                Icon(Icons.Default.Add, if (en) "Increase sets" else "Set artır", modifier = Modifier.size(18.dp))
            }
        }
        IconButton(onClick = onEdit, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.MoreVert, if (en) "Edit" else "Düzenle", tint = HedefitColors.TextSecondary) }
    }
}

@Composable
private fun WorkoutExerciseEditorDialog(exercise: WorkoutExerciseData, en: Boolean, canMoveUp: Boolean, canMoveDown: Boolean, onDismiss: () -> Unit, onMove: (Int) -> Unit, onRemove: () -> Unit, onReplace: () -> Unit, onSave: (WorkoutExerciseData) -> Unit) {
    var sets by remember(exercise) { mutableStateOf(exercise.sets.toString()) }
    var reps by remember(exercise) { mutableStateOf(exercise.reps) }
    var rest by remember(exercise) { mutableStateOf(exercise.restSeconds.toString()) }
    var submitted by remember(exercise) { mutableStateOf(false) }
    val setsError = if (submitted) validateWorkoutSets(sets) else null
    val repsError = if (submitted) validateWorkoutReps(reps) else null
    val restError = if (submitted) validateWorkoutRest(rest) else null
    AlertDialog(onDismissRequest = onDismiss, title = { Text(exercise.name) }, text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(sets, { sets = it.filter(Char::isDigit).take(2) }, label = { Text(if (en) "Sets" else "Set") }, singleLine = true, isError = setsError != null, supportingText = setsError?.let { ({ Text(if (en) "Sets must be between 1 and 10." else it) }) })
        OutlinedTextField(reps, { reps = it.take(12) }, label = { Text(if (en) "Reps" else "Tekrar") }, singleLine = true, isError = repsError != null, supportingText = repsError?.let { ({ Text(if (en) "Enter a repetition target." else it) }) })
        OutlinedTextField(rest, { rest = it.filter(Char::isDigit).take(3) }, label = { Text(if (en) "Rest (seconds)" else "Dinlenme (saniye)") }, singleLine = true, isError = restError != null, supportingText = restError?.let { ({ Text(if (en) "Rest must be between 15 and 300 seconds." else it) }) })
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            IconButton(enabled = canMoveUp, onClick = { onMove(-1) }) { Icon(Icons.Default.KeyboardArrowUp, if (en) "Move up" else "Yukarı taşı", tint = HedefitColors.Lime) }
            IconButton(enabled = canMoveDown, onClick = { onMove(1) }) { Icon(Icons.Default.KeyboardArrowDown, if (en) "Move down" else "Aşağı taşı", tint = HedefitColors.Lime) }
            IconButton(onClick = onRemove) { Icon(Icons.Default.DeleteOutline, if (en) "Remove" else "Programdan çıkar", tint = HedefitColors.Coral) }
        }
        TextButton(onClick = onReplace) { Text(if (en) "Replace movement" else "Hareketi değiştir", color = HedefitColors.Lime) }
    } }, dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } }, confirmButton = { Button(onClick = {
        submitted = true
        if (validateWorkoutSets(sets) == null && validateWorkoutReps(reps) == null && validateWorkoutRest(rest) == null) {
            onSave(exercise.copy(sets = requireNotNull(sets.toIntOrNull()), reps = reps.trim(), restSeconds = requireNotNull(rest.toIntOrNull())))
        }
    }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "Save" else "Kaydet") } })
}

@Composable
private fun ExerciseReplacementDialog(exercise: WorkoutExerciseData, candidates: List<ExerciseCatalogData>, loading: Boolean, en: Boolean, onDismiss: () -> Unit, onReplace: (ExerciseCatalogData) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (en) "Same-muscle alternatives" else "Aynı bölge için alternatif hareketler") },
        text = {
            if (loading) Text(if (en) "Loading matching movements…" else "Uygun hareketler yükleniyor…")
            else if (candidates.isEmpty()) Text(if (en) "No same-muscle alternative was found." else "Bu bölge için alternatif hareket bulunamadı.")
            else LazyColumn(Modifier.height(330.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(candidates, key = { it.id }) { candidate ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onReplace(candidate) }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        ExerciseMedia(candidate.imageUrls.firstOrNull(), candidate.name, Modifier.size(46.dp).clip(RoundedCornerShape(12.dp)))
                        Column(Modifier.weight(1f)) {
                            Text(candidate.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge)
                            Text(candidate.equipment, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(if (en) "Close" else "Kapat") } },
    )
}

@Composable
private fun RegionalProgramBrowser(
    padding: PaddingValues,
    en: Boolean,
    selectedRegion: Pair<String, String>?,
    exercises: List<ExerciseCatalogData>,
    loading: Boolean,
    onBack: () -> Unit,
    onSelectRegion: (Pair<String, String>) -> Unit,
    onCreateProgram: (String, String) -> Unit,
) {
    val regions = regionalMuscleRegions(en)
    var selectedExercise by remember { mutableStateOf<ExerciseCatalogData?>(null) }
    ScreenContainer(padding) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { UtilityHeader(selectedRegion?.second ?: if (en) "Body-part atlas" else "Bölgesel hareketler", onBack) }
            if (selectedRegion == null) {
                item { Text(if (en) "Choose a region." else "Bir bölge seç.", color = HedefitColors.TextSecondary) }
                items(regions.chunked(2)) { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { region ->
                            HedefitCard(Modifier.weight(1f).height(104.dp), onClick = { onSelectRegion(region.key to region.label) }) {
                                Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
                                    Box(Modifier.size(36.dp).background(HedefitColors.Lime.copy(alpha = .14f), CircleShape), contentAlignment = Alignment.Center) { Text(region.emoji, style = MaterialTheme.typography.titleMedium) }
                                    Text(region.label, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            } else {
                item {
                    HedefitCard(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Column(Modifier.weight(1f)) {
                                Text(if (loading) (if (en) "Loading movements…" else "Hareketler yükleniyor…") else if (en) "${exercises.size} movements" else "${exercises.size} hareket", style = MaterialTheme.typography.titleLarge)
                            }
                            if (loading) androidx.compose.material3.CircularProgressIndicator(Modifier.size(28.dp), color = HedefitColors.Lime, strokeWidth = 3.dp)
                        }
                    }
                }
                if (!loading && exercises.isNotEmpty()) item { PrimaryButton(if (en) "Create ${selectedRegion.second} program" else "${selectedRegion.second} programı oluştur", { onCreateProgram(selectedRegion.first, selectedRegion.second) }, icon = Icons.Default.Add) }
                if (!loading && exercises.isEmpty()) item { Text(if (en) "No movement was found for this region." else "Bu bölge için hareket bulunamadı.", color = HedefitColors.TextSecondary) }
                items(exercises, key = { it.id }) { exercise ->
                    HedefitCard(Modifier.fillMaxWidth(), onClick = { selectedExercise = exercise }) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            ExerciseMedia(exercise.imageUrls.firstOrNull(), exercise.name, Modifier.size(68.dp).clip(RoundedCornerShape(16.dp)))
                            Column(Modifier.weight(1f)) {
                                Text(exercise.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
                                Text(exercise.equipment, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
    }
    selectedExercise?.let { exercise ->
        AlertDialog(
            onDismissRequest = { selectedExercise = null },
            title = { Text(exercise.name) },
            text = { LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { ExerciseMotionPlayer(exercise.imageUrls, exercise.name, Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(18.dp))) }
                item { Text(if (en) "How to perform" else "Nasıl yapılır?", style = MaterialTheme.typography.titleMedium) }
                items(exercise.instructions.take(3).size) { index -> Text("${index + 1}. ${exercise.instructions[index]}") }
            } },
            confirmButton = { TextButton(onClick = { selectedExercise = null }) { Text(if (en) "Close" else "Kapat") } },
        )
    }
}

private data class MuscleRegion(val key: String, val label: String, val emoji: String)

/** The 17 distinct muscles stored in exercises.json, plus the useful aggregate back entry. */
private fun regionalMuscleRegions(en: Boolean) = if (en) listOf(
    MuscleRegion("chest", "Chest", "🫁"), MuscleRegion("back", "Back", "🧍"), MuscleRegion("lats", "Lats", "🤸"), MuscleRegion("traps", "Traps", "🙆"), MuscleRegion("neck", "Neck", "🙋"), MuscleRegion("shoulders", "Shoulders", "🤷"), MuscleRegion("biceps", "Front arm", "💪"), MuscleRegion("triceps", "Back arm", "🦾"), MuscleRegion("forearms", "Wrist", "✋"), MuscleRegion("abdominals", "Abs", "🧘"), MuscleRegion("legs", "Leg", "🦵"), MuscleRegion("glutes", "Hip", "🧍‍♀️"), MuscleRegion("calves", "Calf", "🦿"), MuscleRegion("abductors", "Outer hip", "🕺"),
) else listOf(
    MuscleRegion("chest", "Göğüs", "🫁"), MuscleRegion("back", "Sırt", "🧍"), MuscleRegion("lats", "Kanat", "🤸"), MuscleRegion("traps", "Trapez", "🙆"), MuscleRegion("neck", "Boyun", "🙋"), MuscleRegion("shoulders", "Omuz", "🤷"), MuscleRegion("biceps", "Ön kol", "💪"), MuscleRegion("triceps", "Arka kol", "🦾"), MuscleRegion("forearms", "Bilek", "✋"), MuscleRegion("abdominals", "Karın", "🧘"), MuscleRegion("legs", "Bacak", "🦵"), MuscleRegion("glutes", "Kalça", "🧍‍♀️"), MuscleRegion("calves", "Baldır", "🦿"), MuscleRegion("abductors", "Dış kalça", "🕺"),
)

@Composable
private fun WeekStrip() {
    val days = listOf("PZT" to "12", "SAL" to "13", "ÇAR" to "14", "PER" to "15", "CUM" to "16", "CMT" to "17", "PZR" to "18")
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(days) { (day, date) ->
            val selected = day == "PZT"
            Column(
                Modifier.width(52.dp).clip(RoundedCornerShape(13.dp))
                    .background(if (selected) HedefitColors.Lime else HedefitColors.Surface)
                    .clickable { }.padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(day, color = if (selected) HedefitColors.OnLime else HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium)
                Text(date, color = if (selected) HedefitColors.OnLime else HedefitColors.TextPrimary, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun WorkoutDayCard(workout: WorkoutDayUi, onStartWorkout: () -> Unit, modifier: Modifier = Modifier, compact: Boolean = false) {
    HedefitCard(modifier.fillMaxWidth(), onClick = onStartWorkout) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(workout.day, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodyMedium)
                    Text(workout.title, style = MaterialTheme.typography.headlineSmall)
                }
                Text("%${(workout.progress * 100).toInt()}", color = HedefitColors.Lime, fontWeight = FontWeight.Bold)
            }
            LinearProgressIndicator(
                progress = { workout.progress },
                modifier = Modifier.fillMaxWidth().height(5.dp).clip(CircleShape),
                color = HedefitColors.Lime,
                trackColor = HedefitColors.Divider,
            )
            if (compact) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    workout.exercises.forEach { ExerciseRow(it) }
                }
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    items(workout.exercises) { exercise -> ExercisePreview(exercise) }
                }
            }
        }
    }
}

@Composable
private fun ExercisePreview(exercise: ExerciseUi) {
    Column(Modifier.width(116.dp)) {
        Image(
            painterResource(exercise.image),
            contentDescription = exercise.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().height(78.dp).clip(RoundedCornerShape(11.dp)),
        )
        Spacer(Modifier.height(6.dp))
        Text(exercise.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelLarge)
        Text(exercise.prescription, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun ExerciseRow(exercise: ExerciseUi) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Image(
            painterResource(exercise.image), exercise.name, contentScale = ContentScale.Crop,
            modifier = Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)),
        )
        Column(Modifier.weight(1f)) {
            Text(exercise.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelLarge)
            Text(exercise.prescription, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun ActiveWorkoutScreen(
    onBack: () -> Unit,
    exercises: List<WorkoutExerciseData>,
    previousPerformance: Map<String, List<PreviousSetData>>,
    saving: Boolean,
    language: String = "tr",
    onFinish: (durationSeconds: Int, calories: Int, sets: List<WorkoutSetInput>, feedback: WorkoutFeedbackData) -> Unit,
) {
    val en = language == "en"
    val context = LocalContext.current
    var paused by rememberSaveable { mutableStateOf(false) }
    var prepared by rememberSaveable { mutableStateOf(false) }
    var weight by rememberSaveable { mutableIntStateOf(0) }
    var weightTouched by rememberSaveable { mutableStateOf(false) }
    var reps by rememberSaveable { mutableIntStateOf(prescribedStartingReps(exercises.firstOrNull()?.reps)) }
    var rpe by rememberSaveable { mutableIntStateOf(7) }
    var setType by rememberSaveable { mutableStateOf("normal") }
    var note by rememberSaveable { mutableStateOf("") }
    var exerciseIndex by rememberSaveable { mutableIntStateOf(0) }
    var currentSet by rememberSaveable { mutableIntStateOf(1) }
    var restSeconds by rememberSaveable { mutableIntStateOf(0) }
    var timerSeconds by rememberSaveable { mutableIntStateOf(0) }
    var timerRunning by rememberSaveable { mutableStateOf(false) }
    val startedAt by rememberSaveable { mutableLongStateOf(System.currentTimeMillis()) }
    var showFeedback by rememberSaveable { mutableStateOf(false) }
    var showNoSetsWarning by rememberSaveable { mutableStateOf(false) }
    var showExitConfirmation by rememberSaveable { mutableStateOf(false) }
    var personalRecord by rememberSaveable { mutableStateOf(false) }
    var completedSetStates by rememberSaveable { mutableStateOf(arrayListOf<String>()) }
    val exercise = exercises.getOrNull(exerciseIndex)
    val totalSets = exercise?.sets?.coerceAtLeast(1) ?: 1

    BackHandler { showExitConfirmation = true }

    LaunchedEffect(exercise?.id, previousPerformance) {
        if (!weightTouched) weight = exercise?.let { previousPerformance[it.id]?.firstOrNull()?.weightKg?.toInt() } ?: 0
    }

    DisposableEffect(context) {
        val activity = context as? Activity
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }
    val speech = remember { TextToSpeech(context) {} }
    DisposableEffect(speech) {
        speech.language = if (en) Locale.US else Locale("tr", "TR")
        onDispose { speech.shutdown() }
    }

    LaunchedEffect(restSeconds, paused) {
        if (restSeconds > 0 && !paused) {
            delay(1_000)
            restSeconds--
            if (restSeconds == 0) {
                vibrate(context)
                speech.speak(if (en) "Rest complete" else "Dinlenme tamamlandı", TextToSpeech.QUEUE_FLUSH, null, "rest-finished")
            }
        }
    }

    LaunchedEffect(timerSeconds, timerRunning, paused) {
        if (timerRunning && timerSeconds > 0 && !paused) {
            delay(1_000)
            timerSeconds--
            if (timerSeconds == 0) {
                timerRunning = false
                vibrate(context)
                speech.speak(if (en) "Timer complete" else "Süre tamamlandı", TextToSpeech.QUEUE_FLUSH, null, "workout-timer-finished")
            }
        }
    }

    fun recordSetAndContinue() {
        val current = exercise ?: return
        val old = previousPerformance[current.id]?.getOrNull(currentSet - 1)
        personalRecord = old != null && ((old.weightKg != null && weight > old.weightKg) || (weight.toDouble() >= (old.weightKg ?: weight.toDouble()) && reps > (old.reps ?: reps)))
        val completed = WorkoutSetInput(current.id, current.name, exerciseIndex + 1, currentSet, weight.toDouble(), reps, null, rpe, setType, note)
        completedSetStates = ArrayList(completedSetStates).apply { add(completed.toSavedWorkoutSet()) }
        vibrate(context)
        note = ""
        setType = "normal"
        if (currentSet < totalSets) {
            currentSet++
            restSeconds = smartRestSeconds(current, rpe)
        } else if (exerciseIndex < exercises.lastIndex) {
            exerciseIndex++
            currentSet = 1
            val nextPrevious = previousPerformance[exercises[exerciseIndex].id]?.firstOrNull()
            weightTouched = false
            weight = nextPrevious?.weightKg?.toInt() ?: 0
            reps = nextPrevious?.reps ?: prescribedStartingReps(exercises[exerciseIndex].reps)
            restSeconds = 0
        } else showFeedback = true
    }

    fun skipExercise() {
        if (exerciseIndex < exercises.lastIndex) {
            exerciseIndex++
            currentSet = 1
            weightTouched = false
            weight = previousPerformance[exercises[exerciseIndex].id]?.firstOrNull()?.weightKg?.toInt() ?: 0
            reps = prescribedStartingReps(exercises[exerciseIndex].reps)
            restSeconds = 0
        } else if (!canFinishWorkout(completedSetStates.size)) {
            showNoSetsWarning = true
        } else {
            showFeedback = true
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize().background(HedefitColors.Background)) {
        val isWide = maxWidth >= 760.dp
        val safePadding = WindowInsets.safeDrawing.asPaddingValues()
        Column(
            Modifier.fillMaxSize().padding(safePadding).padding(horizontal = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            ActiveTopBar({ showExitConfirmation = true }, paused, en) { paused = !paused }
            if (paused) HedefitCard(Modifier.fillMaxWidth().widthIn(max = 1040.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Pause, null, tint = HedefitColors.Warning)
                    Spacer(Modifier.width(10.dp))
                    Text(if (en) "Workout paused" else "Antrenman duraklatıldı", modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    TextButton(onClick = { paused = false }) { Text(if (en) "Resume" else "Devam et", color = HedefitColors.Lime) }
                }
            }
            if (isWide) {
                Row(
                    Modifier.fillMaxWidth().widthIn(max = 1040.dp).weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(22.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ActiveWorkoutHero(currentSet, exercise, Modifier.weight(1.1f).fillMaxHeight(.9f))
                    ActiveControls(weight, reps, rpe, setType, note, restSeconds, timerSeconds, timerRunning, currentSet, totalSets, exerciseIndex, exercises.size, previousPerformance[exercise?.id].orEmpty(), Modifier.weight(.9f).fillMaxHeight().verticalScroll(rememberScrollState()).padding(bottom = 20.dp),
                        onWeight = { weightTouched = true; weight = (weight + it).coerceAtLeast(0) },
                        onReps = { reps = (reps + it).coerceAtLeast(1) },
                        onRpe = { rpe = it }, onSetType = { setType = it }, onNote = { note = it },
                        onRest = { restSeconds = 0 }, onComplete = ::recordSetAndContinue,
                        onTimer = { seconds -> timerSeconds = seconds; timerRunning = seconds > 0 }, onToggleTimer = { timerRunning = !timerRunning },
                        onSkipExercise = ::skipExercise,
                        saving = saving || paused, personalRecord = personalRecord,
                    )
                }
            } else {
                LazyColumn(
                    Modifier.fillMaxWidth().weight(1f),
                    contentPadding = PaddingValues(bottom = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { ActiveWorkoutHero(currentSet, exercise, Modifier.fillMaxWidth()) }
                    item {
                        ActiveControls(weight, reps, rpe, setType, note, restSeconds, timerSeconds, timerRunning, currentSet, totalSets, exerciseIndex, exercises.size, previousPerformance[exercise?.id].orEmpty(), Modifier.fillMaxWidth(),
                            onWeight = { weightTouched = true; weight = (weight + it).coerceAtLeast(0) },
                            onReps = { reps = (reps + it).coerceAtLeast(1) },
                            onRpe = { rpe = it }, onSetType = { setType = it }, onNote = { note = it },
                            onRest = { restSeconds = 0 }, onComplete = ::recordSetAndContinue,
                            onTimer = { seconds -> timerSeconds = seconds; timerRunning = seconds > 0 }, onToggleTimer = { timerRunning = !timerRunning },
                            onSkipExercise = ::skipExercise,
                            saving = saving || paused, personalRecord = personalRecord,
                        )
                    }
                }
            }
        }
    }

    if (showFeedback) WorkoutFeedbackDialog(saving, onDismiss = { showFeedback = false }) { feedback ->
        val duration = ((System.currentTimeMillis() - startedAt) / 1000).toInt().coerceAtLeast(1)
        onFinish(duration, (duration / 60 * 7).coerceAtLeast(60), completedSetStates.mapNotNull(::savedWorkoutSet), feedback)
    }
    if (showNoSetsWarning) AlertDialog(
        onDismissRequest = { showNoSetsWarning = false },
        title = { Text(if (en) "No completed sets" else "Tamamlanan set yok") },
        text = { Text(if (en) "Complete at least one set before finishing the workout." else "Antrenmanı bitirmeden önce en az bir set tamamla.") },
        confirmButton = { TextButton(onClick = { showNoSetsWarning = false }) { Text(if (en) "Continue workout" else "Antrenmana devam et", color = HedefitColors.Lime) } },
    )
    if (!prepared) WarmupDialog(en) { prepared = true }
    if (showExitConfirmation) AlertDialog(
        onDismissRequest = { showExitConfirmation = false },
        title = { Text(if (en) "Leave workout?" else "Antrenmandan çıkılsın mı?") },
        text = { Text(if (en) "Your unfinished sets will be discarded." else "Tamamlanmamış antrenmanındaki setler silinecek.") },
        dismissButton = { TextButton(onClick = { showExitConfirmation = false }) { Text(if (en) "Keep training" else "Antrenmana devam et") } },
        confirmButton = { TextButton(onClick = onBack) { Text(if (en) "Leave and discard" else "Çık ve sil", color = HedefitColors.Coral) } },
    )
}

@Composable
private fun ActiveTopBar(onBack: () -> Unit, paused: Boolean, en: Boolean, onPause: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(64.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") }
        Text(if (en) "Active Workout" else "Aktif Antrenman", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
        IconButton(onClick = onPause) { Icon(if (paused) Icons.Default.PlayArrow else Icons.Default.Pause, if (paused) (if (en) "Resume" else "Devam et") else (if (en) "Pause" else "Duraklat"), tint = HedefitColors.Lime) }
    }
}

@Composable
private fun ActiveWorkoutHero(currentSet: Int, exercise: WorkoutExerciseData?, modifier: Modifier) {
    HedefitCard(modifier, contentPadding = PaddingValues(0.dp)) {
        Box(Modifier.fillMaxWidth().height(330.dp)) {
            if (exercise != null) ExerciseMotionPlayer(
                listOf("/exercise-images/${exercise.id}/0.jpg", "/exercise-images/${exercise.id}/1.jpg"),
                exercise.name,
                Modifier.fillMaxSize(),
            )
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(HedefitColors.Background.copy(alpha = .18f), Color.Transparent, HedefitColors.Background.copy(alpha = .94f)))))
            Column(Modifier.align(Alignment.BottomStart).padding(18.dp)) {
                Text(exercise?.name ?: "Program yüklenemedi", style = MaterialTheme.typography.headlineLarge)
                Text("$currentSet / ${exercise?.sets ?: 4} set", color = HedefitColors.Lime, style = MaterialTheme.typography.headlineSmall)
            }
        }
    }
}

@Composable
private fun ActiveControls(
    weight: Int,
    reps: Int,
    rpe: Int,
    setType: String,
    note: String,
    restSeconds: Int,
    timerSeconds: Int,
    timerRunning: Boolean,
    currentSet: Int,
    totalSets: Int,
    exerciseIndex: Int,
    exerciseCount: Int,
    previous: List<PreviousSetData>,
    modifier: Modifier,
    onWeight: (Int) -> Unit,
    onReps: (Int) -> Unit,
    onRpe: (Int) -> Unit,
    onSetType: (String) -> Unit,
    onNote: (String) -> Unit,
    onRest: () -> Unit,
    onTimer: (Int) -> Unit,
    onToggleTimer: () -> Unit,
    onComplete: () -> Unit,
    onSkipExercise: () -> Unit,
    saving: Boolean,
    personalRecord: Boolean,
) {
    var showPlateCalculator by remember { mutableStateOf(false) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Hareket ${exerciseIndex + 1}/$exerciseCount • Set $currentSet/$totalSets", color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge)
        if (previous.isNotEmpty()) {
            val old = previous.getOrNull(currentSet - 1) ?: previous.last()
            HedefitCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Whatshot, null, tint = HedefitColors.Warning)
                    Spacer(Modifier.width(9.dp))
                    Text("Önceki: ${old.weightKg?.let { "${it.toInt()} kg" } ?: "vücut ağırlığı"} × ${old.reps ?: "—"} • RPE ${old.rpe ?: "—"}", color = HedefitColors.TextSecondary)
                }
            }
            progressiveOverloadTip(old, currentSet)?.let { tip ->
                Text(tip, color = HedefitColors.Lime, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp))
            }
        }
        if (personalRecord) HedefitCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Whatshot, null, tint = HedefitColors.Lime)
                Spacer(Modifier.width(9.dp))
                Text("Yeni kişisel rekor! Son set önceki performansını geçti.", color = HedefitColors.Lime, fontWeight = FontWeight.Bold)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CounterCard("$weight kg", "Ağırlık", Modifier.weight(1f), { onWeight(-5) }, { onWeight(5) })
            CounterCard("$reps tekrar", "Tekrar", Modifier.weight(1f), { onReps(-1) }, { onReps(1) })
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(listOf("warmup" to "Isınma", "normal" to "Normal", "superset" to "Süper", "dropset" to "Drop", "failure" to "Tükeniş")) { (value, label) ->
                FilterChip(selected = setType == value, onClick = { onSetType(value) }, label = { Text(label, style = MaterialTheme.typography.labelMedium) })
            }
        }
        HedefitCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row { Text("Efor (RPE)", Modifier.weight(1f)); Text("$rpe/10", color = HedefitColors.Lime, fontWeight = FontWeight.Bold) }
                Slider(value = rpe.toFloat(), onValueChange = { onRpe(it.toInt()) }, valueRange = 1f..10f, steps = 8)
            }
        }
        if (restSeconds > 0) HedefitCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                ProgressRing(restSeconds / 180f, Modifier.size(110.dp), 8.dp) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Dinlenme", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        Text("%02d:%02d".format(restSeconds / 60, restSeconds % 60), style = MaterialTheme.typography.headlineMedium)
                    }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Akıllı süre: hareketin zorluğu ve RPE'ye göre ayarlandı.", color = HedefitColors.TextSecondary)
                    OutlineAction("Dinlenmeyi Atla", onRest)
                }
            }
        }
        HedefitCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Kronometre", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    Text("%02d:%02d".format(timerSeconds / 60, timerSeconds % 60), color = HedefitColors.Lime, style = MaterialTheme.typography.headlineSmall)
                }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    items(listOf(30, 60, 90, 120)) { seconds ->
                        FilterChip(selected = timerSeconds == seconds, onClick = { onTimer(seconds) }, label = { Text("${seconds / 60}:${"%02d".format(seconds % 60)}") })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlineAction(if (timerRunning) "Duraklat" else "Başlat", onToggleTimer, modifier = Modifier.weight(1f))
                    OutlineAction("Sıfırla", { onTimer(0) }, modifier = Modifier.weight(1f))
                }
            }
        }
        OutlinedTextField(note, onNote, label = { Text("Set notu (isteğe bağlı)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        if (weight >= 15) OutlineAction("Plaka Hesaplayıcı", onClick = { showPlateCalculator = true })
        PrimaryButton(if (saving) "Kaydediliyor…" else if (currentSet >= totalSets && exerciseIndex >= exerciseCount - 1) "Antrenmanı Değerlendir" else "Seti Tamamla", if (saving || restSeconds > 0) ({}) else onComplete, icon = Icons.Default.Check)
        HedefitCard(Modifier.fillMaxWidth(), onClick = onSkipExercise) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.SkipNext, null, tint = HedefitColors.Lime)
                Spacer(Modifier.width(10.dp))
                Text("Hareketi atla", modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            }
        }
    }
    if (showPlateCalculator) PlateCalculatorDialog(weight) { showPlateCalculator = false }
}

@Composable
private fun WarmupDialog(en: Boolean, onReady: () -> Unit) {
    AlertDialog(
        onDismissRequest = {},
        title = { Text(if (en) "Warm-up" else "Isınma ve hazırlık") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text(if (en) "• 3–5 min light cardio\n• Dynamic joint mobility\n• 1–2 light sets for the first move" else "• 3–5 dk hafif kardiyo\n• Eklemlere dinamik mobilite\n• İlk harekette 1–2 hafif ısınma seti", color = HedefitColors.TextSecondary)
            Text(if (en) "Choose Warm-up as the set type to log preparation sets." else "Set türünden ‘Isınma’yı seçerek hazırlık setlerini ayrıca kaydedebilirsin.", color = HedefitColors.Lime)
        } },
        confirmButton = { Button(onClick = onReady, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "I'm ready" else "Hazırım, başla") } },
    )
}

@Composable
private fun PlateCalculatorDialog(targetWeight: Int, onDismiss: () -> Unit) {
    var barWeight by remember { mutableIntStateOf(20) }
    val perSide = ((targetWeight - barWeight).coerceAtLeast(0) / 2.0)
    val plates = remember(perSide) {
        var remaining = perSide
        buildList {
            listOf(25.0, 20.0, 15.0, 10.0, 5.0, 2.5, 1.25).forEach { plate ->
                val count = (remaining / plate).toInt()
                repeat(count) { add(plate) }
                remaining -= count * plate
            }
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Plaka Hesaplayıcı") },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Hedef: $targetWeight kg", color = HedefitColors.Lime, style = MaterialTheme.typography.titleLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(15, 20).forEach { value -> FilterChip(barWeight == value, { barWeight = value }, label = { Text("$value kg bar") }) } }
            Text(if (plates.isEmpty()) "Yalnızca barı kullan." else "Her tarafa: ${plates.joinToString(" + ") { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() }} kg", color = HedefitColors.TextSecondary)
        } },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Tamam", color = HedefitColors.Lime) } },
    )
}

private fun vibrate(context: Context) {
    val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) context.getSystemService(VibratorManager::class.java)?.defaultVibrator else @Suppress("DEPRECATION") context.getSystemService(Vibrator::class.java)
    vibrator?.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE))
}

@Composable
private fun WorkoutFeedbackDialog(saving: Boolean, onDismiss: () -> Unit, onConfirm: (WorkoutFeedbackData) -> Unit) {
    var difficulty by remember { mutableStateOf("Uygun") }
    var fatigue by remember { mutableIntStateOf(3) }
    var pain by remember { mutableStateOf("Yok") }
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Antrenman nasıldı?") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Fit Koç sonraki planını bu geri bildirime göre düzenler. Bitirdikten sonra 3–5 dk hafif soğuma ve esneme yap.", color = HedefitColors.TextSecondary)
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) { listOf("Kolay", "Uygun", "Zor").forEach { value -> FilterChip(difficulty == value, { difficulty = value }, label = { Text(value) }) } }
            Text("Yorgunluk: $fatigue/5")
            Slider(fatigue.toFloat(), { fatigue = it.toInt() }, valueRange = 1f..5f, steps = 3)
            Text("Ağrı / hassasiyet")
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) { listOf("Yok", "Bel", "Diz", "Omuz").forEach { value -> FilterChip(pain == value, { pain = value }, label = { Text(value) }) } }
            OutlinedTextField(note, { note = it }, label = { Text("Koça not") }, modifier = Modifier.fillMaxWidth())
        } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Geri dön") } },
        confirmButton = { Button(enabled = !saving, onClick = { onConfirm(WorkoutFeedbackData(difficulty, fatigue, listOf(pain), note)) }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (saving) "Kaydediliyor…" else "Bitir ve uyarla") } },
    )
}

private fun List<WorkoutExerciseData>.toWorkoutDays(): List<WorkoutDayUi> {
    if (isEmpty()) return emptyList()
    val dayNames = listOf("Pazartesi" to "Üst Vücut", "Çarşamba" to "Alt Vücut", "Cuma" to "Tüm Vücut")
    val chunkSize = ceil(size / 3.0).toInt().coerceAtLeast(1)
    return chunked(chunkSize).take(3).mapIndexed { index, chunk ->
        val (day, fallbackTitle) = dayNames[index]
        WorkoutDayUi(day, chunk.firstOrNull()?.area ?: fallbackTitle, 0f, chunk.map {
            ExerciseUi(it.name, "${it.sets} × ${it.reps}", imageForExercise(it.name))
        })
    }
}

private fun imageForExercise(name: String): Int {
    val folded = name.lowercase()
    return when {
        "squat" in folded -> R.drawable.exercise_squat
        "deadlift" in folded -> R.drawable.exercise_deadlift
        "lat" in folded || "pulldown" in folded || "row" in folded -> R.drawable.exercise_lat_pulldown
        "leg press" in folded -> R.drawable.exercise_leg_press
        "curl" in folded -> R.drawable.exercise_curl
        else -> R.drawable.exercise_bench_press
    }
}

private fun smartRestSeconds(exercise: WorkoutExerciseData, rpe: Int): Int {
    val name = exercise.name.lowercase()
    val compound = listOf("squat", "bench", "deadlift", "row", "press", "pull-up", "barbell").any { it in name }
    val base = if (compound) 120 else 75
    return (base + if (rpe >= 9) 30 else if (rpe <= 5) -15 else 0).coerceIn(60, 150)
}

private fun progressiveOverloadTip(previous: PreviousSetData, currentSet: Int): String? {
    val weight = previous.weightKg ?: return null
    val reps = previous.reps ?: return null
    return when {
        reps >= 12 && (previous.rpe ?: 8) <= 8 -> "Yük önerisi: $weight kg yerine ${if (weight >= 50) weight + 2.5 else weight + 1.25} kg ile 8–10 dene."
        reps < 12 -> "Yük önerisi: $weight kg ile ${reps + 1} tekrar hedefle."
        else -> "Yük önerisi: $weight kg ile formu koruyarak tekrar et."
    }
}

@Composable
private fun CounterCard(value: String, label: String, modifier: Modifier, onMinus: () -> Unit, onPlus: () -> Unit) {
    HedefitCard(modifier) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text(value, style = MaterialTheme.typography.headlineSmall)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                RoundControl(Icons.Default.Remove, "Azalt", onMinus)
                Text(label, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                RoundControl(Icons.Default.Add, "Artır", onPlus)
            }
        }
    }
}

@Composable
private fun RoundControl(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(38.dp).clip(CircleShape).background(HedefitColors.SurfaceHigh).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, label, tint = HedefitColors.Lime, modifier = Modifier.size(20.dp)) }
}
