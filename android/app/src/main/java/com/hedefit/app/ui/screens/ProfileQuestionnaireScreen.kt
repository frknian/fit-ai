package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.hedefit.app.data.model.ProfileData
import com.hedefit.app.data.model.ProfileUpdateData
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.theme.HedefitColors
import kotlin.math.abs
import kotlin.math.ceil

private data class ProfileQuestion(val title: String, val subtitle: String, val choices: List<String> = emptyList(), val freeText: Boolean = false)

private val profileQuestions = listOf(
    ProfileQuestion("Ana hedefin ne?", "Programın ve tahmini süren bu hedefe göre hazırlanır.", listOf("Kilo verme", "Kilo alma", "Kas alma", "Formu koruma")),
    ProfileQuestion("Bunu neden istiyorsun?", "Seni harekete geçiren kişisel nedenini yaz.", freeText = true),
    ProfileQuestion("Seni en çok ne durdurdu?", "Sürdürülebilir bir plan için gerçek engeli seç.", listOf("Zaman", "Motivasyon", "Sakatlık", "Program eksikliği", "Beslenme")),
    ProfileQuestion("Daha önce düzenli spor yaptın mı?", "Geçmiş deneyimin", listOf("Hayır", "Kısa süre", "6–12 ay", "1 yıldan fazla")),
    ProfileQuestion("Kendini hangi seviyede görüyorsun?", "Yoğunluğu buna göre ayarlarız.", listOf("Başlangıç", "Orta", "İleri")),
    ProfileQuestion("Son 3 ayda haftada kaç gün spor yaptın?", "Mevcut alışkanlığın", listOf("0 gün", "1–2 gün", "3–4 gün", "5+ gün")),
    ProfileQuestion("Haftada kaç gün ayırabilirsin?", "Gerçekçi bir tempo seç.", listOf("2 gün", "3 gün", "4 gün", "5 gün", "6 gün")),
    ProfileQuestion("Bir antrenman için ne kadar süren var?", "Isınma ve soğuma dahil ayırabileceğin toplam süre.", listOf("15 dk", "30 dk", "45 dk", "60 dk", "75+ dk")),
    ProfileQuestion("Hangi antrenmanları seversin?", "Planın karakteri", listOf("Ağırlık", "HIIT", "Koşu", "Pilates", "Vücut ağırlığı")),
    ProfileQuestion("Nerede çalışacaksın?", "Egzersizler ortama göre seçilir.", listOf("Evde", "Spor salonunda", "Açık havada", "Karışık")),
    ProfileQuestion("Hangi ekipmanların var?", "En sık kullanacağın ekipmanı seç.", listOf("Ekipman yok", "Dambıl", "Direnç bandı", "Tam salon", "Kardiyo aleti")),
    ProfileQuestion("Ağrı veya sakatlık var mı?", "Güvenli hareket seçimi için önemlidir.", listOf("Yok", "Bel", "Diz", "Omuz", "Boyun", "Diğer")),
    ProfileQuestion("Gün içinde ne kadar hareketlisin?", "Günlük enerji hesabı", listOf("Çoğunlukla oturuyorum", "Ara sıra hareket", "Aktif", "Çok aktif")),
    ProfileQuestion("Uyku düzenin nasıl?", "Toparlanma kapasiten", listOf("5 saatten az", "5–6 saat", "7–8 saat", "9+ saat")),
    ProfileQuestion("Koçunun bilmesi gereken başka bir şey?", "Tercih, kısıt veya not ekleyebilirsin.", freeText = true),
)

