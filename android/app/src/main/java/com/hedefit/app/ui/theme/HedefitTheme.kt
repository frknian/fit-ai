package com.hedefit.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.material3.LocalContentColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object HedefitColors {
    var Background = Color(0xFF080A08)
    var Surface = Color(0xFF111411)
    var SurfaceHigh = Color(0xFF181C18)
    var SurfaceSoft = Color(0xFF20251F)
    var Lime = Color(0xFF78D85B)
    var LimeDark = Color(0xFF4FAF3D)
    var OnLime = Color(0xFF071005)
    var TextPrimary = Color(0xFFF4F7F2)
    var TextSecondary = Color(0xFF9CA69A)
    var Divider = Color(0xFF2A3029)
    val Coral = Color(0xFFFF755F)
    val Water = Color(0xFF63C7FF)
    val Sleep = Color(0xFFAA96FF)
    val Warning = Color(0xFFFFC857)

    fun applyTheme(dark: Boolean, accentHue: Float) {
        val hue = ((accentHue % 360f) + 360f) % 360f
        Lime = Color.hsl(hue, .62f, if (dark) .61f else .48f)
        LimeDark = Color.hsl(hue, .66f, if (dark) .45f else .38f)
        OnLime = if (Lime.luminance() > .45f) Color(0xFF071005) else Color.White
        Background = if (dark) Color(0xFF080A08) else Color(0xFFF6F8F3)
        Surface = if (dark) Color(0xFF111411) else Color.White
        SurfaceHigh = if (dark) Color(0xFF181C18) else Color(0xFFEEF2E9)
        SurfaceSoft = if (dark) Color(0xFF20251F) else Color(0xFFE4EADF)
        TextPrimary = if (dark) Color(0xFFF4F7F2) else Color(0xFF10150F)
        TextSecondary = if (dark) Color(0xFF9CA69A) else Color(0xFF657062)
        Divider = if (dark) Color(0xFF2A3029) else Color(0xFFD8E0D3)
    }
}

private fun hedefitDarkScheme() = darkColorScheme(
    primary = HedefitColors.Lime,
    onPrimary = HedefitColors.OnLime,
    primaryContainer = HedefitColors.LimeDark.copy(alpha = .34f),
    onPrimaryContainer = HedefitColors.Lime,
    secondary = HedefitColors.LimeDark,
    background = HedefitColors.Background,
    onBackground = HedefitColors.TextPrimary,
    surface = HedefitColors.Surface,
    onSurface = HedefitColors.TextPrimary,
    surfaceVariant = HedefitColors.SurfaceHigh,
    onSurfaceVariant = HedefitColors.TextSecondary,
    error = HedefitColors.Coral,
    outline = HedefitColors.Divider,
)

private fun hedefitLightScheme() = lightColorScheme(
    primary = HedefitColors.LimeDark,
    onPrimary = HedefitColors.OnLime,
    primaryContainer = HedefitColors.Lime.copy(alpha = .22f),
    onPrimaryContainer = HedefitColors.LimeDark,
    secondary = HedefitColors.LimeDark,
    background = Color(0xFFF6F8F3),
    onBackground = Color(0xFF10150F),
    surface = Color.White,
    onSurface = Color(0xFF10150F),
    surfaceVariant = Color(0xFFEEF2E9),
    onSurfaceVariant = Color(0xFF657062),
    error = Color(0xFFB3261E),
    outline = Color(0xFFD8E0D3),
)

private val HedefitTypography = androidx.compose.material3.Typography(
    displaySmall = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Bold, fontSize = 36.sp, lineHeight = 40.sp),
    headlineLarge = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 36.sp),
    headlineMedium = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp),
    headlineSmall = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Bold, fontSize = 18.sp, lineHeight = 24.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 18.sp),
    labelMedium = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
)

@Composable
fun HedefitTheme(darkTheme: Boolean = isSystemInDarkTheme(), accentHue: Float = 106f, content: @Composable () -> Unit) {
    HedefitColors.applyTheme(darkTheme, accentHue)
    MaterialTheme(
        colorScheme = if (darkTheme) hedefitDarkScheme() else hedefitLightScheme(),
        typography = HedefitTypography,
    ) {
        CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onBackground, content = content)
    }
}
