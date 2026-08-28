package com.hedefit.app.ui.state

import com.hedefit.app.data.model.WorkoutSetInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WorkoutSessionStateTest {
    @Test fun repetitionRangeStartsAtItsFirstValue() {
        assertEquals(8, prescribedStartingReps("8–12"))
        assertEquals(10, prescribedStartingReps(""))
    }

    @Test fun workoutEditorRejectsSilentClampingInputs() {
        assertEquals("Set sayısı 1 ile 10 arasında olmalı.", validateWorkoutSets("0"))
        assertNull(validateWorkoutSets("4"))
        assertEquals("Tekrar hedefini yaz.", validateWorkoutReps(""))
        assertNull(validateWorkoutReps("8–12"))
        assertEquals("Dinlenme 15 ile 300 saniye arasında olmalı.", validateWorkoutRest("0"))
        assertNull(validateWorkoutRest("90"))
    }

    @Test fun workoutCannotFinishWithoutACompletedSet() {
        assertEquals(false, canFinishWorkout(0))
        assertEquals(true, canFinishWorkout(1))
    }

    @Test fun completedSetSurvivesSavedStateRoundTrip() {
        val set = WorkoutSetInput("row|id", "Öne eğilerek kürek", 2, 3, 42.5, 9, null, 8, "dropset", "Form iyi | ağrı yok")
        assertEquals(set, savedWorkoutSet(set.toSavedWorkoutSet()))
        assertNull(savedWorkoutSet("bozuk"))
    }
}
