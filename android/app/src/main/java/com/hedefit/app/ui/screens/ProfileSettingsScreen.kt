package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.hedefit.app.data.model.ProfileData
import com.hedefit.app.data.model.ProfileUpdateData
import com.hedefit.app.ui.components.*
import com.hedefit.app.ui.settings.AppPreferences
import com.hedefit.app.ui.settings.MeasurementUnits
import com.hedefit.app.ui.theme.HedefitColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.graphics.BitmapFactory
import java.net.URL

@Composable
fun ProfileSettingsScreen(
    profile: ProfileData,
    email: String,
    preferences: AppPreferences,
    saving: Boolean,
    avatarUploading: Boolean,
    accountBusy: Boolean,
    healthConnected: Boolean,
    healthBusy: Boolean,
    onBack: () -> Unit,
    onPreferencesChange: (AppPreferences) -> Unit,
    onOpenQuestionnaire: () -> Unit,
    onOpenNotifications: () -> Unit,
    onAddShortcut: (String) -> Unit,
    onConnectHealth: () -> Unit,
    onSave: (ProfileUpdateData) -> Unit,
    onUploadAvatar: (ByteArray, String) -> Unit,
    onResetProgress: () -> Unit,
    onFreeze: () -> Unit,
    onDelete: (String) -> Unit,
    onSignOut: () -> Unit,
) {
    val en = preferences.language == "en"
    var name by remember(profile) { mutableStateOf(profile.displayName) }
    var age by remember(profile) { mutableStateOf(profile.age?.toString().orEmpty()) }
    var height by remember(profile, preferences.unitSystem) { mutableStateOf(profile.heightCm?.let { "%.1f".format(MeasurementUnits.heightValue(it, preferences.unitSystem)).replace(',', '.') }.orEmpty()) }
    var weight by remember(profile, preferences.unitSystem) { mutableStateOf(profile.weightKg?.let { "%.1f".format(MeasurementUnits.weightValue(it, preferences.unitSystem)).replace(',', '.') }.orEmpty()) }
    var gender by remember(profile) { mutableStateOf(profile.gender) }
    var showReset by remember { mutableStateOf(false) }
    var showFreeze by remember { mutableStateOf(false) }
    var showDelete by remember { mutableStateOf(false) }
    var showShortcut by remember { mutableStateOf(false) }
    var showUnits by remember { mutableStateOf(false) }
    var avatarError by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
        val bytes = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
        if (bytes == null || bytes.size > 5 * 1024 * 1024 || mime !in setOf("image/jpeg", "image/png", "image/webp")) {
            avatarError = if (en) "Choose a JPG, PNG, or WebP image up to 5 MB." else "En fazla 5 MB boyutunda JPG, PNG veya WebP görsel seç."
        } else {
            avatarError = null
            onUploadAvatar(bytes, mime)
        }
    }

    Column(Modifier.fillMaxSize().background(HedefitColors.Background).statusBarsPadding()) {
        UtilityHeader(if (en) "Profile and Settings" else "Profil ve Ayarlar", onBack)
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(18.dp, 8.dp, 18.dp, 42.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        AvatarImage(profile.avatarUrl, name, Modifier.size(64.dp))
                        Column {
                            Text(name.ifBlank { "Sporcu" }, style = MaterialTheme.typography.headlineSmall)
                            Text(email, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodyMedium)
                            Text(if (en) "Google account verified" else "Google hesabı doğrulandı", color = HedefitColors.LimeDark, style = MaterialTheme.typography.labelMedium)
                            TextButton(enabled = !avatarUploading, onClick = { avatarPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, contentPadding = PaddingValues(0.dp)) { Icon(Icons.Default.AddAPhoto, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(5.dp)); Text(if (avatarUploading) (if (en) "Uploading…" else "Yükleniyor…") else if (en) "Change profile photo" else "Profil fotoğrafını değiştir") }
                        }
                    }
                    avatarError?.let { Text(it, color = HedefitColors.Coral, style = MaterialTheme.typography.bodySmall) }
                }
            }
            item { SettingsSectionTitle(if (en) "Body and profile" else "Vücut ve profil") }
            item {
                HedefitCard {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        ProfileField("Adın", name, { name = it }, KeyboardType.Text)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.weight(1f)) { ProfileField("${if (en) "Height" else "Boy"} (${MeasurementUnits.heightUnit(preferences.unitSystem)})", height, { height = it }, KeyboardType.Decimal) }
                            Box(Modifier.weight(1f)) { ProfileField("${if (en) "Weight" else "Kilo"} (${MeasurementUnits.weightUnit(preferences.unitSystem)})", weight, { weight = it }, KeyboardType.Decimal) }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.weight(1f)) { ProfileField("Yaş", age, { age = it }, KeyboardType.Number) }
                            Box(Modifier.weight(1f)) { ProfileField("Cinsiyet", gender, { gender = it }, KeyboardType.Text) }
                        }
                        Button(
                            enabled = !saving,
                            onClick = {
                                onSave(ProfileUpdateData(name, age.toIntOrNull(), gender, height.toDoubleOrNull()?.let { MeasurementUnits.heightToCm(it, preferences.unitSystem) }, weight.toDoubleOrNull()?.let { MeasurementUnits.weightToKg(it, preferences.unitSystem) }, profile.goal, profile.targetWeightKg, profile.targetWeeks, profile.environment, profile.equipment, profile.historyAnswers))
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime),
                        ) { Text(if (saving) (if (en) "Saving…" else "Kaydediliyor…") else if (en) "Save profile changes" else "Profil değişikliklerini kaydet") }
                    }
                }
            }
            item {
                SettingsRow(Icons.Default.Tune, if (en) "Answer the 15 questions again" else "15 soruyu yeniden cevapla", if (en) "Refresh goal, level, equipment and plan" else "Hedef, seviye, ekipman ve programını yenile", onOpenQuestionnaire)
            }
            item { SettingsSectionTitle(if (en) "Application" else "Uygulama") }
            item {
                HedefitCard {
                    Column {
                        SettingsSwitchRow(Icons.Default.LightMode, if (en) "Light theme" else "Beyaz tema", if (en) "Bright, high-contrast appearance" else "Açık ve yüksek kontrastlı görünüm", !preferences.darkTheme) {
                            onPreferencesChange(preferences.copy(darkTheme = !it))
                        }
                        CardDivider()
                        SettingsRowContent(Icons.Default.Language, if (en) "Language" else "Dil", if (preferences.language == "tr") "Türkçe" else "English", onClick = {
                            onPreferencesChange(preferences.copy(language = if (preferences.language == "tr") "en" else "tr"))
                        })
                        CardDivider()
                        SettingsRowContent(Icons.Default.Straighten, if (en) "Measurement units" else "Ölçü birimleri", if (preferences.unitSystem == "imperial") "Imperial • lb, in, mi, fl oz" else "Metrik • kg, cm, km, ml", onClick = { showUnits = true })
                        CardDivider()
                        SettingsRowContent(Icons.Default.Notifications, if (en) "Notification calendar" else "Bildirim takvimi", if (en) "Edit days and times" else "Gün ve saatlerini düzenle", onOpenNotifications)
                        CardDivider()
                        SettingsRowContent(Icons.Default.AddToHomeScreen, if (en) "Home screen shortcuts" else "Ana ekran kısayolları", if (en) "Route, workout and meal logging" else "Rota, antrenman ve öğün ekleme", { showShortcut = true })
                        CardDivider()
                        SettingsRowContent(Icons.Default.Favorite, "Health Connect", when { healthBusy -> "Veriler eşitleniyor…"; healthConnected -> "Bağlı • adım, uyku, kilo ve kalori"; else -> "Samsung Health, Fitbit ve diğer uygulamaları bağla" }, onConnectHealth, if (healthConnected) HedefitColors.Lime else HedefitColors.TextSecondary)
                    }
                }
            }
            item { SettingsSectionTitle(if (en) "Data controls" else "Veri kontrolü") }
            item {
                HedefitCard {
                    Column {
                        SettingsRowContent(Icons.Default.Refresh, if (en) "Reset progress" else "İlerlemeyi sıfırla", if (en) "Logs are deleted; profile and plan remain" else "Kayıtlar silinir, profil ve plan korunur", onClick = { showReset = true })
                        CardDivider()
                        SettingsRowContent(Icons.Default.PauseCircle, if (en) "Freeze account" else "Hesabı dondur", if (en) "Your data remains while access pauses" else "Verilerin korunur, erişimin duraklar", onClick = { showFreeze = true })
                        CardDivider()
                        SettingsRowContent(Icons.Default.Logout, if (en) "Sign out" else "Çıkış yap", if (en) "Close the session on this device" else "Bu cihazdaki oturumu kapat", onSignOut)
                        CardDivider()
                        SettingsRowContent(Icons.Default.DeleteForever, if (en) "Delete account permanently" else "Hesabı kalıcı sil", if (en) "All data will be deleted permanently" else "Tüm veriler geri alınamaz biçimde silinir", { showDelete = true }, HedefitColors.Coral)
                    }
                }
            }
        }
    }

    if (showReset) ConfirmDialog("İlerleme verilerini sil", "Antrenman, ölçüm, kalori ve seri kayıtların kalıcı olarak silinecek.", "Sıfırla", accountBusy, { showReset = false }) { showReset = false; onResetProgress() }
    if (showFreeze) ConfirmDialog("Hesabı dondur", "Verilerin korunacak. Yeniden etkinleştirene kadar uygulama erişimin duracak.", "Dondur", accountBusy, { showFreeze = false }) { showFreeze = false; onFreeze() }
    if (showDelete) DeleteAccountDialog(email, accountBusy, { showDelete = false }) { confirmedEmail -> showDelete = false; onDelete(confirmedEmail) }
    if (showShortcut) ShortcutSettingsDialog(en, { showShortcut = false }) { onAddShortcut(it); showShortcut = false }
    if (showUnits) MeasurementUnitsDialog(preferences.unitSystem, en, { showUnits = false }) { system -> onPreferencesChange(preferences.copy(unitSystem = system)); showUnits = false }
}

