package com.hedefit.app.shortcuts

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import com.hedefit.app.MainActivity
import com.hedefit.app.R

object HedefitShortcuts {
    fun request(context: Context, type: String): Boolean {
        val manager = context.getSystemService(ShortcutManager::class.java)
        if (!manager.isRequestPinShortcutSupported) return false
        val (label, extra) = when (type) {
            "route" -> "Hedefit Rota" to "open_route"
            "workout" -> "Antrenmanı Aç" to "open_workout"
            else -> "Öğün Ekle" to "open_nutrition"
        }
        val launch = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).putExtra(extra, true)
        val shortcut = ShortcutInfo.Builder(context, "hedefit-$type")
            .setShortLabel(label).setLongLabel(label).setIcon(Icon.createWithResource(context, R.drawable.ic_launcher)).setIntent(launch).build()
        return manager.requestPinShortcut(shortcut, null)
    }
}
