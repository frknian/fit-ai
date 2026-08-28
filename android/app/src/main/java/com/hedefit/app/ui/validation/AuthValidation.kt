package com.hedefit.app.ui.validation

private val emailPattern = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

fun validateAuthForm(
    email: String,
    password: String,
    passwordAgain: String,
    login: Boolean,
    submitted: Boolean,
): String? = when {
    submitted && email.isBlank() -> "E-posta adresini yaz."
    email.isNotBlank() && !emailPattern.matches(email.trim()) -> "Geçerli bir e-posta adresi yaz."
    submitted && password.isEmpty() -> "Şifreni yaz."
    password.isNotEmpty() && password.length < 8 -> "Şifre en az 8 karakter olmalı."
    !login && submitted && passwordAgain.isEmpty() -> "Şifreni tekrar yaz."
    !login && passwordAgain.isNotEmpty() && password != passwordAgain -> "Şifreler eşleşmiyor."
    else -> null
}