@Composable
private fun AvatarImage(url: String?, name: String, modifier: Modifier = Modifier) {
    var bitmap by remember(url) { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(url) {
        bitmap = url?.let { address -> withContext(Dispatchers.IO) { runCatching { URL(address).openStream().use(BitmapFactory::decodeStream) }.getOrNull() } }
    }
    Box(modifier.background(HedefitColors.Lime, CircleShape), contentAlignment = Alignment.Center) {
        bitmap?.let { Image(it.asImageBitmap(), contentDescription = "Profil fotoğrafı", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
            ?: Text(name.take(2).uppercase(), color = HedefitColors.OnLime, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
private fun MeasurementUnitsDialog(selected: String, en: Boolean, onDismiss: () -> Unit, onSelect: (String) -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (en) "Measurement units" else "Ölçü birimleri") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                Triple("metric", if (en) "Metric" else "Metrik", "kg • cm • km • ml"),
                Triple("imperial", "Imperial", "lb • in • mi • fl oz"),
            ).forEach { (key, title, subtitle) ->
                HedefitCard(Modifier.fillMaxWidth(), onClick = { onSelect(key) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected == key, onClick = { onSelect(key) })
                        Column { Text(title, style = MaterialTheme.typography.titleMedium); Text(subtitle, color = HedefitColors.TextSecondary) }
                    }
                }
            }
        } },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } },
    )
}

