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
fun WorkoutCalendarScreen(schedule: List<WorkoutScheduleData>, onBack: () -> Unit, onSchedule: (LocalDate, String, String?) -> Unit) {
    val context = LocalContext.current
    var selected by remember { mutableStateOf(LocalDate.now()) }
    var selectedTime by remember { mutableStateOf("19:00") }
    val dates = remember { List(21) { LocalDate.now().plusDays(it.toLong()) } }
    val entryMap = schedule.associateBy { it.date }
    Column(Modifier.fillMaxSize().background(HedefitColors.Background).statusBarsPadding()) {
        UtilityHeader("Antrenman Takvimi", onBack)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(18.dp, 8.dp, 18.dp, 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { Text("Önümüzdeki 3 hafta", style = MaterialTheme.typography.headlineSmall) }
            items(dates.size) { index ->
                val date = dates[index]
                val entry = entryMap[date.toString()]
                val isSelected = selected == date
                HedefitCard(Modifier.fillMaxWidth(), onClick = { selected = date; entry?.let { selectedTime = it.time } }) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(50.dp).background(if (isSelected) HedefitColors.Lime else HedefitColors.SurfaceHigh, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(date.dayOfMonth.toString(), color = if (isSelected) HedefitColors.OnLime else HedefitColors.TextPrimary, fontWeight = FontWeight.Bold); Text(date.dayOfWeek.name.take(3), color = if (isSelected) HedefitColors.OnLime else HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium) }
                        }
                        Column(Modifier.weight(1f)) {
                            Text(date.format(DateTimeFormatter.ofPattern("d MMMM", Locale("tr"))), style = MaterialTheme.typography.titleMedium)
                            Text(when (entry?.status) { "completed" -> "Tamamlandı"; "deferred" -> "Ertelendi"; "rest" -> "Dinlenme"; "planned" -> "Planlandı • ${entry.time}"; else -> "Boş gün" }, color = if (entry != null) HedefitColors.Lime else HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        }
                        Icon(Icons.Default.CalendarMonth, null, tint = HedefitColors.TextSecondary)
                    }
                }
            }
            item {
                HedefitCard {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("${selected.format(DateTimeFormatter.ofPattern("d MMMM EEEE", Locale("tr")))} için planla", style = MaterialTheme.typography.titleLarge)
                        Row(Modifier.fillMaxWidth().clickable {
                            val parts = selectedTime.split(':').mapNotNull(String::toIntOrNull)
                            TimePickerDialog(context, { _, h, m -> selectedTime = "%02d:%02d".format(h, m) }, parts.getOrElse(0) { 19 }, parts.getOrElse(1) { 0 }, true).show()
                        }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Schedule, null, tint = HedefitColors.Lime); Spacer(Modifier.width(10.dp)); Text(selectedTime, style = MaterialTheme.typography.headlineSmall)
                        }
                        Button(onClick = { onSchedule(selected, selectedTime, entryMap[selected.toString()]?.date) }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (entryMap[selected.toString()] == null) "Takvime ekle" else "Saati güncelle") }
                    }
                }
            }
        }
    }
}
