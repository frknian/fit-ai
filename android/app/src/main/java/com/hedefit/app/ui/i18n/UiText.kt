package com.hedefit.app.ui.i18n

fun uiText(language: String, tr: String, en: String): String = if (language == "en") en else tr
