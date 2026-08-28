package com.hedefit.app.ads

import android.app.Activity
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import com.hedefit.app.BuildConfig

class AdMobManager(private val activity: Activity) {
    private var interstitial: InterstitialAd? = null
    private var lastShownAt = 0L
    private var shownToday = 0

    fun requestConsent(onReady: (Boolean) -> Unit) {
        val consent = UserMessagingPlatform.getConsentInformation(activity)
        consent.requestConsentInfoUpdate(
            activity,
            ConsentRequestParameters.Builder().build(),
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) {
                    val allowed = consent.canRequestAds()
                    if (allowed) {
                        MobileAds.initialize(activity)
                        loadInterstitial()
                    }
                    onReady(allowed)
                }
            },
            { onReady(false) },
        )
    }

    fun loadInterstitial() {
        val unitId = if (BuildConfig.DEBUG) TEST_INTERSTITIAL else BuildConfig.ADMOB_INTERSTITIAL_AD_UNIT_ID
        InterstitialAd.load(activity, unitId, AdRequest.Builder().build(), object : InterstitialAdLoadCallback() {
            override fun onAdLoaded(ad: InterstitialAd) { interstitial = ad }
            override fun onAdFailedToLoad(error: com.google.android.gms.ads.LoadAdError) { interstitial = null }
        })
    }

    /** Only call at a natural completed-flow transition; never during AI, meals, or active training. */
    fun showAtNaturalTransition(isFreePlan: Boolean) {
        val now = System.currentTimeMillis()
        if (!isFreePlan || shownToday >= 3 || now - lastShownAt < 10 * 60 * 1000L) return
        val ad = interstitial ?: return
        interstitial = null
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() { loadInterstitial() }
            override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) { loadInterstitial() }
        }
        shownToday += 1
        lastShownAt = now
        ad.show(activity)
    }

    companion object {
        const val TEST_BANNER = "ca-app-pub-3940256099942544/6300978111"
        const val TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712"
    }
}
