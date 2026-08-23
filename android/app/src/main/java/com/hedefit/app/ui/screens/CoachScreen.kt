package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.components.ScreenContainer
import com.hedefit.app.ui.theme.HedefitColors
import com.hedefit.app.ui.state.ChatMessageState
import com.hedefit.app.data.model.DashboardData

@Composable
fun CoachScreen(
    padding: PaddingValues,
    expanded: Boolean,
    messages: List<ChatMessageState>,
    busy: Boolean,
    onSendMessage: (String) -> Unit,
    data: DashboardData? = null,
    onOpenPlan: () -> Unit,
    language: String = "tr",
    coachName: String = if (language == "en") "Fit Coach" else "Fit Koç",
    onCoachNameChange: (String) -> Unit = {},
) {
    val en = language == "en"
    var input by remember { mutableStateOf("") }
    val send: () -> Unit = {
        if (input.isNotBlank()) {
            onSendMessage(input.trim())
            input = ""
        }
    }

    ScreenContainer(padding) {
        Column(Modifier.fillMaxSize().padding(top = 10.dp, bottom = 8.dp)) {
            CoachHeader(en, coachName, onCoachNameChange)
            if (expanded) {
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    CoachConversation(messages, busy, input, { input = it }, send, onSendMessage, onOpenPlan, data, Modifier.weight(1.25f), en, coachName)
                    Column(Modifier.weight(.75f), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        RecoveryContext(data)
                        QuickActions(en, onSendMessage)
                        MessageAllowance()
                    }
                }
            } else {
                CoachConversation(messages, busy, input, { input = it }, send, onSendMessage, onOpenPlan, data, Modifier.weight(1f), en, coachName)
            }
        }
    }
}

@Composable
private fun CoachHeader(en: Boolean, coachName: String, onCoachNameChange: (String) -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }
    var renameOpen by remember { mutableStateOf(false) }
    var draftName by remember(coachName) { mutableStateOf(coachName) }
    Row(Modifier.fillMaxWidth().height(62.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(44.dp).background(HedefitColors.Lime, CircleShape), contentAlignment = Alignment.Center) {
            Text(coachInitials(coachName), color = HedefitColors.OnLime, fontWeight = FontWeight.Black)
        }
        Spacer(Modifier.size(11.dp))
        Column(Modifier.weight(1f)) {
            Text(coachName, style = MaterialTheme.typography.titleLarge)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.size(7.dp).background(Color(0xFF35D04F), CircleShape))
                Text(if (en) "Online" else "Çevrimiçi", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
        }
        Box {
            IconButton(onClick = { menuOpen = true }) { Icon(Icons.Default.MoreVert, if (en) "More" else "Diğer", tint = HedefitColors.TextPrimary) }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(text = { Text(if (en) "Rename coach" else "Koçun adını değiştir") }, onClick = { menuOpen = false; draftName = coachName; renameOpen = true })
            }
        }
    }
    if (renameOpen) AlertDialog(
        onDismissRequest = { renameOpen = false },
        title = { Text(if (en) "Coach name" else "Koçunun adı") },
        text = { OutlinedTextField(draftName, { draftName = it.take(24) }, label = { Text(if (en) "Name" else "İsim") }, singleLine = true) },
        dismissButton = { TextButton(onClick = { renameOpen = false }) { Text(if (en) "Cancel" else "Vazgeç") } },
        confirmButton = { Button(enabled = draftName.trim().length >= 2, onClick = { onCoachNameChange(draftName.trim()); renameOpen = false }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime)) { Text(if (en) "Save" else "Kaydet") } },
    )
}

private fun coachInitials(name: String) = name.trim().split(Regex("\\s+")).filter(String::isNotBlank).take(2).mapNotNull { it.firstOrNull()?.uppercase() }.joinToString("").ifBlank { "FK" }

