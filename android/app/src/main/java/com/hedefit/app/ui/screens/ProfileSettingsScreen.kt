package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
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
import com.hedefit.app.ui.validation.ProfileValidationError
import com.hedefit.app.ui.validation.validateProfileFields
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.os.Build
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.net.URL

@Composable
fun ProfileSettingsScreen(
    profile: ProfileData,
    email: String,
    preferences: AppPreferences,
    saving: Boolean,
    avatarUploading: Boolean,
    avatarPreview: ByteArray?,
    accountBusy: Boolean,
    healthConnected: Boolean,
    healthBusy: Boolean,
    onBack: () -> Unit,
    onPreferencesChange: (AppPreferences) -> Unit,
    onOpenQuestionnaire: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenUserGuide: () -> Unit,
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
    var profileError by remember { mutableStateOf<ProfileValidationError?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val bytes = withContext(Dispatchers.IO) { prepareAvatar(context, uri) }
            if (bytes == null || bytes.size > 5 * 1024 * 1024) {
                avatarError = if (en) "Choose a valid JPG, PNG, or WebP image." else "Geçerli bir JPG, PNG veya WebP görsel seç."
            } else {
                avatarError = null
                onUploadAvatar(bytes, "image/jpeg")
            }
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
                        AvatarImage(profile.avatarUrl, avatarPreview, name, en, Modifier.size(64.dp))
                        Column {
                            Text(name.ifBlank { if (en) "Athlete" else "Sporcu" }, style = MaterialTheme.typography.headlineSmall)
                            Text(email, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodyMedium)
                            Text(if (en) "Account verified" else "Hesap doğrulandı", color = HedefitColors.LimeDark, style = MaterialTheme.typography.labelMedium)
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
                        ProfileField(if (en) "Name" else "Adın", name, { name = it; profileError = null }, KeyboardType.Text)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.weight(1f)) { ProfileField("${if (en) "Height" else "Boy"} (${MeasurementUnits.heightUnit(preferences.unitSystem)})", height, { height = it; profileError = null }, KeyboardType.Decimal) }
                            Box(Modifier.weight(1f)) { ProfileField("${if (en) "Weight" else "Kilo"} (${MeasurementUnits.weightUnit(preferences.unitSystem)})", weight, { weight = it; profileError = null }, KeyboardType.Decimal) }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.weight(1f)) { ProfileField(if (en) "Age" else "Yaş", age, { age = it; profileError = null }, KeyboardType.Number) }
                            Box(Modifier.weight(1f)) { ProfileField(if (en) "Gender" else "Cinsiyet", gender, { gender = it; profileError = null }, KeyboardType.Text) }
                        }
                        profileError?.let { error -> Text(profileValidationMessage(error, en), color = HedefitColors.Coral, style = MaterialTheme.typography.bodySmall) }
                        Button(
                            enabled = !saving,
                            onClick = {
                                val heightCm = height.replace(',', '.').toDoubleOrNull()?.let { MeasurementUnits.heightToCm(it, preferences.unitSystem) }
                                val weightKg = weight.replace(',', '.').toDoubleOrNull()?.let { MeasurementUnits.weightToKg(it, preferences.unitSystem) }
                                val error = validateProfileFields(name, age, height, heightCm, weight, weightKg, gender)
                                profileError = error
                                if (error == null) onSave(ProfileUpdateData(name.trim(), age.toIntOrNull(), gender.trim(), heightCm, weightKg, profile.goal, profile.targetWeightKg, profile.targetWeeks, profile.environment, profile.equipment, profile.historyAnswers))
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
                        SettingsRowContent(Icons.Default.MenuBook, if (en) "User guide" else "Kullanım Kılavuzu", if (en) "Learn every part of Hedefit" else "Hedefit'in tüm özelliklerini öğren", onOpenUserGuide)
                        CardDivider()
                        SettingsSwitchRow(Icons.Default.LightMode, if (en) "Light theme" else "Beyaz tema", if (en) "Bright, high-contrast appearance" else "Açık ve yüksek kontrastlı görünüm", !preferences.darkTheme) {
                            onPreferencesChange(preferences.copy(darkTheme = !it))
                        }
                        CardDivider()
                        AccentColorPicker(preferences.accentHue, en) { hue ->
                            onPreferencesChange(preferences.copy(accentHue = hue))
                        }
                        CardDivider()
                        SettingsRowContent(Icons.Default.Language, if (en) "Language" else "Dil", if (preferences.language == "tr") "Türkçe" else "English", onClick = {
                            onPreferencesChange(preferences.copy(language = if (preferences.language == "tr") "en" else "tr"))
                        })
                        CardDivider()
                        SettingsRowContent(Icons.Default.Straighten, if (en) "Measurement units" else "Ölçü birimleri", if (preferences.unitSystem == "imperial") "Imperial • lb, in, mi, fl oz" else "${if (en) "Metric" else "Metrik"} • kg, cm, km, ml", onClick = { showUnits = true })
                        CardDivider()
                        SettingsRowContent(Icons.Default.Notifications, if (en) "Notification calendar" else "Bildirim takvimi", if (en) "Edit days and times" else "Gün ve saatlerini düzenle", onOpenNotifications)
                        CardDivider()
                        SettingsSwitchRow(Icons.Default.DirectionsWalk, if (en) "Show steps in notification bar" else "Adımları bildirim çubuğunda göster", if (en) "Optional ongoing step counter" else "İsteğe bağlı sürekli adım sayar", preferences.stepCounterNotificationEnabled) {
                            onPreferencesChange(preferences.copy(stepCounterNotificationEnabled = it))
                        }
                        CardDivider()
                        SettingsRowContent(Icons.Default.AddToHomeScreen, if (en) "Home screen shortcuts" else "Ana ekran kısayolları", if (en) "Route, workout and meal logging" else "Rota, antrenman ve öğün ekleme", { showShortcut = true })
                        CardDivider()
                        SettingsRowContent(Icons.Default.Favorite, "Health Connect", when {
                            healthBusy -> if (en) "Syncing data…" else "Veriler eşitleniyor…"
                            healthConnected -> if (en) "Connected • steps, sleep, weight and calories" else "Bağlı • adım, uyku, kilo ve kalori"
                            else -> if (en) "Connect Samsung Health, Fitbit and other apps" else "Samsung Health, Fitbit ve diğer uygulamaları bağla"
                        }, onConnectHealth, if (healthConnected) HedefitColors.Lime else HedefitColors.TextSecondary)
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

    if (showReset) ConfirmDialog(if (en) "Delete progress data" else "İlerleme verilerini sil", if (en) "Your workouts, measurements, calories and streak records will be permanently deleted." else "Antrenman, ölçüm, kalori ve seri kayıtların kalıcı olarak silinecek.", if (en) "Reset" else "Sıfırla", accountBusy, en, { showReset = false }) { showReset = false; onResetProgress() }
    if (showFreeze) ConfirmDialog(if (en) "Freeze account" else "Hesabı dondur", if (en) "Your data will remain. App access will pause until you reactivate." else "Verilerin korunacak. Yeniden etkinleştirene kadar uygulama erişimin duracak.", if (en) "Freeze" else "Dondur", accountBusy, en, { showFreeze = false }) { showFreeze = false; onFreeze() }
    if (showDelete) DeleteAccountDialog(email, accountBusy, en, { showDelete = false }) { confirmedEmail -> showDelete = false; onDelete(confirmedEmail) }
    if (showShortcut) ShortcutSettingsDialog(en, { showShortcut = false }) { onAddShortcut(it); showShortcut = false }
    if (showUnits) MeasurementUnitsDialog(preferences.unitSystem, en, { showUnits = false }) { system -> onPreferencesChange(preferences.copy(unitSystem = system)); showUnits = false }
}

@Composable
private fun AccentColorPicker(hue: Float, en: Boolean, onHueChange: (Float) -> Unit) {
    val rainbow = listOf(
        Color(0xFFFF3B30), Color(0xFFFF9500), Color(0xFFFFCC00), Color(0xFF78D85B),
        Color(0xFF00C7BE), Color(0xFF32ADE6), Color(0xFF007AFF), Color(0xFF5856D6),
        Color(0xFFAF52DE), Color(0xFFFF2D55), Color(0xFFFF3B30),
    )
    Column(Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(38.dp).background(HedefitColors.Lime, CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Palette, null, tint = HedefitColors.OnLime, modifier = Modifier.size(21.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(if (en) "Application colour" else "Uygulama rengi", style = MaterialTheme.typography.titleMedium)
                Text(if (en) "Slide to choose your colour" else "İstediğin rengi seçmek için kaydır", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
            TextButton(onClick = { onHueChange(106f) }) {
                Text(if (en) "Reset" else "Sıfırla", color = HedefitColors.Lime)
            }
        }
        Box(Modifier.fillMaxWidth().height(44.dp), contentAlignment = Alignment.Center) {
            Box(
                Modifier.fillMaxWidth().height(12.dp).padding(horizontal = 10.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Brush.horizontalGradient(rainbow)),
            )
            Slider(
                value = hue.coerceIn(0f, 360f),
                onValueChange = onHueChange,
                valueRange = 0f..360f,
                modifier = Modifier.fillMaxWidth(),
                colors = SliderDefaults.colors(
                    thumbColor = HedefitColors.Lime,
                    activeTrackColor = Color.Transparent,
                    inactiveTrackColor = Color.Transparent,
                ),
            )
        }
    }
}

private fun profileValidationMessage(error: ProfileValidationError, en: Boolean) = when (error) {
    ProfileValidationError.NAME -> if (en) "Name must be between 2 and 60 characters." else "Ad 2 ile 60 karakter arasında olmalı."
    ProfileValidationError.AGE -> if (en) "Age must be between 13 and 100." else "Yaş 13 ile 100 arasında olmalı."
    ProfileValidationError.HEIGHT -> if (en) "Height must be between 100 and 250 cm." else "Boy 100 ile 250 cm arasında olmalı."
    ProfileValidationError.WEIGHT -> if (en) "Weight must be between 20 and 400 kg." else "Kilo 20 ile 400 kg arasında olmalı."
    ProfileValidationError.GENDER -> if (en) "Gender can be at most 40 characters." else "Cinsiyet en fazla 40 karakter olabilir."
}

@Composable
private fun AvatarImage(url: String?, previewBytes: ByteArray?, name: String, en: Boolean, modifier: Modifier = Modifier) {
    var bitmap by remember(url) { mutableStateOf<android.graphics.Bitmap?>(null) }
    val preview = remember(previewBytes) { previewBytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size) } }
    LaunchedEffect(url) {
        bitmap = url?.let { address -> withContext(Dispatchers.IO) { runCatching { URL(address).openStream().use(BitmapFactory::decodeStream) }.getOrNull() } }
    }
    Box(modifier.clip(CircleShape).background(HedefitColors.Lime), contentAlignment = Alignment.Center) {
        (preview ?: bitmap)?.let { Image(it.asImageBitmap(), contentDescription = if (en) "Profile photo" else "Profil fotoğrafı", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
            ?: Text(name.take(2).uppercase(), color = HedefitColors.OnLime, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleLarge)
    }
}

private fun prepareAvatar(context: android.content.Context, uri: Uri): ByteArray? = runCatching {
    val source = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, _, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    } else {
        context.contentResolver.openInputStream(uri)?.use(BitmapFactory::decodeStream)
            ?: error("Görsel açılamadı")
    }
    val side = minOf(source.width, source.height)
    val square = Bitmap.createBitmap(source, (source.width - side) / 2, (source.height - side) / 2, side, side)
    val output = if (side > 1024) Bitmap.createScaledBitmap(square, 1024, 1024, true) else square
    ByteArrayOutputStream().use { stream ->
        check(output.compress(Bitmap.CompressFormat.JPEG, 90, stream))
        stream.toByteArray()
    }
}.getOrNull()

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
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (en) "Add to Home screen" else "Ana ekrana ekle") }, text = {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Text(if (en) "Shortcuts" else "Kısayollar", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium) }
            listOf(
                Triple("route", "Hedefit Rota", Icons.Default.Route),
                Triple("workout", if (en) "Workout" else "Antrenman", Icons.Default.FitnessCenter),
                Triple("nutrition", if (en) "Add meal" else "Öğün ekle", Icons.Default.Restaurant),
            ).forEach { (key, label, icon) ->
                item { Button(onClick = { onSelect(key) }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.SurfaceHigh, contentColor = HedefitColors.TextPrimary)) { Icon(icon, null); Spacer(Modifier.width(8.dp)); Text(label) } }
            }
            item { Spacer(Modifier.height(4.dp)); Text(if (en) "Widgets" else "Widget'lar", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.labelMedium) }
            listOf(
                "widget_dashboard" to (if (en) "Today · 4×2" else "Bugün · 4×2"),
                "widget_activity" to (if (en) "Activity · 3×2" else "Aktivite · 3×2"),
                "widget_workout" to (if (en) "Workout · 4×1" else "Antrenman · 4×1"),
                "widget_route" to "Hedefit Rota · 4×2",
                "widget_calories" to (if (en) "Calories · 2×2" else "Kalori · 2×2"),
                "widget_custom" to (if (en) "Custom · 3×2" else "Kişiselleştir · 3×2"),
            ).forEach { (key, label) ->
                item {
                    Button(onClick = { onSelect(key) }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.SurfaceHigh, contentColor = HedefitColors.TextPrimary)) {
                        Icon(Icons.Default.Widgets, null); Spacer(Modifier.width(8.dp)); Text(label)
                    }
                }
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

