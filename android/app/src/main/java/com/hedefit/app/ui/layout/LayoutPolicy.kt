package com.hedefit.app.ui.layout

object LayoutPolicy {
    const val ExpandedNavigationWidthDp = 700
    const val CompactHorizontalPaddingDp = 12
    const val RegularHorizontalPaddingDp = 18

    fun usesExpandedNavigation(widthDp: Int): Boolean = widthDp >= ExpandedNavigationWidthDp
    fun horizontalPadding(widthDp: Int): Int = if (widthDp < 360) CompactHorizontalPaddingDp else RegularHorizontalPaddingDp
}
