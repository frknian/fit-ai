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
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.hedefit.app.R
import com.hedefit.app.data.auth.AuthState
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.theme.HedefitColors

@Composable
fun AuthGateScreen(
    authState: AuthState,
    busy: Boolean,
    googleBusy: Boolean,
    message: String?,
    onSignIn: (String, String) -> Unit,
    onSignUp: (String, String) -> Unit,
    onGoogleSignIn: () -> Unit,
) {
    when (authState) {
        AuthState.Loading -> FullScreenLoader("Oturum kontrol ediliyor")
        is AuthState.ConfigurationError -> ConfigurationErrorScreen(authState.message)
        AuthState.SignedOut -> AuthForm(busy, googleBusy, message, onSignIn, onSignUp, onGoogleSignIn)
        is AuthState.SignedIn -> Unit
    }
}

@Composable
private fun AuthForm(
    busy: Boolean,
    googleBusy: Boolean,
    message: String?,
    onSignIn: (String, String) -> Unit,
    onSignUp: (String, String) -> Unit,
    onGoogleSignIn: () -> Unit,
) {
    var login by remember { mutableStateOf(true) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordAgain by remember { mutableStateOf("") }
    var reveal by remember { mutableStateOf(false) }
    val localError = when {
        email.isNotBlank() && !android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches() -> "Geçerli bir e-posta adresi yaz."
        password.isNotEmpty() && password.length < 8 -> "Şifre en az 8 karakter olmalı."
        !login && passwordAgain.isNotEmpty() && password != passwordAgain -> "Şifreler eşleşmiyor."
        else -> null
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
            Box(Modifier.size(72.dp).background(HedefitColors.Lime, RoundedCornerShape(22.dp)), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.FitnessCenter, null, tint = HedefitColors.OnLime, modifier = Modifier.size(38.dp))
            }
            Spacer(Modifier.height(18.dp))
            Text("Hedefit", style = MaterialTheme.typography.headlineLarge)
            Text("Hedefine güçlü bir adımla başla.", color = HedefitColors.TextSecondary)
            Spacer(Modifier.height(26.dp))
            HedefitCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(15.dp)) {
                    Row(Modifier.fillMaxWidth().background(HedefitColors.SurfaceHigh, RoundedCornerShape(13.dp)).padding(4.dp)) {
                        AuthModeChip("Giriş Yap", login, Modifier.weight(1f)) { login = true }
                        AuthModeChip("Kayıt Ol", !login, Modifier.weight(1f)) { login = false }
                    }
                    Text(if (login) "Tekrar hoş geldin" else "Hesabını oluştur", style = MaterialTheme.typography.headlineSmall)
                    AuthTextField(email, { email = it }, "E-posta", Icons.Default.Email, KeyboardType.Email)
                    AuthTextField(
                        password, { password = it }, "Şifre", Icons.Default.Lock, KeyboardType.Password,
                        visualTransformation = if (reveal) VisualTransformation.None else PasswordVisualTransformation(),
                        trailing = {
                            IconButton(onClick = { reveal = !reveal }) {
                                Icon(if (reveal) Icons.Default.VisibilityOff else Icons.Default.Visibility, if (reveal) "Şifreyi gizle" else "Şifreyi göster")
                            }
                        },
                    )
                    if (!login) AuthTextField(passwordAgain, { passwordAgain = it }, "Şifre tekrar", Icons.Default.Lock, KeyboardType.Password, PasswordVisualTransformation())
                    (localError ?: message)?.let {
                        Text(it, color = if (message?.contains("gönderildi", true) == true) HedefitColors.Lime else HedefitColors.Coral, style = MaterialTheme.typography.bodyMedium)
                    }
                    PrimaryButton(if (busy) "İşleniyor…" else if (login) "Giriş Yap" else "Hesap Oluştur", onClick = {
                        if (!busy && localError == null && email.isNotBlank() && password.length >= 8) {
                            if (login) onSignIn(email, password) else onSignUp(email, password)
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
                    GoogleSignInButton(disabled = busy, loading = googleBusy, onClick = onGoogleSignIn)
                    Text(
                        if (login) "Hesabın yok mu? Kayıt ol" else "Zaten hesabın var mı? Giriş yap",
                        color = HedefitColors.Lime,
                        modifier = Modifier.align(Alignment.CenterHorizontally).clickable { login = !login },
                    )
                }
            }
        }
    }
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
