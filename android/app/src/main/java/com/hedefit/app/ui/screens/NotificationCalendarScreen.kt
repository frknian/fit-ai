package com.hedefit.app.ui.screens

import android.app.TimePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.settings.AppPreferences
import com.hedefit.app.ui.theme.HedefitColors
import com.hedefit.app.ui.i18n.uiText
import java.util.Calendar

@Composable
fun NotificationCalendarScreen(preferences: AppPreferences, onBack: () -> Unit, onChange: (AppPreferences) -> Unit, onNotificationsEnabledChange: (Boolean) -> Unit) {
    val context = LocalContext.current
    val en = preferences.language == "en"
    val days = if (en) listOf(Calendar.MONDAY to "Mon", Calendar.TUESDAY to "Tue", Calendar.WEDNESDAY to "Wed", Calendar.THURSDAY to "Thu", Calendar.FRIDAY to "Fri", Calendar.SATURDAY to "Sat", Calendar.SUNDAY to "Sun")
        else listOf(Calendar.MONDAY to "Pzt", Calendar.TUESDAY to "Sal", Calendar.WEDNESDAY to "Çar", Calendar.THURSDAY to "Per", Calendar.FRIDAY to "Cum", Calendar.SATURDAY to "Cmt", Calendar.SUNDAY to "Paz")
    Column(Modifier.fillMaxSize().background(HedefitColors.Background).statusBarsPadding()) {
        UtilityHeader(uiText(preferences.language, "Bildirim Takvimi", "Notification Calendar"), onBack)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                HedefitCard {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(44.dp).background(HedefitColors.Lime.copy(alpha = .18f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.NotificationsActive, null, tint = HedefitColors.Lime) }
                        Column(Modifier.weight(1f)) { Text(if (en) "Workout reminders" else "Antrenman hatırlatmaları", style = MaterialTheme.typography.titleMedium); Text(if (en) "Brings you back to your plan on selected days." else "Seçtiğin günlerde seni plana döndürür.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                        Switch(preferences.notificationsEnabled, onNotificationsEnabledChange)
                    }
                }
            }
            item { Text(if (en) "DAYS" else "GÜNLER", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium) }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    days.forEach { (day, label) ->
                        val selected = day in preferences.notificationDays
                        Box(
                            Modifier.size(43.dp).background(if (selected) HedefitColors.Lime else HedefitColors.SurfaceHigh, CircleShape)
                                .clickable {
                                    val next = if (selected) preferences.notificationDays - day else preferences.notificationDays + day
                                    onChange(preferences.copy(notificationDays = next))
                                }, contentAlignment = Alignment.Center,
                        ) { Text(label, color = if (selected) HedefitColors.OnLime else HedefitColors.TextSecondary, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium) }
                    }
                }
            }
            item { Text(if (en) "TIME" else "SAAT", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium) }
            item {
                HedefitCard(onClick = {
                    TimePickerDialog(context, { _, hour, minute -> onChange(preferences.copy(notificationHour = hour, notificationMinute = minute)) }, preferences.notificationHour, preferences.notificationMinute, true).show()
                }) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.AccessTime, null, tint = HedefitColors.Lime)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) { Text(if (en) "Reminder time" else "Hatırlatma saati"); Text("%02d:%02d".format(preferences.notificationHour, preferences.notificationMinute), style = MaterialTheme.typography.headlineSmall) }
                        Text(if (en) "Change" else "Değiştir", color = HedefitColors.Lime)
                    }
                }
            }
            item { Text(if (en) "Reminders are scheduled locally on your device and work without an internet connection." else "Bildirimler cihazında yerel olarak planlanır. İnternet bağlantısı olmasa da çalışır.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
        }
    }
}