@Composable
private fun CoachConversation(
    messages: List<ChatMessageState>,
    busy: Boolean,
    input: String,
    onInput: (String) -> Unit,
    onSend: () -> Unit,
    onQuickSend: (String) -> Unit,
    onOpenPlan: () -> Unit,
    data: DashboardData?,
    modifier: Modifier,
    en: Boolean,
    coachName: String,
) {
    val listState = rememberLazyListState()
    LaunchedEffect(messages.size, busy) {
        val itemCount = messages.size + (if (messages.size <= 2) 3 else 0) + (if (busy) 1 else 0)
        if (itemCount > 0) listState.scrollToItem(itemCount - 1)
    }
    Column(modifier) {
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(),
            state = listState,
            contentPadding = PaddingValues(vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(messages) { message -> MessageBubble(message, coachName) }
            if (messages.size <= 2) {
                item { RecoveryContext(data) }
                item { PrimaryButton(if (en) "Open plan" else "Planı Aç", onOpenPlan, icon = Icons.Default.FitnessCenter) }
                item { QuickActions(en, onQuickSend) }
            }
            if (busy) item { Text(if (en) "$coachName is thinking…" else "$coachName düşünüyor…", color = HedefitColors.Lime, modifier = Modifier.padding(start = 48.dp)) }
        }
        Composer(input, onInput, onSend, busy, en)
        if (!androidx.compose.ui.platform.LocalInspectionMode.current) {
            Text(if (en) "4 of 5 daily messages left" else "5 günlük mesaj hakkından 4 kaldı", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 7.dp))
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessageState, coachName: String) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.user) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Top,
    ) {
        if (!message.user) {
            Box(Modifier.size(36.dp).background(HedefitColors.Lime, CircleShape), contentAlignment = Alignment.Center) {
                Text(coachInitials(coachName), color = HedefitColors.OnLime, fontWeight = FontWeight.Black, style = MaterialTheme.typography.labelMedium)
            }
            Spacer(Modifier.size(8.dp))
        }
        Box(
            Modifier.fillMaxWidth(if (message.user) .82f else .9f)
                .background(
                    if (message.user) HedefitColors.Lime.copy(alpha = .88f) else HedefitColors.Surface,
                    RoundedCornerShape(
                        topStart = if (message.user) 18.dp else 5.dp,
                        topEnd = if (message.user) 5.dp else 18.dp,
                        bottomStart = 18.dp,
                        bottomEnd = 18.dp,
                    ),
                ).padding(15.dp),
        ) {
            Text(message.text, color = if (message.user) HedefitColors.OnLime else HedefitColors.TextPrimary, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
private fun RecoveryContext(data: DashboardData?) {
    val sleep = data?.sleepMinutes ?: 0
    val fatigue = data?.sessions?.firstOrNull()?.fatigue
    HedefitCard(Modifier.fillMaxWidth()) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ContextMetric(Icons.Default.Bedtime, "Uyku", "${sleep / 60} sa ${sleep % 60} dk", if (sleep >= 420) "İyi" else "Takip et", HedefitColors.Sleep, Modifier.weight(1f))
            Box(Modifier.height(82.dp).size(width = 1.dp, height = 82.dp).background(HedefitColors.Divider))
            ContextMetric(Icons.Default.Speed, "Yorgunluk", "${fatigue ?: "—"} / 5", if (fatigue != null && fatigue <= 3) "Düşük" else "Kontrollü", HedefitColors.Coral, Modifier.weight(1f))
        }
    }
}

@Composable
private fun ContextMetric(icon: ImageVector, label: String, value: String, state: String, tint: Color, modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(18.dp))
            Text(label, color = tint, style = MaterialTheme.typography.labelLarge)
        }
        Text(value, style = MaterialTheme.typography.headlineSmall)
        Text(state, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun QuickActions(en: Boolean, onSelect: (String) -> Unit) {
    val actions = if (en) listOf("Suggest a workout", "Review my nutrition", "Summarize today's goals") else listOf("Antrenman önerisi ver", "Beslenmemi değerlendir", "Bugünkü hedeflerimi özetle")
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.End) {
        actions.forEach { action ->
            Row(
                Modifier.background(HedefitColors.SurfaceHigh, RoundedCornerShape(22.dp)).clickable { onSelect(action) }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Default.FitnessCenter, null, tint = HedefitColors.Lime, modifier = Modifier.size(17.dp))
                Text(action, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun Composer(input: String, onInput: (String) -> Unit, onSend: () -> Unit, busy: Boolean, en: Boolean) {
    val focusManager = LocalFocusManager.current
    val submit = { onSend(); focusManager.clearFocus() }
    OutlinedTextField(
        value = input,
        onValueChange = onInput,
        modifier = Modifier.fillMaxWidth(),
        placeholder = { Text(if (en) "Ask something..." else "Bir şey sor...") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
        keyboardActions = KeyboardActions(onSend = { submit() }),
        shape = RoundedCornerShape(26.dp),
        trailingIcon = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val enabled = input.isNotBlank() && !busy
                Box(Modifier.size(42.dp).background(if (enabled) HedefitColors.Lime else HedefitColors.Divider, CircleShape).clickable(enabled = enabled, onClick = submit), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Send, "Gönder", tint = if (enabled) HedefitColors.OnLime else HedefitColors.TextSecondary)
                }
                Spacer(Modifier.size(5.dp))
            }
        },
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = HedefitColors.Surface,
            unfocusedContainerColor = HedefitColors.Surface,
            focusedBorderColor = HedefitColors.Lime,
            unfocusedBorderColor = HedefitColors.Divider,
        ),
    )
}

@Composable
private fun MessageAllowance() {
    HedefitCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Günlük kullanım", style = MaterialTheme.typography.titleMedium)
            Text("5 günlük mesaj hakkından 4 kaldı", color = HedefitColors.TextSecondary)
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                repeat(5) { index ->
                    Box(Modifier.weight(1f).height(6.dp).background(if (index < 4) HedefitColors.Lime else HedefitColors.Divider, CircleShape))
                }
            }
        }
    }
}
