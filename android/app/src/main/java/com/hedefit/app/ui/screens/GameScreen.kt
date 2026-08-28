package com.hedefit.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MilitaryTech
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hedefit.app.data.model.DashboardData
import com.hedefit.app.gamification.Achievement
import com.hedefit.app.gamification.DailyQuest
import com.hedefit.app.gamification.GamificationEngine
import com.hedefit.app.gamification.GamificationInput
import com.hedefit.app.gamification.GamificationSnapshot
import com.hedefit.app.gamification.HabitDay
import com.hedefit.app.ui.components.ScreenContainer
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.theme.HedefitColors
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale

private val GameBackground = HedefitColors.Background
private val GameSurface = HedefitColors.Surface
private val GameSurfaceHigh = HedefitColors.SurfaceHigh
private val GameSurfaceHighest = HedefitColors.SurfaceHigh
private val GameLime = HedefitColors.Lime
private val GameLimeDim = HedefitColors.Lime.copy(alpha = .75f)
private val GameInk = HedefitColors.TextSecondary
private val GameHeat = HedefitColors.Warning
private val GameText = HedefitColors.TextPrimary
private val GameTextMuted = HedefitColors.TextSecondary

@Composable
fun GameScreen(
    padding: PaddingValues,
    data: DashboardData?,
    stepGoal: Int,
    waterGoalMl: Int,
    weeklyActivityGoal: Int,
    language: String = "tr",
) {
    val en = language == "en"
    val snapshot = remember(data, stepGoal, waterGoalMl, weeklyActivityGoal) {
        data?.let {
            GamificationEngine.snapshot(
                GamificationInput(
                    sessions = it.sessions,
                    routes = it.routeActivities,
                    stepHistory = it.stepHistory,
                    todaySteps = it.steps,
                    todayWaterMl = it.waterMl,
                    sleepMinutes = it.sleepMinutes,
                    nutritionLogs = it.nutritionLogs,
                    nutritionGoal = it.nutritionGoal,
                    schedule = it.schedule,
                    dailyStepGoal = stepGoal,
                    dailyWaterGoalMl = waterGoalMl,
                    weeklyActivityGoal = weeklyActivityGoal,
                    zoneId = ZoneId.systemDefault(),
                    authoritativeTotalXp = it.gamificationTotalXp,
                    authoritativeWeeklyXp = it.gamificationWeeklyXp,
                    unlockedAchievements = it.unlockedAchievements,
                ),
            )
        }
    }
    ScreenContainer(padding) {
        if (snapshot == null || data == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = GameLime) }
        } else {
            GameContent(snapshot, data.profile.displayName, en)
        }
    }
}

@Composable
private fun GameContent(snapshot: GamificationSnapshot, displayName: String, en: Boolean) {
    var showAllAchievements by remember { mutableStateOf(false) }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 16.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column {
                Text(if (en) "Tasks" else "Görevler", color = GameText, fontSize = 28.sp, fontWeight = FontWeight.Black)
                Text(if (en) "Build strength through daily actions." else "Günlük adımlarla gücünü inşa et.", color = GameTextMuted, style = MaterialTheme.typography.labelLarge)
            }
        }
        item { HeroCard(snapshot) }
        item { HabitCard(snapshot.habitStrength, snapshot.habitWeek) }
        item { QuestCard(snapshot, en) }
        item { AiRewardCard(snapshot, en) }
        item { ChallengeCard(snapshot) }
        item { LeagueCard(displayName.ifBlank { if (en) "You" else "Sen" }, snapshot.weeklyXp, snapshot.totalXp, en) }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (en) "Achievements" else "Başarımlar", color = GameText, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                if (snapshot.achievements.size > 3) TextButton(onClick = { showAllAchievements = !showAllAchievements }) {
                    Text(if (showAllAchievements) (if (en) "Show less" else "Daha az") else (if (en) "See all" else "Tümünü Gör"), color = GameLime)
                }
            }
        }
        val achievements = if (showAllAchievements) snapshot.achievements else snapshot.achievements.take(3)
        items(achievements, key = { it.id }) { AchievementCard(it) }
        item { MotivationCard(snapshot.motivation) }
    }
}

@Composable
private fun GameCard(border: Color = GameInk.copy(alpha = .45f), content: @Composable ColumnScope.() -> Unit) = HedefitCard(
    modifier = Modifier.fillMaxWidth(),
    contentPadding = PaddingValues(20.dp),
) { Column(content = content) }

