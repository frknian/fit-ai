package com.hedefit.app.data.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureSessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("hedefit_secure_session", Context.MODE_PRIVATE)

    fun read(): AuthSession? = runCatching {
        val encrypted = preferences.getString(KEY_PAYLOAD, null) ?: return null
        val wrapper = JSONObject(encrypted)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val iv = Base64.decode(wrapper.getString("iv"), Base64.NO_WRAP)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
        val clear = cipher.doFinal(Base64.decode(wrapper.getString("data"), Base64.NO_WRAP)).toString(Charsets.UTF_8)
        AuthSession.fromJson(JSONObject(clear))
    }.getOrNull()

    fun write(session: AuthSession) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(session.toJson().toString().toByteArray(Charsets.UTF_8))
        val wrapper = JSONObject()
            .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .put("data", Base64.encodeToString(encrypted, Base64.NO_WRAP))
        preferences.edit().putString(KEY_PAYLOAD, wrapper.toString()).apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
            generateKey()
        }
    }

    private companion object {
        const val KEY_ALIAS = "hedefit_session_key_v1"
        const val KEY_PAYLOAD = "session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
