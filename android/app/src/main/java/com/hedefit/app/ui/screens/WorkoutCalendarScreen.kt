package com.hedefit.app.ui.screens

import android.app.TimePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hedefit.app.data.model.WorkoutScheduleData
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.theme.HedefitColors
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun WorkoutCalendarScreen(schedule: List<WorkoutScheduleData>, onBack: () -> Unit, onSchedule: (LocalDate, String, String?) -> Unit, language: String = "tr") {
    val context = LocalContext.current
    val en = language == "en"
    val locale = Locale.forLanguageTag(if (en) "en" else "tr")
    var selected by remember { mutableStateOf(LocalDate.now()) }
    var selectedTime by remember { mutableStateOf("19:00") }
    var showScheduleDialog by remember { mutableStateOf(false) }
    val dates = remember { List(21) { LocalDate.now().plusDays(it.toLong()) } }
    val entryMap = schedule.associateBy { it.date }
    Column(Modifier.fillMaxSize().background(HedefitColors.Background).statusBarsPadding()) {
        UtilityHeader(if (en) "Workout Calendar" else "Antrenman Takvimi", onBack)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(18.dp, 8.dp, 18.dp, 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { Text(if (en) "Next 3 weeks" else "Önümüzdeki 3 hafta", style = MaterialTheme.typography.headlineSmall) }
            items(dates.size) { index ->
                val date = dates[index]
                val entry = entryMap[date.toString()]
                val isSelected = selected == date
                HedefitCard(Modifier.fillMaxWidth(), onClick = { selected = date; selectedTime = entry?.time ?: "19:00"; showScheduleDialog = true }) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(50.dp).background(if (isSelected) HedefitColors.Lime else HedefitColors.SurfaceHigh, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(date.dayOfMonth.toString(), color = if (isSelected) HedefitColors.OnLime else HedefitColors.TextPrimary, fontWeight = FontWeight.Bold); Text(date.format(DateTimeFormatter.ofPattern("EEE", locale)).uppercase(locale), color = if (isSelected) HedefitColors.OnLime else HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium) }
                        }
                        Column(Modifier.weight(1f)) {
                            Text(date.format(DateTimeFormatter.ofPattern("d MMMM", locale)), style = MaterialTheme.typography.titleMedium)
                            Text(when (entry?.status) {
                                "completed" -> if (en) "Completed" else "Tamamlandı"
                                "deferred" -> if (en) "Deferred" else "Ertelendi"
                                "rest" -> if (en) "Rest" else "Dinlenme"
                                "planned" -> "${if (en) "Planned" else "Planlandı"} • ${entry.time}"
                                else -> if (en) "Open day" else "Boş gün"
                            }, color = if (entry != null) HedefitColors.Lime else HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        }
                        Icon(Icons.Default.CalendarMonth, null, tint = HedefitColors.TextSecondary)
                    }
                }
            }
        }
    }
    if (showScheduleDialog) {
        val selectedEntry = entryMap[selected.toString()]
        AlertDialog(
            onDismissRequest = { showScheduleDialog = false },
            title = { Text(if (en) "Plan for ${selected.format(DateTimeFormatter.ofPattern("EEEE, MMMM d", locale))}" else "${selected.format(DateTimeFormatter.ofPattern("d MMMM EEEE", locale))} için planla") },
            text = {
                Row(Modifier.fillMaxWidth().clickable {
                    val parts = selectedTime.split(':').mapNotNull(String::toIntOrNull)
                    TimePickerDialog(context, { _, h, m -> selectedTime = "%02d:%02d".format(h, m) }, parts.getOrElse(0) { 19 }, parts.getOrElse(1) { 0 }, true).show()
                }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Schedule, null, tint = HedefitColors.Lime)
                    Spacer(Modifier.width(10.dp))
                    Text(selectedTime, style = MaterialTheme.typography.headlineSmall)
                }
            },
            dismissButton = { TextButton(onClick = { showScheduleDialog = false }) { Text(if (en) "Cancel" else "Vazgeç") } },
            confirmButton = {
                Button(onClick = {
                    onSchedule(selected, selectedTime, selectedEntry?.originalDate)
                    showScheduleDialog = false
                }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) {
                    Text(if (selectedEntry == null) (if (en) "Add to calendar" else "Takvime ekle") else if (en) "Update time" else "Saati güncelle")
                }
            },
        )
    }
}