@Composable
private fun HeroCard(snapshot: GamificationSnapshot) = GameCard {
    Row(verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.LocalFireDepartment, null, tint = GameHeat, modifier = Modifier.size(34.dp))
                Spacer(Modifier.width(8.dp))
                Text("${snapshot.streakDays} Gün", color = GameText, fontSize = 40.sp, lineHeight = 44.sp, fontWeight = FontWeight.Black)
            }
            Text("SERİ", color = GameTextMuted, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        }
        Box(Modifier.clip(CircleShape).background(GameSurfaceHighest).padding(horizontal = 18.dp, vertical = 12.dp)) {
            Text("LV. ${snapshot.level.level}", color = GameLime, fontWeight = FontWeight.Black)
        }
    }
    Spacer(Modifier.height(30.dp))
    Row(verticalAlignment = Alignment.Bottom) {
        Text("DENEYİM", color = GameTextMuted, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        Text("${snapshot.level.currentXp}", color = GameText, fontSize = 28.sp, fontWeight = FontWeight.Black)
        Text("/${snapshot.level.nextLevelXp} XP", color = GameTextMuted, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 3.dp))
    }
    Spacer(Modifier.height(10.dp))
    LinearProgressIndicator(
        progress = { snapshot.level.progress },
        modifier = Modifier.fillMaxWidth().height(16.dp).clip(CircleShape),
        color = GameLime,
        trackColor = Color(0xFF0E0F0B),
    )
}

@Composable
private fun HabitCard(strength: Int, days: List<HabitDay>) = GameCard {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Alışkanlık Gücü", color = GameText, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
        Box(Modifier.size(58.dp).clip(CircleShape).background(GameSurfaceHighest), contentAlignment = Alignment.Center) {
            Text("%$strength", color = GameLime, fontSize = 20.sp, fontWeight = FontWeight.Black)
        }
    }
    Spacer(Modifier.height(22.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        days.forEach { HabitDayColumn(it, Modifier.weight(1f)) }
    }
}

