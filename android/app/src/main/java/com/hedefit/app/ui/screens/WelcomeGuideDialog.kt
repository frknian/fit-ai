package com.hedefit.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsRun
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.hedefit.app.ui.theme.HedefitColors

@Composable
fun WelcomeGuideDialog(language: String, onConnectHealth: () -> Unit, onDismiss: () -> Unit) {
    val en = language == "en"
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.DirectionsRun, null, tint = HedefitColors.Lime) },
        title = { Text(if (en) "Welcome to Hedefit" else "Hedefit'e hoş geldin") },
        text = { Column {
            Text(if (en) "Start with these three simple steps:" else "Başlamak için üç kısa adım:", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(12.dp))
            GuideLine(Icons.Default.FitnessCenter, if (en) "Workout: open your plan and record sets." else "Antrenman: planını aç, setlerini kaydet.")
            GuideLine(Icons.Default.Restaurant, if (en) "Nutrition: add what you eat and watch protein." else "Beslenme: yediklerini ekle, proteinini takip et.")
            GuideLine(Icons.Default.DirectionsRun, if (en) "Route & steps: connect Health Connect whenever you want." else "Rota ve adım: istersen Health Connect'i bağla.")
        } },
        dismissButton = { TextButton(onClick = onConnectHealth) { Text(if (en) "Connect Health Connect" else "Health Connect'i bağla", color = HedefitColors.TextSecondary) } },
        confirmButton = { TextButton(onClick = onDismiss) { Text(if (en) "Let's start" else "Başlayalım", color = HedefitColors.Lime) } },
    )
}

@Composable private fun GuideLine(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    androidx.compose.foundation.layout.Row(Modifier.padding(vertical = 5.dp)) {
        Icon(icon, null, tint = HedefitColors.Lime)
        Text(text, modifier = Modifier.padding(start = 10.dp), style = MaterialTheme.typography.bodyMedium)
    }
}
