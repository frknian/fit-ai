package com.hedefit.app.ui.validation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AuthValidationTest {
    @Test fun emptyLoginExplainsMissingEmail() {
        assertEquals("E-posta adresini yaz.", validateAuthForm("", "", "", login = true, submitted = true))
    }

    @Test fun signUpRequiresPasswordConfirmation() {
        assertEquals("Şifreni tekrar yaz.", validateAuthForm("user@example.org", "password1", "", login = false, submitted = true))
    }

    @Test fun matchingValidSignUpPasses() {
        assertNull(validateAuthForm(" user@example.org ", "password1", "password1", login = false, submitted = true))
    }
}
