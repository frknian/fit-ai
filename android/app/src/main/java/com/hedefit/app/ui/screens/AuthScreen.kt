package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hedefit.app.R
import com.hedefit.app.data.auth.AuthState
import com.hedefit.app.data.auth.RegistrationLegalAcceptance
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.theme.HedefitColors
import com.hedefit.app.ui.validation.validateAuthForm

@Composable
fun AuthGateScreen(
    authState: AuthState,
    busy: Boolean,
    googleBusy: Boolean,
    message: String?,
    onSignIn: (String, String) -> Unit,
    onSignUp: (String, String, RegistrationLegalAcceptance) -> Unit,
    onGoogleSignIn: (RegistrationLegalAcceptance?) -> Unit,
    onClearMessage: () -> Unit,
) {
    when (authState) {
        AuthState.Loading -> FullScreenLoader("Oturum kontrol ediliyor")
        is AuthState.ConfigurationError -> ConfigurationErrorScreen(authState.message)
        AuthState.SignedOut -> AuthForm(busy, googleBusy, message, onSignIn, onSignUp, onGoogleSignIn, onClearMessage)
        is AuthState.SignedIn -> Unit
    }
}

@Composable
private fun AuthForm(
    busy: Boolean,
    googleBusy: Boolean,
    message: String?,
    onSignIn: (String, String) -> Unit,
    onSignUp: (String, String, RegistrationLegalAcceptance) -> Unit,
    onGoogleSignIn: (RegistrationLegalAcceptance?) -> Unit,
    onClearMessage: () -> Unit,
) {
    var login by remember { mutableStateOf(true) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordAgain by remember { mutableStateOf("") }
    var reveal by remember { mutableStateOf(false) }
    var submitted by remember { mutableStateOf(false) }
    var kvkkAccepted by remember { mutableStateOf(false) }
    var privacyAccepted by remember { mutableStateOf(false) }
    var legalDocument by remember { mutableStateOf<LegalDocument?>(null) }
    fun legalError(requireSubmission: Boolean): String? = when {
        login || (requireSubmission && !submitted) -> null
        !kvkkAccepted -> "KVKK Aydınlatma Metni'ni okuduğunu onaylamalısın."
        !privacyAccepted -> "Gizlilik Politikası'nı kabul etmelisin."
        else -> null
    }
    val localError = validateAuthForm(email, password, passwordAgain, login, submitted) ?: legalError(requireSubmission = true)
    fun edited(change: () -> Unit) {
        change()
        if (message != null) onClearMessage()
    }

    Box(
        Modifier.fillMaxSize().background(
            Brush.radialGradient(listOf(HedefitColors.Lime.copy(alpha = .12f), HedefitColors.Background), radius = 900f),
        ).safeDrawingPadding().imePadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.fillMaxWidth().widthIn(max = 460.dp).padding(22.dp).verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(R.drawable.app_logo_transparent),
                contentDescription = "Hedefit logosu",
                modifier = Modifier.size(88.dp),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "HEDEFIT",
                fontWeight = FontWeight.Black,
                fontSize = 38.sp,
                letterSpacing = 1.5.sp,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                "Hedefine güçlü bir adımla başla.",
                color = HedefitColors.TextSecondary,
                fontStyle = FontStyle.Italic,
                style = MaterialTheme.typography.bodyLarge,
            )
            Spacer(Modifier.height(26.dp))
            HedefitCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(15.dp)) {
                    Row(Modifier.fillMaxWidth().background(HedefitColors.SurfaceHigh, RoundedCornerShape(13.dp)).padding(4.dp)) {
                        AuthModeChip("Giriş Yap", login, Modifier.weight(1f)) { edited { login = true; submitted = false } }
                        AuthModeChip("Kayıt Ol", !login, Modifier.weight(1f)) { edited { login = false; submitted = false } }
                    }
                    if (!login) Text("Hesabını oluştur", style = MaterialTheme.typography.headlineSmall)
                    AuthTextField(email, { next -> edited { email = next } }, "E-posta", Icons.Default.Email, KeyboardType.Email)
                    AuthTextField(
                        password, { next -> edited { password = next } }, "Şifre", Icons.Default.Lock, KeyboardType.Password,
                        visualTransformation = if (reveal) VisualTransformation.None else PasswordVisualTransformation(),
                        trailing = {
                            IconButton(onClick = { reveal = !reveal }) {
                                Icon(if (reveal) Icons.Default.VisibilityOff else Icons.Default.Visibility, if (reveal) "Şifreyi gizle" else "Şifreyi göster")
                            }
                        },
                    )
                    if (!login) {
                        AuthTextField(passwordAgain, { next -> edited { passwordAgain = next } }, "Şifre tekrar", Icons.Default.Lock, KeyboardType.Password, PasswordVisualTransformation())
                        LegalAcceptanceFields(
                            kvkkAccepted = kvkkAccepted,
                            privacyAccepted = privacyAccepted,
                            onKvkkChange = { kvkkAccepted = it },
                            onPrivacyChange = { privacyAccepted = it },
                            onOpenDocument = { legalDocument = it },
                        )
                    }
                    (localError ?: message)?.let {
                        Text(it, color = if (message?.contains("gönderildi", true) == true) HedefitColors.Lime else HedefitColors.Coral, style = MaterialTheme.typography.bodyMedium)
                    }
                    PrimaryButton(if (busy) "İşleniyor…" else if (login) "Giriş Yap" else "Hesap Oluştur", onClick = {
                        submitted = true
                        val error = validateAuthForm(email, password, passwordAgain, login, submitted = true) ?: legalError(requireSubmission = false)
                        if (!busy && error == null) {
                            if (login) onSignIn(email.trim(), password)
                            else onSignUp(email.trim(), password, RegistrationLegalAcceptance(kvkkAccepted, privacyAccepted))
                        }
                    })
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.weight(1f).height(1.dp).background(HedefitColors.Divider))
                        Text("veya", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                        Box(Modifier.weight(1f).height(1.dp).background(HedefitColors.Divider))
                    }
                    GoogleSignInButton(disabled = busy, loading = googleBusy, onClick = {
                        if (login) onGoogleSignIn(null)
                        else if (kvkkAccepted && privacyAccepted) onGoogleSignIn(RegistrationLegalAcceptance(kvkkAccepted, privacyAccepted))
                        else submitted = true
                    })
                    Text(
                        if (login) "Hesabın yok mu? Kayıt ol" else "Zaten hesabın var mı? Giriş yap",
                        color = HedefitColors.Lime,
                        modifier = Modifier.align(Alignment.CenterHorizontally).clickable { edited { login = !login; submitted = false } },
                    )
                }
            }
        }
    }
    legalDocument?.let { LegalDocumentDialog(it) { legalDocument = null } }
}

