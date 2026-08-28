package com.hedefit.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.hedefit.app.R
import com.hedefit.app.ui.model.AppDestination
import com.hedefit.app.ui.layout.LayoutPolicy
import com.hedefit.app.ui.theme.HedefitColors

val ScreenHorizontalPadding = 18.dp
val CardRadius = 18.dp

@Composable
fun FitCoachRobotAvatar(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.fit_coach_robot),
        contentDescription = "Fit Koç spor robotu",
        modifier = modifier,
        contentScale = ContentScale.Fit,
    )
}

@Composable
fun HedefitAppFrame(
    selected: AppDestination,
    onSelect: (AppDestination) -> Unit,
    language: String = "tr",
    coachName: String = if (language == "en") "Fit Coach" else "Fit Koç",
    content: @Composable (PaddingValues, Boolean) -> Unit,
) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
        val expanded = LayoutPolicy.usesExpandedNavigation(maxWidth.value.toInt())
        if (expanded) {
            Row(Modifier.fillMaxSize().background(HedefitColors.Background)) {
                HedefitNavigationRail(selected, onSelect, language, coachName)
                Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.TopCenter) {
                    content(PaddingValues(horizontal = 24.dp, vertical = 12.dp), true)
                }
            }
        } else {
            val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
            Scaffold(
                containerColor = HedefitColors.Background,
                contentWindowInsets = WindowInsets.safeDrawing,
                bottomBar = { if (!imeVisible) HedefitBottomBar(selected, onSelect, language, coachName) },
            ) { padding -> content(padding, false) }
        }
    }
}

@Composable
private fun HedefitBottomBar(selected: AppDestination, onSelect: (AppDestination) -> Unit, language: String, coachName: String) {
    Box(Modifier.navigationBarsPadding()) {
        NavigationBar(
            containerColor = HedefitColors.Surface,
            tonalElevation = 0.dp,
            modifier = Modifier.height(64.dp),
            windowInsets = WindowInsets(0),
        ) {
            AppDestination.entries.forEach { destination ->
            val isCoach = destination == AppDestination.Coach
            val label = if (isCoach) coachName else destination.localizedLabel(language)
            val active = destination == selected
            val interactionSource = remember { MutableInteractionSource() }
            Column(
                Modifier.weight(1f).fillMaxHeight()
                    .selectable(selected = active, interactionSource = interactionSource, indication = null, role = Role.Tab) { if (!active) onSelect(destination) }
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceEvenly,
            ) {
                Box(
                    Modifier
                        .then(if (isCoach) Modifier.size(48.dp) else Modifier.width(62.dp).height(36.dp))
                        .background(if (!isCoach && active) HedefitColors.Lime else Color.Transparent, RoundedCornerShape(22.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (isCoach) FitCoachRobotAvatar(Modifier.size(43.dp)) else Icon(
                        destination.icon,
                        contentDescription = label,
                        modifier = Modifier.size(22.dp),
                        tint = if (active) HedefitColors.OnLime else HedefitColors.TextSecondary,
                    )
                }
            }
        }
        }
    }
}

@Composable
private fun HedefitNavigationRail(selected: AppDestination, onSelect: (AppDestination) -> Unit, language: String, coachName: String) {
    NavigationRail(
        containerColor = HedefitColors.Surface,
        modifier = Modifier.fillMaxHeight().width(92.dp).padding(top = 20.dp),
    ) {
        Box(
            Modifier.size(48.dp).background(HedefitColors.Lime, RoundedCornerShape(15.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text("H", color = HedefitColors.OnLime, fontWeight = FontWeight.Black, fontSize = 24.sp)
        }
        Spacer(Modifier.height(28.dp))
        AppDestination.entries.forEach { destination ->
            val label = if (destination == AppDestination.Coach) coachName else destination.localizedLabel(language)
            NavigationRailItem(
                selected = destination == selected,
                onClick = { onSelect(destination) },
                icon = { if (destination == AppDestination.Coach) FitCoachRobotAvatar(Modifier.size(38.dp)) else Icon(destination.icon, label) },
                label = { Text(label, fontSize = 10.sp) },
                colors = NavigationRailItemDefaults.colors(
                    selectedIconColor = HedefitColors.OnLime,
                    selectedTextColor = HedefitColors.Lime,
                    indicatorColor = if (destination == AppDestination.Coach) Color.Transparent else HedefitColors.Lime,
                    unselectedIconColor = HedefitColors.TextSecondary,
                    unselectedTextColor = HedefitColors.TextSecondary,
                ),
            )
        }
    }
}

@Composable
fun ScreenContainer(
    padding: PaddingValues,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(padding)
            .padding(horizontal = ScreenHorizontalPadding),
        contentAlignment = Alignment.TopCenter,
    ) {
        Box(Modifier.fillMaxWidth().widthIn(max = 1120.dp), content = content)
    }
}

@Composable
fun HedefitCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    content: @Composable () -> Unit,
) {
    val clickModifier = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier
    Card(
        modifier = modifier.then(clickModifier),
        shape = RoundedCornerShape(CardRadius),
        colors = CardDefaults.cardColors(containerColor = HedefitColors.Surface),
        border = BorderStroke(.6.dp, HedefitColors.Divider),
    ) {
        Box(Modifier.padding(contentPadding)) { content() }
    }
}

@Composable
fun SectionTitle(title: String, trailing: String? = null, onTrailingClick: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
        if (trailing != null) {
            Text(
                trailing,
                color = HedefitColors.Lime,
                style = MaterialTheme.typography.labelLarge,
                modifier = if (onTrailingClick != null) Modifier.clickable(onClick = onTrailingClick).padding(4.dp) else Modifier,
            )
        }
    }
}

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
) {
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().height(56.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = HedefitColors.Lime, contentColor = HedefitColors.OnLime),
    ) {
        if (icon != null) {
            Icon(icon, null, Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun OutlineAction(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier.fillMaxWidth().height(52.dp)
            .background(Color.Transparent, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.matchParentSize()) {
            drawRoundRect(HedefitColors.Lime, style = Stroke(1.dp.toPx()), cornerRadius = androidx.compose.ui.geometry.CornerRadius(14.dp.toPx()))
        }
        Text(text, color = HedefitColors.Lime, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
fun ProgressRing(
    progress: Float,
    modifier: Modifier = Modifier,
    strokeWidth: Dp = 12.dp,
    center: @Composable BoxScope.() -> Unit,
) {
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            drawArc(HedefitColors.Divider, -90f, 360f, false, style = Stroke(strokeWidth.toPx(), cap = StrokeCap.Round))
            drawArc(HedefitColors.Lime, -90f, 360f * progress.coerceIn(0f, 1f), false, style = Stroke(strokeWidth.toPx(), cap = StrokeCap.Round))
        }
        center()
    }
}

@Composable
fun MetricCard(
    icon: ImageVector,
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    accent: Color = HedefitColors.Lime,
    onClick: (() -> Unit)? = null,
    footer: (@Composable () -> Unit)? = null,
) {
    HedefitCard(modifier, onClick = onClick, contentPadding = PaddingValues(14.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Icon(icon, null, tint = accent, modifier = Modifier.size(22.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall)
            Text(label, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            if (footer != null) footer()
        }
    }
}

@Composable
fun MacroBar(label: String, value: String, progress: Float, icon: ImageVector? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (icon != null) Icon(icon, null, tint = HedefitColors.Lime, modifier = Modifier.size(18.dp))
            Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, maxLines = 1)
            Text(value, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall, maxLines = 1)
        }
        Box(Modifier.fillMaxWidth().height(7.dp).background(HedefitColors.Divider, CircleShape)) {
            Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).fillMaxHeight().background(HedefitColors.Lime, CircleShape))
        }
    }
}

