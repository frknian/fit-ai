package com.hedefit.app.data.auth

import android.app.Activity
import android.util.Base64
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.hedefit.app.BuildConfig
import java.security.MessageDigest
import java.security.SecureRandom

data class GoogleCredential(val idToken: String, val rawNonce: String)

class GoogleSignInManager(private val activity: Activity) {
    private val credentialManager = CredentialManager.create(activity)

    suspend fun requestCredential(): GoogleCredential {
        val clientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
        require(clientId.isNotEmpty()) {
            "Google girişi için GOOGLE_WEB_CLIENT_ID yapılandırılmamış."
        }
        val rawNonce = generateNonce()
        val option = GetSignInWithGoogleOption.Builder(clientId)
            .setNonce(sha256(rawNonce))
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()
        val result = try {
            credentialManager.getCredential(activity, request)
        } catch (error: GetCredentialException) {
            val message = when (error) {
                is GetCredentialCancellationException -> "Google hesap seçimi kapatıldı."
                is NoCredentialException -> "Bu cihazda kullanılabilir bir Google hesabı bulunamadı."
                is GetCredentialProviderConfigurationException,
                is GetCredentialUnsupportedException -> "Google Play Hizmetleri bu cihazda kullanılamıyor veya güncel değil."
                else -> "Google hesabı seçilemedi (${error.javaClass.simpleName}). Android OAuth istemcisinin paket adı ve SHA parmak izini kontrol et."
            }
            throw IllegalStateException(message, error)
        }
        val credential = result.credential
        if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            error("Google geçerli bir kimlik bilgisi döndürmedi.")
        }
        val google = GoogleIdTokenCredential.createFrom(credential.data)
        return GoogleCredential(google.idToken, rawNonce)
    }

    suspend fun clearCredentialState() {
        runCatching { credentialManager.clearCredentialState(ClearCredentialStateRequest()) }
    }

    private fun generateNonce(): String {
        val bytes = ByteArray(32).also(SecureRandom()::nextBytes)
        return Base64.encodeToString(bytes, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
    }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }
}