@Composable
fun ProfileQuestionnaireScreen(profile: ProfileData, saving: Boolean, onClose: () -> Unit, onSave: (ProfileUpdateData) -> Unit) {
    val answers = remember(profile) { mutableStateListOf<String>().apply { addAll((profile.historyAnswers + List(15) { "" }).take(15)) } }
    var index by remember { mutableIntStateOf(0) }
    var targetText by remember(profile) { mutableStateOf(profile.targetWeightKg?.toString() ?: suggestedTarget(profile).toString()) }
    val question = profileQuestions[index]
    val goal = if (index == 0) answers[0] else answers[0].ifBlank { profile.goal }
    val target = targetText.toDoubleOrNull()
    val weeks = estimateWeeks(profile.weightKg, target, goal)

    Column(Modifier.fillMaxSize().background(HedefitColors.Background).statusBarsPadding().navigationBarsPadding()) {
        UtilityHeader("Profil testi", onClose)
        LinearProgressIndicator(progress = { (index + 1) / 15f }, modifier = Modifier.fillMaxWidth(), color = HedefitColors.Lime, trackColor = HedefitColors.Divider)
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { Text("${index + 1} / 15", color = HedefitColors.Lime, style = MaterialTheme.typography.labelLarge) }
            item { Text(question.title, color = HedefitColors.TextPrimary, style = MaterialTheme.typography.headlineMedium) }
            item { Text(question.subtitle, color = HedefitColors.TextSecondary) }
            if (question.freeText) item {
                OutlinedTextField(answers[index], { answers[index] = it }, modifier = Modifier.fillMaxWidth().heightIn(min = 130.dp), placeholder = { Text("Yanıtını yaz…") }, colors = questionnaireFieldColors())
            } else items(question.choices.size) { choiceIndex ->
                val choice = question.choices[choiceIndex]
                val selected = answers[index] == choice
                Row(
                    Modifier.fillMaxWidth().background(if (selected) HedefitColors.Lime.copy(alpha = .16f) else HedefitColors.Surface, RoundedCornerShape(16.dp))
                        .clickable { answers[index] = choice }.padding(17.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(choice, Modifier.weight(1f), color = HedefitColors.TextPrimary, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
                    if (selected) Icon(Icons.Default.Check, null, tint = HedefitColors.Lime)
                }
            }
            if (index == 0 && answers[0] != "Formu koruma") item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(targetText, { targetText = it }, label = { Text("Hedef kilo (kg)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth(), colors = questionnaireFieldColors())
                    if (target != null && weeks != null) {
                        Surface(color = HedefitColors.SurfaceHigh, shape = RoundedCornerShape(16.dp)) {
                            Column(Modifier.padding(16.dp)) {
                                Text("Tahmini $weeks hafta", style = MaterialTheme.typography.titleLarge, color = HedefitColors.Lime)
                                Text("Sağlıklı ve sürdürülebilir haftalık değişim hızına göre hesaplandı.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
        Row(Modifier.padding(20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (index > 0) OutlinedButton(onClick = { index-- }, modifier = Modifier.weight(.7f).height(56.dp), colors = ButtonDefaults.outlinedButtonColors(contentColor = HedefitColors.TextPrimary)) { Text("Geri") }
            Button(
                enabled = (answers[index].isNotBlank() || question.freeText) && !saving,
                onClick = {
                    if (index < 14) index++ else onSave(ProfileUpdateData(
                        profile.displayName, profile.age, profile.gender, profile.heightCm, profile.weightKg,
                        answers[0].ifBlank { profile.goal }, target, weeks, answers[9].ifBlank { profile.environment }, answers[10].ifBlank { profile.equipment }, answers.toList(),
                    ))
                },
                modifier = Modifier.weight(1.3f).height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime),
            ) { Text(if (saving) "Plan hazırlanıyor…" else if (index == 14) "Kaydet ve planı yenile" else "Devam") }
        }
    }
}

@Composable
private fun questionnaireFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = HedefitColors.TextPrimary,
    unfocusedTextColor = HedefitColors.TextPrimary,
    focusedBorderColor = HedefitColors.Lime,
    unfocusedBorderColor = HedefitColors.Divider,
    focusedLabelColor = HedefitColors.Lime,
    unfocusedLabelColor = HedefitColors.TextSecondary,
    focusedPlaceholderColor = HedefitColors.TextSecondary,
    unfocusedPlaceholderColor = HedefitColors.TextSecondary,
    cursorColor = HedefitColors.Lime,
)

private fun suggestedTarget(profile: ProfileData): Double {
    val weight = profile.weightKg ?: 75.0
    return when {
        profile.goal.contains("ver", true) -> weight - 6
        else -> weight + 4
    }.coerceAtLeast(40.0)
}

private fun estimateWeeks(current: Double?, target: Double?, goal: String): Int? {
    if (current == null || target == null) return null
    val rate = if (goal.contains("Kas", true)) .25 else .5
    return ceil(abs(target - current) / rate).toInt().coerceAtLeast(1)
}
