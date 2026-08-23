package com.hedefit.app.data.offline

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.hedefit.app.data.auth.AuthRepository
import com.hedefit.app.data.auth.AuthState
import com.hedefit.app.data.auth.SecureSessionStore
import com.hedefit.app.data.model.WorkoutExerciseData
import com.hedefit.app.data.model.WorkoutFeedbackData
import com.hedefit.app.data.model.WorkoutSetInput
import com.hedefit.app.data.network.HedefitApiClient
import com.hedefit.app.data.network.JsonHttpClient
import com.hedefit.app.data.network.SupabaseRestClient
import com.hedefit.app.data.network.requireSuccess
import com.hedefit.app.data.repository.HedefitRepository
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

data class PendingSyncOperation(val id: String, val type: String, val payload: JSONObject)

class OfflineQueueStore(context: Context) {
    private val preferences = context.getSharedPreferences("hedefit_offline_queue", Context.MODE_PRIVATE)

    @Synchronized fun read(): List<PendingSyncOperation> {
        val array = runCatching { JSONArray(preferences.getString("operations", "[]")) }.getOrDefault(JSONArray())
        return buildList { for (index in 0 until array.length()) array.optJSONObject(index)?.let { item -> add(PendingSyncOperation(item.optString("id"), item.optString("type"), item.optJSONObject("payload") ?: JSONObject())) } }
    }

    @Synchronized fun enqueue(type: String, payload: JSONObject): String {
        val id = UUID.randomUUID().toString()
        val next = JSONArray().apply {
            read().forEach { put(JSONObject().put("id", it.id).put("type", it.type).put("payload", it.payload)) }
            put(JSONObject().put("id", id).put("type", type).put("payload", payload))
        }
        preferences.edit().putString("operations", next.toString()).apply()
        return id
    }

    @Synchronized fun remove(id: String) {
        val next = JSONArray()
        read().filterNot { it.id == id }.forEach { next.put(JSONObject().put("id", it.id).put("type", it.type).put("payload", it.payload)) }
        preferences.edit().putString("operations", next.toString()).apply()
    }

    fun count(): Int = read().size
}

object OfflineSyncScheduler {
    fun enqueue(context: Context) {
        val request = OneTimeWorkRequestBuilder<HedefitSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("hedefit-offline-sync", ExistingWorkPolicy.KEEP, request)
    }
}

class HedefitSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val http = JsonHttpClient()
        val auth = AuthRepository(SecureSessionStore(applicationContext), http)
        if (auth.bootstrap() !is AuthState.SignedIn) return Result.failure()
        val repository = HedefitRepository(auth, SupabaseRestClient(auth, http), HedefitApiClient(auth, http))
        val queue = OfflineQueueStore(applicationContext)
        for (operation in queue.read()) {
            val synced = runCatching {
                when (operation.type) {
                    "workout" -> replayWorkout(repository, operation.payload)
                    "nutrition" -> HedefitApiClient(auth, http).post("/api/nutrition/logs", operation.payload).requireSuccess("Öğün eşitlenemedi.")
                    else -> Unit
                }
            }.isSuccess
            if (!synced) return Result.retry()
            queue.remove(operation.id)
        }
        return Result.success()
    }

    private suspend fun replayWorkout(repository: HedefitRepository, payload: JSONObject) {
        val exerciseArray = payload.getJSONArray("exercises")
        val exercises = buildList { for (index in 0 until exerciseArray.length()) exerciseArray.getJSONObject(index).let { item -> add(WorkoutExerciseData(item.getString("id"), item.getString("name"), item.optString("area"), item.getInt("sets"), item.getString("reps"), item.getInt("restSeconds"))) } }
        val setArray = payload.getJSONArray("sets")
        val sets = buildList { for (index in 0 until setArray.length()) setArray.getJSONObject(index).let { item -> add(WorkoutSetInput(item.getString("exerciseId"), item.getString("exerciseName"), item.getInt("exerciseOrder"), item.getInt("setNumber"), item.optDouble("weightKg").takeUnless { item.isNull("weightKg") }, item.optInt("reps").takeUnless { item.isNull("reps") }, item.optInt("durationSeconds").takeUnless { item.isNull("durationSeconds") }, item.optInt("rpe").takeUnless { item.isNull("rpe") }, item.optString("setType", "normal"), item.optString("note"))) } }
        val feedbackJson = payload.optJSONObject("feedback") ?: JSONObject()
        val pain = feedbackJson.optJSONArray("painAreas") ?: JSONArray().put("Yok")
        val feedback = WorkoutFeedbackData(feedbackJson.optString("difficulty", "Uygun"), feedbackJson.optInt("fatigue", 3), List(pain.length()) { pain.optString(it) }, feedbackJson.optString("note"))
        repository.recordWorkout(exercises, sets, payload.getInt("durationSeconds"), payload.optInt("calories"), feedback)
    }
}

fun workoutOfflinePayload(exercises: List<WorkoutExerciseData>, sets: List<WorkoutSetInput>, durationSeconds: Int, calories: Int, feedback: WorkoutFeedbackData): JSONObject {
    val exerciseArray = JSONArray(exercises.map { JSONObject().put("id", it.id).put("name", it.name).put("area", it.area).put("sets", it.sets).put("reps", it.reps).put("restSeconds", it.restSeconds) })
    val setArray = JSONArray(sets.map { JSONObject().put("exerciseId", it.exerciseId).put("exerciseName", it.exerciseName).put("exerciseOrder", it.exerciseOrder).put("setNumber", it.setNumber).put("weightKg", it.weightKg ?: JSONObject.NULL).put("reps", it.reps ?: JSONObject.NULL).put("durationSeconds", it.durationSeconds ?: JSONObject.NULL).put("rpe", it.rpe ?: JSONObject.NULL).put("setType", it.setType).put("note", it.note) })
    return JSONObject().put("exercises", exerciseArray).put("sets", setArray).put("durationSeconds", durationSeconds).put("calories", calories)
        .put("feedback", JSONObject().put("difficulty", feedback.difficulty).put("fatigue", feedback.fatigue).put("painAreas", JSONArray(feedback.painAreas)).put("note", feedback.note))
}