private enum class LegalDocument { Kvkk, Privacy }

@Composable
private fun LegalAcceptanceFields(
    kvkkAccepted: Boolean,
    privacyAccepted: Boolean,
    onKvkkChange: (Boolean) -> Unit,
    onPrivacyChange: (Boolean) -> Unit,
    onOpenDocument: (LegalDocument) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = kvkkAccepted, onCheckedChange = onKvkkChange)
            TextButton(onClick = { onOpenDocument(LegalDocument.Kvkk) }) { Text("KVKK Aydınlatma Metni'ni okudum") }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = privacyAccepted, onCheckedChange = onPrivacyChange)
            TextButton(onClick = { onOpenDocument(LegalDocument.Privacy) }) { Text("Gizlilik Politikası'nı okudum ve kabul ediyorum") }
        }
    }
}

@Composable
private fun LegalDocumentDialog(document: LegalDocument, onDismiss: () -> Unit) {
    val (title, body) = when (document) {
        LegalDocument.Kvkk -> "KVKK Aydınlatma Metni" to "Hedefit; hesap oluşturma, kişisel antrenman planı, beslenme ve ilerleme takibi hizmetlerini sunmak için e-posta, hesap bilgileri, profil/ölçüm, antrenman, beslenme ve uygulama kullanım verilerini işler. Sağlıkla ilgili veriler yalnızca uygulamada seçtiğin özellikleri sunmak için ve gerekli olduğu ölçüde işlenir. Veriler, hizmet altyapısı sağlayıcılarına teknik hizmet sunumu amacıyla aktarılabilir; reklam veya pazarlama amacıyla satılmaz. Verilerin işlenmesi, saklanması, silinmesi ve KVKK kapsamındaki erişim, düzeltme, silme ve itiraz haklarınla ilgili ayrıntılar yayımlanacak nihai aydınlatma metninde yer alır."
        LegalDocument.Privacy -> "Gizlilik Politikası" to "Hedefit hesabın, planın, öğünlerin, ölçümlerin ve uygulama tercihlerin kişiselleştirilmiş hizmet sunmak için saklanır. Hesap ayarlarından verilerini güncelleyebilir; uygulama içindeki hesap silme akışıyla hesabının silinmesini isteyebilirsin. Yerel Fit Koç modeli cihazında çalışır; bu modda sohbet içeriği sunucuya gönderilmez. Güvenlik için erişim kontrolleri ve şifreli bağlantılar kullanılır. Bu metin uygulama sürümüyle birlikte güncellenebilir; önemli değişiklikler ayrıca bildirilir."
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body, modifier = Modifier.verticalScroll(rememberScrollState()), style = MaterialTheme.typography.bodyMedium) },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Okudum") } },
    )
}