@Composable
private fun ShortcutSettingsDialog(en: Boolean, onDismiss: () -> Unit, onSelect: (String) -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (en) "Add shortcut" else "Kısayol ekle") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                Triple("route", "Hedefit Rota", Icons.Default.Route),
                Triple("workout", if (en) "Workout" else "Antrenman", Icons.Default.FitnessCenter),
                Triple("nutrition", if (en) "Add meal" else "Öğün ekle", Icons.Default.Restaurant),
            ).forEach { (key, label, icon) ->
                Button(onClick = { onSelect(key) }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.SurfaceHigh, contentColor = HedefitColors.TextPrimary)) { Icon(icon, null); Spacer(Modifier.width(8.dp)); Text(label) }
            }
        }
    }, confirmButton = {}, dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Close" else "Kapat") } })
}

@Composable
fun UtilityHeader(title: String, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(58.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri", tint = HedefitColors.TextPrimary) }
        Text(title, color = HedefitColors.TextPrimary, style = MaterialTheme.typography.titleLarge)
    }
}

@Composable private fun SettingsSectionTitle(text: String) = Text(text.uppercase(), color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium)

@Composable private fun ProfileField(label: String, value: String, onChange: (String) -> Unit, keyboardType: KeyboardType) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType), modifier = Modifier.fillMaxWidth(),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = HedefitColors.Lime, unfocusedBorderColor = HedefitColors.Divider),
    )
}

@Composable private fun SettingsRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    HedefitCard(onClick = onClick) { SettingsRowContent(icon, title, subtitle, onClick) }
}

@Composable private fun SettingsRowContent(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit, tint: Color = HedefitColors.Lime) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, null, tint = tint)
        Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.titleMedium); Text(subtitle, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
        Icon(Icons.Default.ChevronRight, null, tint = HedefitColors.TextSecondary)
    }
}

@Composable private fun SettingsSwitchRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, checked: Boolean, onChecked: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, null, tint = HedefitColors.Lime)
        Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.titleMedium); Text(subtitle, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
        Switch(checked, onChecked, colors = SwitchDefaults.colors(checkedThumbColor = HedefitColors.OnLime, checkedTrackColor = HedefitColors.Lime))
    }
}

@Composable private fun ConfirmDialog(title: String, body: String, action: String, busy: Boolean, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, text = { Text(body) }, dismissButton = { TextButton(onClick = onDismiss) { Text("Vazgeç") } }, confirmButton = { TextButton(enabled = !busy, onClick = onConfirm) { Text(if (busy) "İşleniyor…" else action, color = HedefitColors.Coral) } })
}

@Composable private fun DeleteAccountDialog(accountEmail: String, busy: Boolean, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var phrase by remember { mutableStateOf("") }
    val ready = email.trim().equals(accountEmail, true) && phrase == "HESABIMI SİL"
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Hesabı kalıcı olarak sil") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Profilin, antrenmanların ve tüm kayıtların geri alınamaz biçimde silinir.")
            OutlinedTextField(email, { email = it }, label = { Text("E-posta adresin") }, singleLine = true)
            OutlinedTextField(phrase, { phrase = it }, label = { Text("HESABIMI SİL yaz") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
        } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Vazgeç") } },
        confirmButton = { TextButton(enabled = ready && !busy, onClick = { onConfirm(email) }) { Text(if (busy) "Siliniyor…" else "Kalıcı olarak sil", color = HedefitColors.Coral) } },
    )
}
