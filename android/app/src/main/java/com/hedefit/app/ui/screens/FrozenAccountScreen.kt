package com.hedefit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.hedefit.app.ui.components.OutlineAction
import com.hedefit.app.ui.components.PrimaryButton
import com.hedefit.app.ui.theme.HedefitColors

@Composable
fun FrozenAccountScreen(busy: Boolean, onReactivate: () -> Unit, onSignOut: () -> Unit) {
    Box(Modifier.fillMaxSize().background(HedefitColors.Background).padding(28.dp).statusBarsPadding().navigationBarsPadding(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Box(Modifier.size(82.dp).background(HedefitColors.Lime.copy(alpha = .18f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.PauseCircle, null, tint = HedefitColors.Lime, modifier = Modifier.size(42.dp))
            }
            Text("Hesabın donduruldu", style = MaterialTheme.typography.headlineMedium)
            Text("Antrenmanların, ölçümlerin ve profilin güvende. Hazır olduğunda kaldığın yerden devam edebilirsin.", color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodyLarge)
            PrimaryButton(if (busy) "Etkinleştiriliyor…" else "Hesabımı yeniden etkinleştir", onReactivate)
            OutlineAction("Çıkış yap", onSignOut)
        }
    }
}