@Composable private fun ConfirmDialog(title: String, body: String, action: String, busy: Boolean, en: Boolean, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, text = { Text(body) }, dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } }, confirmButton = { TextButton(enabled = !busy, onClick = onConfirm) { Text(if (busy) (if (en) "Processing…" else "İşleniyor…") else action, color = HedefitColors.Coral) } })
}

@Composable private fun DeleteAccountDialog(accountEmail: String, busy: Boolean, en: Boolean, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var phrase by remember { mutableStateOf("") }
    val expectedPhrase = if (en) "DELETE MY ACCOUNT" else "HESABIMI SİL"
    val ready = email.trim().equals(accountEmail, true) && phrase == expectedPhrase
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (en) "Permanently delete account" else "Hesabı kalıcı olarak sil") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(if (en) "Your profile, workouts and all records will be deleted irreversibly." else "Profilin, antrenmanların ve tüm kayıtların geri alınamaz biçimde silinir.")
            OutlinedTextField(email, { email = it }, label = { Text(if (en) "Your email address" else "E-posta adresin") }, singleLine = true)
            OutlinedTextField(phrase, { phrase = it }, label = { Text(if (en) "Type DELETE MY ACCOUNT" else "HESABIMI SİL yaz") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
        } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(if (en) "Cancel" else "Vazgeç") } },
        confirmButton = { TextButton(enabled = ready && !busy, onClick = { onConfirm(email) }) { Text(if (busy) (if (en) "Deleting…" else "Siliniyor…") else if (en) "Delete permanently" else "Kalıcı olarak sil", color = HedefitColors.Coral) } },
    )
}