@Composable
fun Sparkline(
    values: List<Float>,
    modifier: Modifier = Modifier,
    color: Color = HedefitColors.Lime,
    showGrid: Boolean = false,
) {
    Canvas(modifier) {
        if (showGrid) {
            repeat(4) { index ->
                val y = size.height * index / 3f
                drawLine(HedefitColors.Divider, Offset(0f, y), Offset(size.width, y), strokeWidth = 1f)
            }
        }
        if (values.size < 2) return@Canvas
        val min = values.minOrNull() ?: 0f
        val max = values.maxOrNull() ?: 1f
        val range = (max - min).takeIf { it > 0f } ?: 1f
        val path = Path()
        values.forEachIndexed { index, value ->
            val x = size.width * index / (values.size - 1)
            val y = size.height - ((value - min) / range) * (size.height * .8f) - size.height * .1f
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color, style = Stroke(3.dp.toPx(), cap = StrokeCap.Round))
        val last = values.last()
        val y = size.height - ((last - min) / range) * (size.height * .8f) - size.height * .1f
        drawCircle(color, 5.dp.toPx(), Offset(size.width, y))
        drawCircle(HedefitColors.Background, 2.dp.toPx(), Offset(size.width, y))
    }
}

@Composable
fun LabeledValue(label: String, value: String, modifier: Modifier = Modifier, accent: Color = HedefitColors.TextPrimary) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
        Text(value, color = accent, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
fun CardDivider() {
    HorizontalDivider(color = HedefitColors.Divider, thickness = .6.dp)
}

@Composable
fun ArrowLabel(text: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(text, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
        Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = HedefitColors.TextSecondary, modifier = Modifier.size(18.dp))
    }
}
