package com.hedefit.app.ui.layout

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LayoutPolicyTest {
    @Test
    fun compactPhonesUseBottomNavigation() {
        assertFalse(LayoutPolicy.usesExpandedNavigation(320))
        assertFalse(LayoutPolicy.usesExpandedNavigation(699))
    }

    @Test
    fun tabletsAndLargeFoldablesUseNavigationRail() {
        assertTrue(LayoutPolicy.usesExpandedNavigation(700))
        assertTrue(LayoutPolicy.usesExpandedNavigation(1_280))
    }

    @Test
    fun narrowPhonesKeepMoreUsableContentWidth() {
        assertEquals(12, LayoutPolicy.horizontalPadding(320))
        assertEquals(18, LayoutPolicy.horizontalPadding(360))
        assertEquals(18, LayoutPolicy.horizontalPadding(700))
    }
}
