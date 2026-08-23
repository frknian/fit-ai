package com.hedefit.app.ui.layout

object LayoutPolicy {
    const val ExpandedNavigationWidthDp = 700

    fun usesExpandedNavigation(widthDp: Int): Boolean = widthDp >= ExpandedNavigationWidthDp
}