@Composable
private fun HabitDayColumn(day: HabitDay, modifier: Modifier = Modifier) {
    val locale = Locale.forLanguageTag("tr-TR")
    val label = day.date.dayOfWeek.getDisplayName(TextStyle.SHORT, locale).uppercase(locale).take(3)
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        if (day.today) Box(Modifier.size(7.dp).background(GameLime, CircleShape)) else Spacer(Modifier.height(7.dp))
        Spacer(Modifier.height(5.dp))
        Box(
            Modifier.fillMaxWidth().height(if (day.today) 76.dp else 68.dp)
                .clip(CircleShape)
                .background(if (day.active) GameLime else GameSurfaceHigh)
                .then(if (day.today) Modifier.background(GameLimeDim.copy(alpha = .35f)) else Modifier),
            contentAlignment = Alignment.BottomCenter,
        ) {
            if (day.active) Box(Modifier.fillMaxWidth().height(22.dp).padding(4.dp).background(GameInk.copy(alpha = .35f), CircleShape))
        }
        Spacer(Modifier.height(8.dp))
        Text(label, color = if (day.today) GameText else GameTextMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun QuestCard(snapshot: GamificationSnapshot, en: Boolean) = GameCard {
    val quests = snapshot.dailyQuests
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(if (en) "Today's Quests" else "Bugünün Görevleri", color = GameText, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
        Pill("${quests.filter { it.completed }.sumOf { it.xp }}/${snapshot.dailyXpCap} XP", GameLime)
    }
    Spacer(Modifier.height(16.dp))
    quests.forEach { quest ->
        Row(
            Modifier.fillMaxWidth().padding(vertical = 6.dp).background(GameSurfaceHigh, RoundedCornerShape(14.dp)).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(if (quest.completed) Icons.Default.CheckCircle else Icons.Outlined.RadioButtonUnchecked, null, tint = if (quest.completed) GameLimeDim else GameTextMuted)
            Spacer(Modifier.width(12.dp))
            Text(quest.title, color = if (quest.completed) GameTextMuted else GameText, modifier = Modifier.weight(1f).alpha(if (quest.completed) .55f else 1f), textDecoration = if (quest.completed) TextDecoration.LineThrough else null, maxLines = 2)
            Text("+${quest.xp} XP", color = GameLime, fontWeight = FontWeight.Black, fontSize = 12.sp)
        }
    }
}

@Composable
private fun AiRewardCard(snapshot: GamificationSnapshot, en: Boolean) = GameCard(HedefitColors.Lime.copy(alpha = .5f)) {
    val reward = snapshot.aiReward
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.Psychology, null, tint = GameLime)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(if (en) "Fit Coach reward" else "Fit Koç ödülü", color = GameText, style = MaterialTheme.typography.titleLarge)
            Text(
                if (reward.extraQuestions > 0) {
                    if (en) "+${reward.extraQuestions} daily AI question${if (reward.extraQuestions == 1) "" else "s"}" else "+${reward.extraQuestions} günlük AI soru hakkı"
                } else {
                    if (en) "Reach 300 XP for your first extra question" else "İlk ek soru hakkın için 300 XP'ye ulaş"
                },
                color = GameTextMuted,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
    reward.nextThreshold?.let { target ->
        Spacer(Modifier.height(12.dp))
        Text(if (en) "Next reward at $target XP" else "Sonraki ödül: $target XP", color = GameLime, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun ChallengeCard(snapshot: GamificationSnapshot) = GameCard(GameHeat.copy(alpha = .45f)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.EmojiEvents, null, tint = GameHeat)
        Spacer(Modifier.width(10.dp))
        Text("Haftalık Meydan Okuma", color = GameText, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
        Pill("250 XP", GameHeat)
    }
    Spacer(Modifier.height(18.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(snapshot.challenge.title, color = GameText, fontSize = 30.sp, lineHeight = 34.sp, fontWeight = FontWeight.Black)
            Text("${"%.1f".format(snapshot.challenge.progress)} / ${snapshot.challenge.target.toInt()} km", color = GameTextMuted, fontWeight = FontWeight.Bold)
        }
        Box(Modifier.size(70.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(progress = { (snapshot.challenge.progress / snapshot.challenge.target).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxSize(), color = GameHeat, trackColor = Color(0xFF0E0F0B), strokeWidth = 7.dp)
            Text("${"%.1f".format(snapshot.challenge.progress)}", color = GameHeat, fontWeight = FontWeight.Black, fontSize = 12.sp)
        }
    }
}

@Composable
private fun LeagueCard(displayName: String, weeklyXp: Int, totalXp: Int, en: Boolean) = GameCard {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.MilitaryTech, null, tint = GameLime)
        Spacer(Modifier.width(10.dp))
        Text(if (en) "League Standing" else "Lig Durumu", color = GameText, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
        Text(leagueFor(totalXp), color = GameTextMuted, fontWeight = FontWeight.Bold)
    }
    Spacer(Modifier.height(12.dp))
    Row(Modifier.fillMaxWidth().background(GameSurfaceHighest, RoundedCornerShape(14.dp)).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("—", color = GameLime, fontSize = 22.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.width(12.dp))
        Box(Modifier.size(42.dp).background(GameLime, CircleShape), contentAlignment = Alignment.Center) { Text(displayName.take(1).uppercase(), color = Color(0xFF1C1C1A), fontWeight = FontWeight.Black) }
        Spacer(Modifier.width(12.dp))
        Text(displayName, color = GameText, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("$weeklyXp XP", color = GameLime, fontWeight = FontWeight.Black)
    }
    Spacer(Modifier.height(10.dp))
    Text(if (en) "Only verified real users will appear here when the shared leaderboard is enabled." else "Ortak liderlik tablosu açıldığında burada yalnızca doğrulanmış gerçek kullanıcılar görünecek.", color = GameTextMuted, style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun AchievementCard(item: Achievement) {
    val unlocked = item.unlockedAt != null
    GameCard(if (unlocked) GameLime.copy(alpha = .35f) else GameInk.copy(alpha = .25f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(56.dp).background(if (unlocked) GameLime.copy(alpha = .12f) else GameSurfaceHigh, CircleShape), contentAlignment = Alignment.Center) {
                Icon(if (unlocked) Icons.Default.FitnessCenter else Icons.Default.Lock, null, tint = if (unlocked) GameLime else GameTextMuted)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(item.title, color = if (unlocked) GameText else GameTextMuted, fontWeight = FontWeight.Black, fontSize = 17.sp)
                Text(item.description, color = GameTextMuted, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(7.dp))
                LinearProgressIndicator(progress = { (item.progress / item.target).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().height(5.dp).clip(CircleShape), color = if (unlocked) GameLime else GameInk, trackColor = GameSurfaceHighest)
            }
            Spacer(Modifier.width(12.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text("+${item.rewardXp} XP", color = if (unlocked) GameLime else GameTextMuted, fontSize = 11.sp, fontWeight = FontWeight.Black)
                Text("${item.progress.toInt()}/${if (item.target % 1.0 == 0.0) item.target.toInt() else item.target}", color = if (unlocked) GameLime else GameTextMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun MotivationCard(message: String) = GameCard(GameLime.copy(alpha = .55f)) {
    Row(verticalAlignment = Alignment.Top) {
        Icon(Icons.Default.Psychology, null, tint = GameLime, modifier = Modifier.size(28.dp))
        Spacer(Modifier.width(12.dp))
        Text(message, color = GameText, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Pill(text: String, color: Color) {
    Box(Modifier.background(GameSurfaceHighest, CircleShape).padding(horizontal = 11.dp, vertical = 6.dp)) { Text(text, color = color, fontSize = 11.sp, fontWeight = FontWeight.Black) }
}

private fun leagueFor(totalXp: Int) = when {
    totalXp >= 20_000 -> "Şampiyon"
    totalXp >= 10_000 -> "Elmas Lig"
    totalXp >= 5_000 -> "Altın Lig"
    totalXp >= 2_000 -> "Gümüş Lig"
    else -> "Bronz Lig"
}