@Composable
private fun GoogleSignInButton(disabled: Boolean, loading: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .height(52.dp)
            .background(Color.White, RoundedCornerShape(14.dp))
            .border(1.dp, Color(0xFFDADCE0), RoundedCornerShape(14.dp))
            .clickable(enabled = !disabled, onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Image(painterResource(R.drawable.ic_google), contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(12.dp))
        Text(
            if (loading) "Google bekleniyor…" else "Google ile devam et",
            color = Color(0xFF202124),
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun AuthModeChip(text: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.background(if (selected) HedefitColors.Lime else HedefitColors.SurfaceHigh, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick).padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (selected) HedefitColors.OnLime else HedefitColors.TextSecondary, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun AuthTextField(
    value: String,
    onValue: (String) -> Unit,
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    keyboardType: KeyboardType,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailing: @Composable (() -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValue,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        leadingIcon = { Icon(icon, null, tint = HedefitColors.TextSecondary) },
        trailingIcon = trailing,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = visualTransformation,
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = HedefitColors.Lime,
            unfocusedBorderColor = HedefitColors.Divider,
            focusedContainerColor = HedefitColors.SurfaceHigh,
            unfocusedContainerColor = HedefitColors.SurfaceHigh,
        ),
    )
}

@Composable
fun FullScreenLoader(message: String) {
    Box(Modifier.fillMaxSize().background(HedefitColors.Background), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            CircularProgressIndicator(color = HedefitColors.Lime)
            Text(message, color = HedefitColors.TextSecondary)
        }
    }
}

@Composable
private fun ConfigurationErrorScreen(message: String) {
    Box(Modifier.fillMaxSize().background(HedefitColors.Background).padding(24.dp), contentAlignment = Alignment.Center) {
        HedefitCard(Modifier.widthIn(max = 520.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Android yapılandırması eksik", style = MaterialTheme.typography.headlineSmall, color = HedefitColors.Coral)
                Text(message)
                Text("Kök .env dosyasında NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY değerlerini tanımlayıp uygulamayı yeniden derle.", color = HedefitColors.TextSecondary)
            }
        }
    }
}
