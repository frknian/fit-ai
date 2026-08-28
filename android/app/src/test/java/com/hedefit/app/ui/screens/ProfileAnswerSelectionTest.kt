package com.hedefit.app.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProfileAnswerSelectionTest {
    private val injuries = listOf("Yok", "Bel", "Diz", "Omuz", "Boyun", "Diğer")

    @Test fun multipleSelectionsAreSavedInChoiceOrder() {
        var answer = ""
        answer = toggleProfileChoice(answer, "Koşu", listOf("Ağırlık", "HIIT", "Koşu", "Bisiklet", "Vücut ağırlığı"))
        answer = toggleProfileChoice(answer, "Ağırlık", listOf("Ağırlık", "HIIT", "Koşu", "Bisiklet", "Vücut ağırlığı"))
        assertEquals("Ağırlık • Koşu", answer)
        assertTrue("Koşu" in selectedProfileChoices(answer))
    }

    @Test fun noInjuryIsAlwaysExclusive() {
        var answer = toggleProfileChoice("", "Diz", injuries, "Yok")
        answer = toggleProfileChoice(answer, "Omuz", injuries, "Yok")
        assertEquals("Diz • Omuz", answer)
        assertEquals("Yok", toggleProfileChoice(answer, "Yok", injuries, "Yok"))
        assertEquals("Bel", toggleProfileChoice("Yok", "Bel", injuries, "Yok"))
    }
}
