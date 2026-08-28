package com.hedefit.app.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.MoreVert
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import com.hedefit.app.ui.components.ScreenContainer
import com.hedefit.app.ui.components.FitCoachRobotAvatar
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
    onClearChat: () -> Unit = {},
    usageUsed: Int? = null,
    usageLimit: Int? = null,
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
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.fillMaxSize()
                    .widthIn(max = if (expanded) 920.dp else 760.dp)
                    .padding(top = 6.dp, bottom = 8.dp),
            ) {
                CoachHeader(
                    en = en,
                    coachName = coachName,
                    onCoachNameChange = onCoachNameChange,
                    onClearChat = onClearChat,
                    usageUsed = usageUsed,
                    usageLimit = usageLimit,
                )
                Spacer(Modifier.height(6.dp))
                CoachConversation(messages, busy, input, { input = it }, send, onSendMessage, onOpenPlan, data, Modifier.weight(1f), en, coachName)
            }
        }
    }
}

@Composable
private fun CoachHeader(
    en: Boolean,
    coachName: String,
    onCoachNameChange: (String) -> Unit,
    onClearChat: () -> Unit,
    usageUsed: Int?,
    usageLimit: Int?,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var renameOpen by remember { mutableStateOf(false) }
    var draftName by remember(coachName) { mutableStateOf(coachName) }
    var clearOpen by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().height(64.dp), verticalAlignment = Alignment.CenterVertically) {
        FitCoachRobotAvatar(Modifier.size(48.dp))
        Spacer(Modifier.size(10.dp))
        Column(Modifier.weight(1f)) {
            Text(coachName, style = MaterialTheme.typography.titleLarge)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.size(7.dp).background(Color(0xFF35D04F), CircleShape))
                Text(
                    if (en) "Cloud AI" else "Bulut AI",
                    color = HedefitColors.TextSecondary,
                    style = MaterialTheme.typography.bodySmall,
                )
                usageLimit?.let { limit ->
                    val label = usageUsed?.let { used -> if (en) "${(limit - used).coerceAtLeast(0)} questions left today" else "Bugün ${(limit - used).coerceAtLeast(0)} soru hakkın kaldı" }
                        ?: if (en) "$limit questions daily" else "Günlük $limit soru hakkı"
                    Text(label, color = HedefitColors.Lime, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        Box {
            IconButton(onClick = { menuOpen = true }) { Icon(Icons.Default.MoreVert, if (en) "More" else "Diğer", tint = HedefitColors.TextPrimary) }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(text = { Text(if (en) "Rename coach" else "Koçun adını değiştir") }, onClick = { menuOpen = false; draftName = coachName; renameOpen = true })
                DropdownMenuItem(text = { Text(if (en) "Clear chat" else "Sohbeti temizle") }, onClick = { menuOpen = false; clearOpen = true })
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
    if (clearOpen) AlertDialog(
        onDismissRequest = { clearOpen = false },
        title = { Text(if (en) "Clear this chat?" else "Sohbet temizlensin mi?") },
        text = { Text(if (en) "Messages on this device will be removed." else "Bu cihazdaki sohbet mesajları kaldırılacak.") },
        dismissButton = { TextButton(onClick = { clearOpen = false }) { Text(if (en) "Cancel" else "Vazgeç") } },
        confirmButton = { Button(onClick = { onClearChat(); clearOpen = false }, colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Coral, contentColor = Color.White)) { Text(if (en) "Clear" else "Temizle") } },
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
        val itemCount = messages.size + (if (messages.size <= 1) 1 else 0) + (if (busy) 1 else 0)
        if (itemCount > 0) listState.scrollToItem(itemCount - 1)
    }
    Column(modifier) {
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(),
            state = listState,
            contentPadding = PaddingValues(top = 18.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            items(messages) { message -> MessageBubble(message, coachName) }
            if (messages.size <= 1) {
                item { QuickActions(en, data, onQuickSend, onOpenPlan) }
            }
            if (busy && messages.lastOrNull()?.user != false) item { ThinkingIndicator(coachName, en) }
        }
        Composer(input, onInput, onSend, busy, en)
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
            FitCoachRobotAvatar(Modifier.size(38.dp))
            Spacer(Modifier.size(10.dp))
        }
        Box(
            Modifier.fillMaxWidth(if (message.user) .82f else 1f)
                .then(if (message.user) Modifier.background(HedefitColors.SurfaceHigh, RoundedCornerShape(22.dp)) else Modifier)
                .padding(if (message.user) 14.dp else 2.dp),
        ) {
            Text(message.text, color = HedefitColors.TextPrimary, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
private fun QuickActions(en: Boolean, data: DashboardData?, onSelect: (String) -> Unit, onOpenPlan: () -> Unit) {
    val hasPlan = data?.workouts?.isNotEmpty() == true
    val actions = if (en) {
        listOf(
            if (hasPlan) "Review my workout plan" else "Suggest a workout",
            "Review my nutrition",
            "Summarize today's goals",
        )
    } else {
        listOf(
            if (hasPlan) "Antrenman programımı değerlendir" else "Antrenman önerisi ver",
            "Beslenmemi değerlendir",
            "Bugünkü hedeflerimi özetle",
        )
    }
    Column(Modifier.fillMaxWidth().padding(start = 42.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Text(if (en) "How can I help?" else "Nasıl yardımcı olabilirim?", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        actions.forEach { action ->
            Row(
                Modifier.fillMaxWidth().background(HedefitColors.SurfaceHigh, RoundedCornerShape(18.dp)).clickable { onSelect(action) }
                    .padding(horizontal = 15.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Default.FitnessCenter, null, tint = HedefitColors.Lime, modifier = Modifier.size(17.dp))
                Text(action, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            }
        }
        TextButton(onClick = onOpenPlan) { Text(if (en) "Open my plan" else "Planımı aç", color = HedefitColors.Lime) }
    }
}

@Composable
private fun ThinkingIndicator(coachName: String, en: Boolean) {
    val transition = rememberInfiniteTransition(label = "coach-thinking")
    val dots = List(3) { index ->
        transition.animateFloat(
            initialValue = .28f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 520, delayMillis = index * 130),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "thinking-dot-$index",
        )
    }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        FitCoachRobotAvatar(Modifier.size(38.dp))
        Spacer(Modifier.size(10.dp))
        Row(
            Modifier.background(HedefitColors.SurfaceHigh, RoundedCornerShape(18.dp)).padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            dots.forEach { dot -> Box(Modifier.size(7.dp).alpha(dot.value).background(HedefitColors.Lime, CircleShape)) }
            Spacer(Modifier.size(3.dp))
            Text(if (en) "Thinking" else "Düşünüyor", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
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
        minLines = 1,
        maxLines = 5,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
        keyboardActions = KeyboardActions(onSend = { submit() }),
        shape = RoundedCornerShape(26.dp),
        trailingIcon = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val enabled = input.isNotBlank() && !busy
                Box(Modifier.size(42.dp).background(if (enabled) HedefitColors.Lime else HedefitColors.Divider, CircleShape).clickable(enabled = enabled, onClick = submit), contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Filled.Send, if (en) "Send" else "Gönder", tint = if (enabled) HedefitColors.OnLime else HedefitColors.TextSecondary)
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
