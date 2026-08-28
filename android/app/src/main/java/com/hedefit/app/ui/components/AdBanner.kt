package com.hedefit.app.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.hedefit.app.BuildConfig
import com.hedefit.app.ads.AdMobManager

/** A Free-only, non-personalized banner. No health, food, workout, or AI data is passed to AdMob. */
@Composable
fun AdBanner(modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            AdView(context).apply {
                setAdSize(AdSize.BANNER)
                adUnitId = if (BuildConfig.DEBUG) AdMobManager.TEST_BANNER else BuildConfig.ADMOB_BANNER_AD_UNIT_ID
                loadAd(AdRequest.Builder().build())
            }
        },
    )
}
