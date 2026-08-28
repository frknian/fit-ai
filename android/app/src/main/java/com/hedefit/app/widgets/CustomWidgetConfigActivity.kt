package com.hedefit.app.widgets

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView

class CustomWidgetConfigActivity : Activity() {
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        setResult(RESULT_CANCELED)
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }

        val primaryKeys = listOf("steps", "calories", "water", "protein", "distance", "active_time", "weight", "workout")
        val primaryLabels = listOf("Adım", "Aktif Kalori", "Su", "Protein", "Mesafe", "Aktif süre", "Kilo", "Antrenman")
        val secondaryKeys = listOf("remaining_steps", "calories", "distance", "water", "protein", "pace")
        val secondaryLabels = listOf("Kalan adım", "Aktif kalori", "Mesafe", "Su", "Protein", "Tempo")
        val actionKeys = listOf("open", "workout", "walk", "run", "route", "water", "meal")
        val actionLabels = listOf("Hedefit'i Aç", "Antrenman Başlat", "Yürüyüş Başlat", "Koşu Başlat", "Rota Başlat", "Su Ekle", "Öğün Ekle")
        val themeKeys = listOf("minimal", "dashboard", "action")
        val themeLabels = listOf("Minimal", "Dashboard", "Action")
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 56, 48, 48); setBackgroundColor(Color.rgb(11, 13, 12)) }
        root.addView(TextView(this).apply { text = "Kendi Widget'ını Oluştur"; textSize = 24f; setTextColor(Color.WHITE) })
        fun spinner(title: String, labels: List<String>): Spinner {
            root.addView(TextView(this).apply { text = title; textSize = 14f; setTextColor(Color.rgb(180, 241, 139)); setPadding(0, 28, 0, 8) })
            return Spinner(this).also { it.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, labels); root.addView(it, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)) }
        }
        val primary = spinner("Ana metrik", primaryLabels)
        val secondary = spinner("İkincil metrik", secondaryLabels)
        val action = spinner("İşlem", actionLabels)
        val theme = spinner("Tema", themeLabels)
        root.addView(Button(this).apply { text = "WIDGET'I OLUŞTUR"; setOnClickListener {
            CustomWidgetConfigStore.write(this@CustomWidgetConfigActivity, widgetId, CustomWidgetConfig(primaryKeys[primary.selectedItemPosition], secondaryKeys[secondary.selectedItemPosition], actionKeys[action.selectedItemPosition], themeKeys[theme.selectedItemPosition]))
            HedefitWidgets.render(this@CustomWidgetConfigActivity, AppWidgetManager.getInstance(this@CustomWidgetConfigActivity), widgetId, "CustomWidget")
            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)); finish()
        } }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = 40 })
        setContentView(root)
    }
}
