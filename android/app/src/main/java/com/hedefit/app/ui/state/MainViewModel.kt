package com.hedefit.app.ui.state

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.hedefit.app.data.auth.AuthRepository
import com.hedefit.app.data.auth.AuthSession
import com.hedefit.app.data.auth.AuthState
import com.hedefit.app.data.auth.RegistrationLegalAcceptance
import com.hedefit.app.data.auth.SecureSessionStore
import com.hedefit.app.data.auth.SignUpResult
import com.hedefit.app.data.model.DashboardData
import com.hedefit.app.data.model.BodyMeasurementData
import com.hedefit.app.data.model.ProfileUpdateData
import com.hedefit.app.data.model.WorkoutSetInput
import com.hedefit.app.data.model.WorkoutFeedbackData
import com.hedefit.app.data.model.FoodSearchData
import com.hedefit.app.data.model.FavoriteMealData
import com.hedefit.app.data.model.ExerciseCatalogData
import com.hedefit.app.data.model.PreviousSetData
import com.hedefit.app.data.model.WorkoutProgramData
import com.hedefit.app.data.model.RouteActivityData
import com.hedefit.app.data.model.WorkoutExercisePerformanceData
import com.hedefit.app.data.model.WorkoutSetPerformanceData
import com.hedefit.app.data.model.ManualActivityInput
import com.hedefit.app.data.model.estimateManualActivityEnergy
import com.hedefit.app.data.model.manualActivityTypes
import com.hedefit.app.data.offline.OfflineQueueStore
import com.hedefit.app.data.offline.OfflineSyncScheduler
import com.hedefit.app.data.offline.workoutOfflinePayload
import com.hedefit.app.health.HealthConnectManager
import com.hedefit.app.steps.StepRepository
import com.hedefit.app.steps.StepSource
import com.hedefit.app.route.RouteSnapshot
import com.hedefit.app.data.network.HedefitApiClient
import com.hedefit.app.data.network.JsonHttpClient
import com.hedefit.app.data.network.SupabaseRestClient
import com.hedefit.app.data.repository.HedefitRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.time.LocalDate
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.net.URL

data class ChatMessageState(val text: String, val user: Boolean, val pending: Boolean = false)

data class MainUiState(
    val auth: AuthState = AuthState.Loading,
    val dashboard: DashboardData? = null,
    val dataLoading: Boolean = false,
    val dataError: String? = null,
    val authBusy: Boolean = false,
    val authMessage: String? = null,
    val workoutSaving: Boolean = false,
    val planGenerating: Boolean = false,
    val nutritionBusy: Boolean = false,
    val nutritionDateLoading: Boolean = false,
    val nutritionViewingDate: LocalDate = LocalDate.now(),
    val nutritionViewingLogs: List<com.hedefit.app.data.model.NutritionLogData> = emptyList(),
    val nutritionHistory: List<com.hedefit.app.data.model.NutritionLogData> = emptyList(),
    val chatBusy: Boolean = false,
    val chatMessages: List<ChatMessageState> = emptyList(),
    val chatUsageUsed: Int? = null,
    val chatUsageLimit: Int? = null,
    val transientMessage: String? = null,
    val profileSaving: Boolean = false,
    val avatarUploading: Boolean = false,
    val avatarPreview: ByteArray? = null,
    val measurementSaving: Boolean = false,
    val accountBusy: Boolean = false,
    val accountFrozen: Boolean = false,
    val healthConnected: Boolean = false,
    val healthBusy: Boolean = false,
    val stepSource: StepSource = StepSource.UNAVAILABLE,
    val foodSearchBusy: Boolean = false,
    val foodSearchResults: List<FoodSearchData> = emptyList(),
    val foodSearchQuery: String? = null,
    val photoNutritionBusy: Boolean = false,
    val photoNutritionResults: List<com.hedefit.app.data.model.NutritionEstimateData> = emptyList(),
    val exerciseLibraryBusy: Boolean = false,
    val exerciseLibrary: List<ExerciseCatalogData> = emptyList(),
    val offlinePendingCount: Int = 0,
    val previousPerformance: Map<String, List<PreviousSetData>> = emptyMap(),
)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val http = JsonHttpClient()
    private val authRepository = AuthRepository(SecureSessionStore(application), http)
    private val repository = HedefitRepository(
        authRepository,
        SupabaseRestClient(authRepository, http),
        HedefitApiClient(authRepository, http),
    )
    private val healthConnect = HealthConnectManager(application)
    private val stepRepository = StepRepository(application, healthConnect)
    private val offlineQueue = OfflineQueueStore(application)
    private val waterUpdateMutex = Mutex()

    private val _state = MutableStateFlow(MainUiState())
    val state: StateFlow<MainUiState> = _state.asStateFlow()

    override fun onCleared() {
        stepRepository.stop()
        super.onCleared()
    }

    init {
        viewModelScope.launch {
            stepRepository.todaySteps.collect { reading ->
                _state.update { current -> current.copy(
                    stepSource = reading.source,
                    dashboard = current.dashboard?.copy(
                        steps = reading.count,
                        activeCalories = if (reading.source == StepSource.HEALTH_CONNECT) current.dashboard.activeCalories else reading.count / 25,
                    ),
                ) }
            }
        }
        viewModelScope.launch {
            val auth = authRepository.bootstrap()
            val cachedAvatar = if (auth is AuthState.SignedIn) loadCachedAvatar(auth.session.user.id) else null
            _state.update { it.copy(auth = auth, avatarPreview = cachedAvatar) }
            if (auth is AuthState.SignedIn) checkAccountThenLoad()
        }
    }

    fun signIn(email: String, password: String) = authAction {
        val session = authRepository.signIn(email, password)
        onSignedIn(session)
    }

    fun signUp(email: String, password: String, legalAcceptance: RegistrationLegalAcceptance) = authAction {
        when (val result = authRepository.signUp(email, password, legalAcceptance)) {
            is SignUpResult.SignedIn -> onSignedIn(result.session)
            SignUpResult.VerificationRequired -> _state.update {
                it.copy(authBusy = false, authMessage = "Doğrulama bağlantısı e-posta adresine gönderildi. Doğruladıktan sonra giriş yapabilirsin.")
            }
        }
    }

    fun signInWithGoogle(idToken: String, nonce: String, legalAcceptance: RegistrationLegalAcceptance? = null) = authAction {
        onSignedIn(authRepository.signInWithGoogle(idToken, nonce, legalAcceptance))
    }

    fun reportAuthError(message: String) {
        _state.update { it.copy(authBusy = false, authMessage = message) }
    }

    fun clearAuthMessage() {
        _state.update { it.copy(authMessage = null) }
    }

    fun signOut() {
        viewModelScope.launch {
            _state.update { it.copy(authBusy = true) }
            authRepository.signOut()
            _state.value = MainUiState(auth = AuthState.SignedOut)
        }
    }

    fun refreshAll() {
        viewModelScope.launch {
            _state.update { it.copy(dataLoading = true, dataError = null) }
            runCatching { repository.loadDashboard() }
                .onSuccess { dashboard ->
                    _state.update { current ->
                        current.copy(
                            dashboard = dashboard,
                            nutritionViewingDate = LocalDate.now(),
                            nutritionViewingLogs = dashboard.nutritionLogs,
                            dataLoading = false,
                            dataError = null,
                            chatMessages = current.chatMessages.ifEmpty {
                                listOf(ChatMessageState("Merhaba ${dashboard.profile.displayName}! Antrenman, beslenme veya ilerlemen hakkında bana bir şey sorabilirsin.", false))
                            },
                            chatUsageLimit = current.chatUsageLimit ?: if (dashboard.profile.isPremium) 25 else 5,
                        )
                    }
                    // The server snapshot is historical data only. Immediately
                    // replace today's visible total with the central live source.
                    val reading = stepRepository.refresh()
                    _state.update { current -> current.copy(
                        stepSource = reading.source,
                        dashboard = current.dashboard?.copy(
                            steps = reading.count,
                            activeCalories = if (reading.source == StepSource.HEALTH_CONNECT) current.dashboard.activeCalories else reading.count / 25,
                        ),
                    ) }
                    if (_state.value.avatarPreview == null) {
                        dashboard.profile.avatarUrl?.let { url ->
                            viewModelScope.launch {
                                val restored = downloadAvatar(url) ?: return@launch
                                cacheAvatar(dashboard.profile.id, restored)
                                _state.update { current ->
                                    if (current.avatarPreview == null && (current.auth as? AuthState.SignedIn)?.session?.user?.id == dashboard.profile.id) current.copy(avatarPreview = restored)
                                    else current
                                }
                            }
                        }
                    }
                }
                .onFailure { error -> _state.update { it.copy(dataLoading = false, dataError = friendlyError(error)) } }
        }
    }

    fun refreshSteps() {
        if (_state.value.dashboard == null) return
        viewModelScope.launch { stepRepository.refresh() }
    }

    fun syncGamificationPreferences(stepGoal: Int, waterGoalMl: Int, weeklyActivityGoal: Int, timezone: String) {
        viewModelScope.launch(Dispatchers.IO) {
            repository.syncGamificationPreferences(stepGoal, waterGoalMl, weeklyActivityGoal, timezone)
        }
    }

    fun loadNutritionDate(date: LocalDate) = viewModelScope.launch {
        if (_state.value.nutritionDateLoading || _state.value.nutritionViewingDate == date && _state.value.nutritionViewingLogs.isNotEmpty()) return@launch
        _state.update { it.copy(nutritionDateLoading = true, nutritionViewingDate = date) }
        runCatching { repository.loadNutritionLogs(date) }
            .onSuccess { logs -> _state.update { it.copy(nutritionDateLoading = false, nutritionViewingLogs = logs) } }
            .onFailure { error -> _state.update { it.copy(nutritionDateLoading = false, transientMessage = friendlyError(error)) } }
    }

    fun loadNutritionHistory() = viewModelScope.launch {
        if (_state.value.nutritionHistory.isNotEmpty()) return@launch
        runCatching { repository.loadNutritionHistory() }
            .onSuccess { history -> _state.update { it.copy(nutritionHistory = history) } }
            .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } }
    }

    fun completeDetailedWorkout(durationSeconds: Int, calories: Int, sets: List<WorkoutSetInput>, feedback: WorkoutFeedbackData, workoutExercises: List<com.hedefit.app.data.model.WorkoutExerciseData>? = null) {
        val exercises = workoutExercises ?: _state.value.dashboard?.workouts.orEmpty()
        if (exercises.isEmpty() || sets.isEmpty() || _state.value.workoutSaving) return
        viewModelScope.launch {
            _state.update { it.copy(workoutSaving = true) }
            runCatching { repository.recordWorkout(exercises, sets, durationSeconds, calories, feedback) }
            .onSuccess { session ->
                    val performances = sets.groupBy { it.exerciseId }.map { (exerciseId, exerciseSets) ->
                        WorkoutExercisePerformanceData(
                            sessionId = session.id,
                            exerciseId = exerciseId,
                            exerciseName = exerciseSets.first().exerciseName,
                            completedAt = session.completedAt,
                            sets = exerciseSets.sortedBy { it.setNumber }.map { set -> WorkoutSetPerformanceData(set.setNumber, set.weightKg, set.reps, set.durationSeconds, set.rpe) },
                        )
                    }
                    _state.update { current -> current.copy(
                        workoutSaving = false,
                        dashboard = current.dashboard?.copy(
                            sessions = listOf(session) + current.dashboard.sessions,
                            exercisePerformance = performances + current.dashboard.exercisePerformance,
                        ),
                        transientMessage = "Antrenman ve tüm setlerin ilerlemene kaydedildi.",
                    ) }
                    if (feedback.difficulty == "Zor" || feedback.painAreas.any { it != "Yok" } || feedback.fatigue >= 4) adaptPlan(feedback)
                }
                .onFailure { error ->
                    val networkLike = error.message.orEmpty().contains("network", true) || error.message.orEmpty().contains("host", true) || error is java.io.IOException
                    if (networkLike) {
                        offlineQueue.enqueue("workout", workoutOfflinePayload(exercises, sets, durationSeconds, calories, feedback))
                        OfflineSyncScheduler.enqueue(getApplication())
                        _state.update { it.copy(workoutSaving = false, offlinePendingCount = offlineQueue.count(), transientMessage = "Antrenman cihazda saklandı; bağlantı gelince otomatik eşitlenecek.") }
                    } else _state.update { it.copy(workoutSaving = false, transientMessage = friendlyError(error)) }
                }
        }
    }

    fun recordManualActivity(input: ManualActivityInput, language: String, onSaved: () -> Unit) {
        if (_state.value.workoutSaving) return
        val dashboard = _state.value.dashboard ?: return
        val activity = manualActivityTypes.firstOrNull { it.key == input.activityKey } ?: return
        val estimate = estimateManualActivityEnergy(activity, input, dashboard.profile.weightKg)
        val calories = estimate.activeCalories
        viewModelScope.launch {
            _state.update { it.copy(workoutSaving = true) }
            runCatching { repository.recordManualActivity(input, calories) }
                .onSuccess { session ->
                    _state.update { current -> current.copy(
                        workoutSaving = false,
                        dashboard = current.dashboard?.copy(sessions = listOf(session) + current.dashboard.sessions),
                        transientMessage = if (language == "en") "${activity.titleEn} saved: $calories kcal burned." else "${activity.titleTr} kaydedildi: $calories kcal yakıldı.",
                    ) }
                    onSaved()
                }
                .onFailure { error -> _state.update { it.copy(workoutSaving = false, transientMessage = friendlyError(error)) } }
        }
    }

    private fun adaptPlan(feedback: WorkoutFeedbackData) {
        val profile = _state.value.dashboard?.profile ?: return
        viewModelScope.launch {
            runCatching { repository.generatePlan(profile, feedback) }.onSuccess { workouts ->
                _state.update { current -> current.copy(dashboard = current.dashboard?.copy(workouts = workouts), transientMessage = "Fit Koç geri bildirimine göre sonraki planı uyarladı.") }
            }
        }
    }

    fun syncHealthConnect() = syncHealth(showMessage = true, checkPermissionFirst = false)

    fun syncHealthIfConnected() = syncHealth(showMessage = false, checkPermissionFirst = true)

    private fun syncHealth(showMessage: Boolean, checkPermissionFirst: Boolean) {
        if (_state.value.healthBusy) return
        viewModelScope.launch {
            if (checkPermissionFirst) {
                val connected = runCatching { healthConnect.hasStepPermission() }.getOrDefault(false)
                _state.update { it.copy(healthConnected = connected) }
            }
            val stepReading = stepRepository.refresh()
            if (stepReading.source != StepSource.HEALTH_CONNECT) {
                _state.update { current -> current.copy(
                    healthConnected = false,
                    healthBusy = false,
                    stepSource = stepReading.source,
                    dashboard = current.dashboard?.copy(steps = stepReading.count, activeCalories = stepReading.count / 25),
                    transientMessage = if (showMessage && stepReading.source == StepSource.UNAVAILABLE) "Bu cihaz otomatik adım takibini desteklemiyor. Health Connect bağlayarak adımlarını takip edebilirsin." else current.transientMessage,
                ) }
                return@launch
            }
            _state.update { current -> current.copy(
                healthConnected = true,
                healthBusy = false,
                stepSource = stepReading.source,
                dashboard = current.dashboard?.copy(steps = stepReading.count),
            ) }
            if (!runCatching { healthConnect.hasPermissions() }.getOrDefault(false)) {
                if (showMessage) _state.update { it.copy(transientMessage = "Samsung Health adımları güncellendi. Uyku, kalori ve kilo için ek Health Connect izinleri gerekir.") }
                return@launch
            }
            _state.update { it.copy(healthBusy = true) }
            val snapshot = runCatching { healthConnect.readToday() }.getOrElse { error ->
                _state.update { it.copy(healthBusy = false, transientMessage = if (showMessage) friendlyError(error) else it.transientMessage) }
                return@launch
            }
            // Health Connect is the source of truth on this device. Show its current,
            // deduplicated daily total immediately; a slow or unavailable server must
            // not leave the dashboard displaying yesterday's cached database value.
            _state.update { current -> current.copy(
                healthConnected = true,
                dashboard = current.dashboard?.copy(steps = snapshot.steps, sleepMinutes = snapshot.sleepMinutes, activeCalories = snapshot.activeCalories),
            ) }
            runCatching { repository.syncHealth(snapshot) }.onSuccess {
                _state.update { current -> current.copy(
                    healthBusy = false,
                    transientMessage = if (showMessage) "Health Connect verileri güncellendi." else current.transientMessage,
                ) }
            }.onFailure {
                _state.update { current -> current.copy(
                    healthBusy = false,
                    transientMessage = if (showMessage) "Health Connect verileri cihazdan güncellendi; bulut eşitlemesi daha sonra yeniden denenecek." else current.transientMessage,
                ) }
            }
        }
    }

    fun checkHealthConnect() {
        viewModelScope.launch {
            val connected = runCatching { healthConnect.hasStepPermission() }.getOrDefault(false)
            _state.update { it.copy(healthConnected = connected) }
            stepRepository.refresh()
        }
    }

    fun onActivityRecognitionPermissionChanged() {
        viewModelScope.launch { stepRepository.refresh() }
    }

    fun searchFoods(query: String, locale: String = "tr") {
        if (query.trim().length < 2 || _state.value.foodSearchBusy) return
        viewModelScope.launch {
            _state.update { it.copy(foodSearchBusy = true, foodSearchQuery = null, foodSearchResults = emptyList()) }
            runCatching { repository.searchFoods(query, locale) }
                .onSuccess { results -> _state.update { it.copy(foodSearchBusy = false, foodSearchResults = results, foodSearchQuery = query.trim()) } }
                .onFailure { error -> _state.update { it.copy(foodSearchBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun analyzeNutritionPhoto(jpegBytes: ByteArray) {
        if (_state.value.photoNutritionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(photoNutritionBusy = true, photoNutritionResults = emptyList()) }
            runCatching { repository.analyzeNutritionPhoto(jpegBytes) }
                .onSuccess { results -> _state.update { it.copy(photoNutritionBusy = false, photoNutritionResults = results) } }
                .onFailure { error -> _state.update { it.copy(photoNutritionBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun clearPhotoNutritionResults() = _state.update { it.copy(photoNutritionResults = emptyList()) }

    fun savePhotoNutrition(items: List<com.hedefit.app.data.model.NutritionEstimateData>, meal: String) {
        if (_state.value.nutritionBusy || items.isEmpty()) return
        viewModelScope.launch {
            _state.update { it.copy(nutritionBusy = true) }
            runCatching { repository.savePhotoNutrition(items, meal) }
                .onSuccess { logs -> _state.update { current -> current.copy(
                    nutritionBusy = false, photoNutritionResults = emptyList(),
                    dashboard = current.dashboard?.copy(nutritionLogs = logs + current.dashboard.nutritionLogs),
                    nutritionViewingLogs = if (current.nutritionViewingDate == LocalDate.now()) logs + current.nutritionViewingLogs else current.nutritionViewingLogs,
                    nutritionHistory = logs + current.nutritionHistory,
                    transientMessage = "Fotoğraftaki ${logs.size} besin öğüne eklendi.",
                ) } }
                .onFailure { error -> _state.update { it.copy(nutritionBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun addCatalogFood(food: FoodSearchData, grams: Double, meal: String) {
        if (_state.value.nutritionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(nutritionBusy = true) }
            runCatching { repository.addCatalogFood(food, grams, meal) }
                .onSuccess { log -> _state.update { current -> current.copy(nutritionBusy = false, dashboard = current.dashboard?.copy(nutritionLogs = listOf(log) + current.dashboard.nutritionLogs), nutritionViewingLogs = if (current.nutritionViewingDate == LocalDate.now()) listOf(log) + current.nutritionViewingLogs else current.nutritionViewingLogs, nutritionHistory = listOf(log) + current.nutritionHistory, transientMessage = "${log.name} eklendi.") } }
                .onFailure { error ->
                    val payload = repository.catalogFoodPayload(food, grams, meal)
                    val networkLike = error.message.orEmpty().contains("network", true) || error.message.orEmpty().contains("host", true) || error is java.io.IOException
                    if (networkLike) {
                        val pendingId = offlineQueue.enqueue("nutrition", payload); OfflineSyncScheduler.enqueue(getApplication())
                        val ratio = grams / 100.0
                        val local = com.hedefit.app.data.model.NutritionLogData("offline-$pendingId", java.time.LocalDate.now().toString(), meal, food.name, (food.calories * ratio).toInt(), food.protein * ratio, food.carbs * ratio, food.fat * ratio, grams, food.fiber * ratio, food.sugar * ratio, food.sodiumMg * ratio, food.potassiumMg * ratio, food.calciumMg * ratio, food.ironMg * ratio, food.vitaminCMg * ratio)
                        _state.update { current -> current.copy(nutritionBusy = false, offlinePendingCount = offlineQueue.count(), dashboard = current.dashboard?.copy(nutritionLogs = listOf(local) + current.dashboard.nutritionLogs), nutritionViewingLogs = if (current.nutritionViewingDate == LocalDate.now()) listOf(local) + current.nutritionViewingLogs else current.nutritionViewingLogs, nutritionHistory = listOf(local) + current.nutritionHistory, transientMessage = "Öğün çevrimdışı kaydedildi; bağlantı gelince eşitlenecek.") }
                    } else _state.update { it.copy(nutritionBusy = false, transientMessage = friendlyError(error)) }
                }
        }
    }

    fun addFavorite(log: com.hedefit.app.data.model.NutritionLogData) = viewModelScope.launch {
        runCatching { repository.addFavorite(log) }.onSuccess { favorite -> _state.update { current -> current.copy(dashboard = current.dashboard?.copy(favoriteMeals = listOf(favorite) + current.dashboard.favoriteMeals.filterNot { it.id == favorite.id }), transientMessage = "Öğün favorilere eklendi.") } }
            .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } }
    }

    fun removeNutritionLog(log: com.hedefit.app.data.model.NutritionLogData) {
        if (_state.value.nutritionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(nutritionBusy = true) }
            runCatching {
                if (log.id.startsWith("offline-")) offlineQueue.remove(log.id.removePrefix("offline-"))
                else repository.removeNutritionLog(log.id)
            }.onSuccess {
                _state.update { current ->
                    current.copy(
                        nutritionBusy = false,
                        offlinePendingCount = offlineQueue.count(),
                        dashboard = current.dashboard?.copy(nutritionLogs = current.dashboard.nutritionLogs.filterNot { it.id == log.id }),
                        nutritionViewingLogs = current.nutritionViewingLogs.filterNot { it.id == log.id },
                        nutritionHistory = current.nutritionHistory.filterNot { it.id == log.id },
                        transientMessage = "${log.name} kaldırıldı.",
                    )
                }
            }.onFailure { error -> _state.update { it.copy(nutritionBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun updateNutritionLog(log: com.hedefit.app.data.model.NutritionLogData, grams: Double, meal: String) {
        if (_state.value.nutritionBusy || log.id.startsWith("offline-")) return
        viewModelScope.launch {
            _state.update { it.copy(nutritionBusy = true) }
            runCatching { repository.updateNutritionLog(log, grams, meal) }.onSuccess { updated ->
                fun replace(items: List<com.hedefit.app.data.model.NutritionLogData>) = items.map { if (it.id == updated.id) updated else it }
                _state.update { current -> current.copy(
                    nutritionBusy = false,
                    dashboard = current.dashboard?.copy(nutritionLogs = replace(current.dashboard.nutritionLogs)),
                    nutritionViewingLogs = replace(current.nutritionViewingLogs),
                    nutritionHistory = replace(current.nutritionHistory),
                    transientMessage = if (updated.meal == log.meal) "${log.name} güncellendi." else "${log.name}, ${updated.meal} öğününe taşındı.",
                ) }
            }.onFailure { error -> _state.update { it.copy(nutritionBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun removeFavorite(id: String) = viewModelScope.launch {
        runCatching { repository.removeFavorite(id) }.onSuccess { _state.update { current -> current.copy(dashboard = current.dashboard?.copy(favoriteMeals = current.dashboard.favoriteMeals.filterNot { it.id == id })) } }
    }

    fun repeatFavorite(favorite: FavoriteMealData) = viewModelScope.launch {
        _state.update { it.copy(nutritionBusy = true) }
        runCatching { repository.repeatFavorite(favorite) }.onSuccess { log -> _state.update { current -> current.copy(nutritionBusy = false, dashboard = current.dashboard?.copy(nutritionLogs = listOf(log) + current.dashboard.nutritionLogs), nutritionViewingLogs = if (current.nutritionViewingDate == LocalDate.now()) listOf(log) + current.nutritionViewingLogs else current.nutritionViewingLogs, nutritionHistory = listOf(log) + current.nutritionHistory, transientMessage = "Favori öğün tekrar eklendi.") } }
            .onFailure { error -> _state.update { it.copy(nutritionBusy = false, transientMessage = friendlyError(error)) } }
    }

    fun addMealPlanItem(food: com.hedefit.app.data.model.FoodSearchData, grams: Double, date: LocalDate, mealType: String) = viewModelScope.launch {
        if (_state.value.nutritionBusy) return@launch
        _state.update { it.copy(nutritionBusy = true) }
        runCatching { repository.addMealPlanItem(food, grams, date, mealType) }
            .onSuccess { item -> _state.update { current -> current.copy(
                nutritionBusy = false,
                dashboard = current.dashboard?.copy(mealPlanItems = (current.dashboard.mealPlanItems + item).sortedBy { it.plannedDate }),
                transientMessage = "Öğün haftalık plana eklendi.",
            ) } }
            .onFailure { error -> _state.update { it.copy(nutritionBusy = false, transientMessage = friendlyError(error)) } }
    }

    fun toggleMealPlanItem(item: com.hedefit.app.data.model.MealPlanItemData, completed: Boolean) = viewModelScope.launch {
        if (_state.value.nutritionBusy) return@launch
        _state.update { current -> current.copy(
            nutritionBusy = true,
            dashboard = current.dashboard?.copy(mealPlanItems = current.dashboard.mealPlanItems.map { if (it.id == item.id) it.copy(completed = completed) else it }),
        ) }
        runCatching { repository.setMealPlanCompleted(item, completed) }
            .onSuccess { saved -> _state.update { current -> current.copy(
                nutritionBusy = false,
                dashboard = current.dashboard?.copy(mealPlanItems = current.dashboard.mealPlanItems.map { if (it.id == saved.id) saved else it }),
            ) } }
            .onFailure { error -> _state.update { current -> current.copy(
                nutritionBusy = false,
                dashboard = current.dashboard?.copy(mealPlanItems = current.dashboard.mealPlanItems.map { if (it.id == item.id) item else it }),
                transientMessage = friendlyError(error),
            ) } }
    }

    fun removeMealPlanItem(item: com.hedefit.app.data.model.MealPlanItemData) = viewModelScope.launch {
        if (_state.value.nutritionBusy) return@launch
        _state.update { it.copy(nutritionBusy = true) }
        runCatching { repository.removeMealPlanItem(item.id) }
            .onSuccess { _state.update { current -> current.copy(
                nutritionBusy = false,
                dashboard = current.dashboard?.copy(mealPlanItems = current.dashboard.mealPlanItems.filterNot { it.id == item.id }),
            ) } }
            .onFailure { error -> _state.update { it.copy(nutritionBusy = false, transientMessage = friendlyError(error)) } }
    }

    fun addWater(amountMl: Int) {
        if (amountMl == 0) return
        viewModelScope.launch {
            waterUpdateMutex.withLock {
                val dashboard = _state.value.dashboard ?: return@withLock
                val previous = dashboard.waterMl
                val next = (previous + amountMl).coerceIn(0, 20_000)
                if (next == previous) return@withLock
                _state.update { current -> current.copy(dashboard = current.dashboard?.copy(waterMl = next)) }
                runCatching { repository.setWater(next) }.onFailure { error ->
                    _state.update { current ->
                        val visibleWater = current.dashboard?.waterMl
                        current.copy(
                            dashboard = if (visibleWater == next) current.dashboard?.copy(waterMl = previous) else current.dashboard,
                            transientMessage = friendlyError(error),
                        )
                    }
                }
            }
        }
    }

    fun saveRoute(snapshot: RouteSnapshot, activityType: String, title: String) = viewModelScope.launch {
        runCatching { repository.saveRoute(snapshot, activityType, title) }
            .onSuccess {
                val route = RouteActivityData(
                    id = snapshot.id,
                    activityType = activityType,
                    title = title,
                    startedAt = Instant.ofEpochMilli(snapshot.startedAt).toString(),
                    endedAt = Instant.ofEpochMilli(snapshot.stoppedAt).toString(),
                    durationSeconds = snapshot.elapsedDurationSeconds,
                    movingDurationSeconds = snapshot.durationSeconds,
                    distanceMeters = snapshot.distanceMeters,
                    averagePaceSecondsPerKm = snapshot.paceSecondsPerKm,
                    averageSpeedKmh = snapshot.averageSpeedKmh,
                    calories = ((snapshot.distanceMeters / 1_000.0) * if (activityType == "Bisiklet") 28 else if (activityType.contains("Koş")) 62 else 45).toInt(),
                    routePoints = snapshot.points.map { com.hedefit.app.data.model.ActivityRoutePointData(it.latitude, it.longitude, it.recordedAt, it.accuracyMeters, it.altitude) },
                )
                _state.update { current -> current.copy(
                    dashboard = current.dashboard?.copy(routeActivities = listOf(route) + current.dashboard.routeActivities.filterNot { it.id == route.id }),
                    transientMessage = "Hedefit Rota kaydedildi; yeşil paylaşım kartın hazır.",
                ) }
            }
            .onFailure { error ->
                offlineQueue.enqueue("route", repository.routePayload(snapshot, activityType, title))
                OfflineSyncScheduler.enqueue(getApplication())
                _state.update { it.copy(offlinePendingCount = offlineQueue.count(), transientMessage = "Rota cihazda saklandı; bağlantı gelince otomatik eşitlenecek. (${friendlyError(error)})") }
            }
    }

    fun deleteRoute(route: RouteActivityData) = viewModelScope.launch {
        runCatching { repository.deleteRoute(route.id) }
            .onSuccess {
                _state.update { current -> current.copy(
                    dashboard = current.dashboard?.copy(routeActivities = current.dashboard.routeActivities.filterNot { it.id == route.id }),
                    transientMessage = "Rota kaydı silindi.",
                ) }
            }
            .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } }
    }

    fun uploadAvatar(bytes: ByteArray, mimeType: String) = viewModelScope.launch {
        if (_state.value.avatarUploading) return@launch
        val previousAvatar = _state.value.avatarPreview
        _state.update { it.copy(avatarUploading = true, avatarPreview = bytes) }
        try {
            val (path, url) = repository.uploadAvatar(bytes, mimeType)
            val userId = (_state.value.auth as? AuthState.SignedIn)?.session?.user?.id
            if (userId != null) cacheAvatar(userId, bytes)
            _state.update { current -> current.copy(avatarUploading = false, avatarPreview = bytes, dashboard = current.dashboard?.let { data -> data.copy(profile = data.profile.copy(avatarPath = path, avatarUrl = url)) }, transientMessage = "Profil fotoğrafın güncellendi.") }
        } catch (error: Throwable) {
            _state.update { it.copy(avatarUploading = false, avatarPreview = previousAvatar, transientMessage = friendlyError(error)) }
        }
    }

    fun scheduleWorkout(date: java.time.LocalDate, time: String, originalDate: String? = null) = viewModelScope.launch {
        runCatching { repository.scheduleWorkout(date, time, originalDate = originalDate) }
            .onSuccess { entry -> _state.update { current -> current.copy(dashboard = current.dashboard?.copy(schedule = current.dashboard.schedule.filterNot { it.date == entry.date } + entry), transientMessage = "Antrenman takvime kaydedildi.") } }
            .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } }
    }

    fun loadExerciseLibrary(search: String = "", muscle: String = "", equipment: String = "", level: String = "", environment: String = "", muscleRole: String = "", force: String = "", mechanic: String = "", category: String = "", locale: String = "tr") {
        viewModelScope.launch {
            _state.update { it.copy(exerciseLibraryBusy = true) }
            runCatching { repository.loadExerciseCatalog(search, muscle, equipment, level, environment, muscleRole, force, mechanic, category, locale) }
                .onSuccess { items -> _state.update { it.copy(exerciseLibraryBusy = false, exerciseLibrary = items) } }
                .onFailure { error -> _state.update { it.copy(exerciseLibraryBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun loadPreviousPerformance(requestedExercises: List<com.hedefit.app.data.model.WorkoutExerciseData>? = null) {
        val exercises = requestedExercises ?: _state.value.dashboard?.workouts.orEmpty()
        viewModelScope.launch { runCatching { repository.loadPreviousPerformance(exercises) }.onSuccess { previous -> _state.update { it.copy(previousPerformance = previous) } } }
    }

    fun useExerciseFromLibrary(item: ExerciseCatalogData) {
        val dashboard = _state.value.dashboard ?: return
        val current = dashboard.workouts.toMutableList()
        val replacement = com.hedefit.app.data.model.WorkoutExerciseData(item.id, item.name, item.primaryMuscles.firstOrNull() ?: "Tüm Vücut", 3, "8–12", 75)
        if (current.none { it.id == replacement.id || it.name.equals(replacement.name, ignoreCase = true) }) current += replacement
        _state.update { it.copy(dashboard = dashboard.copy(workouts = current)) }
        viewModelScope.launch {
            val active = dashboard.workoutPrograms.firstOrNull { it.isActive }
            runCatching {
                if (active != null) repository.saveProgram(active.name, active.source, active.focusArea, current, active.id, active.showOnHome)
                else repository.saveProgram("Kendi Programım", "custom", replacement.area, current)
            }.onSuccess { program -> _state.update { state -> state.copy(dashboard = state.dashboard?.let { data -> data.copy(workouts = current, workoutPrograms = withActiveProgram(data.workoutPrograms, program)) }, transientMessage = "Hareket programa eklendi.") } }
                .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } }
        }
    }

    fun updateWorkoutExercise(updated: com.hedefit.app.data.model.WorkoutExerciseData) = mutateWorkoutPlan("Hareket güncellendi.") { current ->
        current.map { if (it.id == updated.id) updated else it }
    }

    fun replaceWorkoutExercise(previousId: String, replacement: com.hedefit.app.data.model.WorkoutExerciseData) = mutateWorkoutPlan("Hareket değiştirildi.") { current ->
        current.map { if (it.id == previousId) replacement else it }
    }

    fun removeWorkoutExercise(id: String) = mutateWorkoutPlan("Hareket programdan çıkarıldı.") { current -> current.filterNot { it.id == id } }

    fun moveWorkoutExercise(id: String, offset: Int) = mutateWorkoutPlan("Program sırası güncellendi.") { current ->
        val from = current.indexOfFirst { it.id == id }
        val to = (from + offset).coerceIn(0, current.lastIndex)
        if (from < 0 || from == to) current else current.toMutableList().apply { add(to, removeAt(from)) }
    }

    private fun mutateWorkoutPlan(message: String, transform: (List<com.hedefit.app.data.model.WorkoutExerciseData>) -> List<com.hedefit.app.data.model.WorkoutExerciseData>) {
        val dashboard = _state.value.dashboard ?: return
        val next = transform(dashboard.workouts)
        _state.update { it.copy(dashboard = dashboard.copy(workouts = next)) }
        viewModelScope.launch {
            val active = dashboard.workoutPrograms.firstOrNull { it.isActive }
            runCatching { if (active != null) repository.saveProgram(active.name, active.source, active.focusArea, next, active.id, active.showOnHome) else { repository.saveWorkoutPlan(next); null } }
                .onSuccess { saved -> _state.update { state -> state.copy(dashboard = state.dashboard?.let { data -> data.copy(workoutPrograms = saved?.let { withActiveProgram(data.workoutPrograms, it) } ?: data.workoutPrograms) }, transientMessage = message) } }
                .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } }
        }
    }

    fun createCustomProgram(name: String, locale: String = "tr", onComplete: () -> Unit = {}) {
        viewModelScope.launch {
            runCatching { repository.saveProgram(name.ifBlank { if (locale == "en") "My Program" else "Kendi Programım" }, "custom", "", emptyList()) }
                .onSuccess { program -> _state.update { state -> state.copy(dashboard = state.dashboard?.let { data -> data.copy(workouts = emptyList(), workoutPrograms = withActiveProgram(data.workoutPrograms, program)) }, transientMessage = if (locale == "en") "Custom program created." else "Kendi programın oluşturuldu.") }; onComplete() }
                .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } }
        }
    }

    fun addPushPullTemplate(key: String, locale: String = "tr") {
        if (_state.value.planGenerating) return
        val en = locale == "en"
        val definitions = pushPullTemplate(key, en) ?: return
        viewModelScope.launch {
            _state.update { it.copy(planGenerating = true) }
            runCatching { repository.saveProgram(definitions.first, "push_pull_template", definitions.first, definitions.second) }
                .onSuccess { program -> _state.update { current -> current.copy(
                    planGenerating = false,
                    dashboard = current.dashboard?.let { data -> data.copy(workouts = program.exercises, workoutPrograms = withActiveProgram(data.workoutPrograms, program)) },
                    transientMessage = if (en) "${program.name} was added and activated." else "${program.name} eklendi ve aktif edildi.",
                ) } }
                .onFailure { error -> _state.update { it.copy(planGenerating = false, transientMessage = friendlyError(error)) } }
        }
    }

    private fun pushPullTemplate(key: String, en: Boolean): Pair<String, List<com.hedefit.app.data.model.WorkoutExerciseData>>? {
        fun exercise(id: String, tr: String, english: String, area: String, sets: Int, reps: String, rest: Int) = com.hedefit.app.data.model.WorkoutExerciseData(id, if (en) english else tr, area, sets, reps, rest)
        val pushA = listOf(
            exercise("barbell-bench-press", "Barbell Bench Press", "Barbell Bench Press", if (en) "Chest" else "Göğüs", 4, "6–8", 120),
            exercise("incline-dumbbell-press", "Incline Dumbbell Press", "Incline Dumbbell Press", if (en) "Upper chest" else "Üst göğüs", 3, "8–12", 90),
            exercise("seated-dumbbell-press", "Seated Dumbbell Press", "Seated Dumbbell Press", if (en) "Shoulders" else "Omuz", 3, "8–12", 90),
            exercise("dumbbell-lateral-raise", "Dumbbell Lateral Raise", "Dumbbell Lateral Raise", if (en) "Shoulders" else "Omuz", 3, "12–15", 60),
            exercise("cable-rope-triceps-pushdown", "Cable Rope Triceps Pushdown", "Cable Rope Triceps Pushdown", if (en) "Triceps" else "Arka kol", 3, "10–15", 60),
        )
        val pushB = listOf(
            exercise("barbell-shoulder-press", "Barbell Shoulder Press", "Barbell Shoulder Press", if (en) "Shoulders" else "Omuz", 4, "6–8", 120),
            exercise("dumbbell-bench-press", "Dumbbell Bench Press", "Dumbbell Bench Press", if (en) "Chest" else "Göğüs", 3, "8–12", 90),
            exercise("cable-crossover", "Cable Crossover", "Cable Crossover", if (en) "Chest" else "Göğüs", 3, "12–15", 60),
            exercise("dumbbell-lateral-raise-b", "Dumbbell Lateral Raise", "Dumbbell Lateral Raise", if (en) "Shoulders" else "Omuz", 4, "12–20", 60),
            exercise("overhead-cable-triceps-extension", "Overhead Cable Triceps Extension", "Overhead Cable Triceps Extension", if (en) "Triceps" else "Arka kol", 3, "10–15", 60),
        )
        val pullA = listOf(
            exercise("pullups", "Pull-up", "Pull-up", if (en) "Back" else "Sırt", 4, "6–10", 120),
            exercise("wide-grip-lat-pulldown", "Wide-Grip Lat Pulldown", "Wide-Grip Lat Pulldown", if (en) "Back" else "Sırt", 3, "8–12", 90),
            exercise("seated-cable-row", "Seated Cable Row", "Seated Cable Row", if (en) "Back" else "Sırt", 3, "8–12", 90),
            exercise("face-pull", "Face Pull", "Face Pull", if (en) "Rear delts" else "Arka omuz", 3, "12–15", 60),
            exercise("incline-dumbbell-curl", "Incline Dumbbell Curl", "Incline Dumbbell Curl", if (en) "Biceps" else "Ön kol", 3, "10–15", 60),
        )
        val pullB = listOf(
            exercise("barbell-row", "Barbell Row", "Barbell Row", if (en) "Back" else "Sırt", 4, "6–8", 120),
            exercise("close-grip-lat-pulldown", "Close-Grip Lat Pulldown", "Close-Grip Lat Pulldown", if (en) "Back" else "Sırt", 3, "8–12", 90),
            exercise("chest-supported-dumbbell-row", "Chest-Supported Dumbbell Row", "Chest-Supported Dumbbell Row", if (en) "Back" else "Sırt", 3, "8–12", 90),
            exercise("reverse-pec-deck", "Reverse Pec Deck", "Reverse Pec Deck", if (en) "Rear delts" else "Arka omuz", 3, "12–15", 60),
            exercise("hammer-curl", "Hammer Curl", "Hammer Curl", if (en) "Biceps" else "Ön kol", 3, "10–15", 60),
        )
        return when (key) { "push_a" -> (if (en) "Push A" else "İtiş A") to pushA; "push_b" -> (if (en) "Push B" else "İtiş B") to pushB; "pull_a" -> (if (en) "Pull A" else "Çekiş A") to pullA; "pull_b" -> (if (en) "Pull B" else "Çekiş B") to pullB; else -> null }
    }

    fun activateProgram(program: WorkoutProgramData) {
        viewModelScope.launch { runCatching { repository.activateProgram(program) }
            .onSuccess { active -> _state.update { state -> state.copy(dashboard = state.dashboard?.let { data -> data.copy(workouts = active.exercises, workoutPrograms = withActiveProgram(data.workoutPrograms, active)) }, transientMessage = "${active.name} aktif program oldu.") } }
            .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } } }
    }

    fun setProgramHomeVisibility(program: WorkoutProgramData, showOnHome: Boolean) {
        viewModelScope.launch {
            runCatching { repository.setProgramHomeVisibility(program, showOnHome) }
                .onSuccess { updated -> _state.update { state -> state.copy(dashboard = state.dashboard?.let { data ->
                    data.copy(workoutPrograms = data.workoutPrograms.map { if (it.id == updated.id) updated else it })
                }) } }
                .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } }
        }
    }

    fun deleteProgram(program: WorkoutProgramData) {
        viewModelScope.launch { runCatching { repository.deleteProgram(program) }
            .onSuccess { active -> _state.update { state -> state.copy(dashboard = state.dashboard?.let { data ->
                val remaining = data.workoutPrograms.filterNot { it.id == program.id }
                data.copy(
                    workouts = if (program.isActive) active?.exercises.orEmpty() else data.workouts,
                    workoutPrograms = active?.let { withActiveProgram(remaining, it) } ?: remaining,
                )
            }, transientMessage = "Program kaldırıldı.") } }
            .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } } }
    }

    private fun withActiveProgram(current: List<WorkoutProgramData>, active: WorkoutProgramData) = listOf(active.copy(isActive = true)) + current.filterNot { it.id == active.id }.map { it.copy(isActive = false) }

    fun generateRegionalPlan(muscle: String, label: String, locale: String = "tr") {
        if (_state.value.planGenerating) return
        viewModelScope.launch {
            _state.update { it.copy(planGenerating = true) }
            runCatching {
                val plan = repository.loadExerciseCatalog(muscle = muscle, muscleRole = "primary", category = "strength", locale = locale)
                    .sortedWith(compareBy<ExerciseCatalogData> { if (it.mechanic == "compound") 0 else 1 }.thenBy { it.name })
                    .take(5).mapIndexed { index, item ->
                    com.hedefit.app.data.model.WorkoutExerciseData(item.id, item.name, label, if (index < 2) 4 else 3, "8–12", 75)
                }
                require(plan.isNotEmpty()) { if (locale == "en") "No exercises found for this area." else "Bu bölge için hareket bulunamadı." }
                repository.saveProgram(if (locale == "en") "$label Program" else "$label Programı", "regional", label, plan)
            }.onSuccess { program -> _state.update { current -> current.copy(planGenerating = false, dashboard = current.dashboard?.let { data -> data.copy(workouts = program.exercises, workoutPrograms = withActiveProgram(data.workoutPrograms, program)) }, transientMessage = if (locale == "en") "$label plan is ready." else "$label odaklı programın hazır.") } }
                .onFailure { error -> _state.update { it.copy(planGenerating = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun generatePlan() {
        val profile = _state.value.dashboard?.profile ?: return
        if (_state.value.planGenerating) return
        viewModelScope.launch {
            _state.update { it.copy(planGenerating = true, transientMessage = null) }
            val existingId = _state.value.dashboard?.workoutPrograms?.firstOrNull { it.source == "assessment" }?.id
            runCatching { repository.generatePlan(profile).let { workouts -> repository.saveProgram("Kişisel Atlas Programım", "assessment", profile.goal, workouts, existingId ?: java.util.UUID.randomUUID().toString(), showOnHome = true) } }
                .onSuccess { program ->
                    _state.update { current ->
                        current.copy(
                            planGenerating = false,
                            dashboard = current.dashboard?.let { data -> data.copy(workouts = program.exercises, workoutPrograms = withActiveProgram(data.workoutPrograms, program)) },
                            transientMessage = "Kişisel antrenman programın hazır.",
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(planGenerating = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun addNutritionWithAi(food: String, grams: Double, meal: String) {
        if (_state.value.nutritionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(nutritionBusy = true, transientMessage = null) }
            runCatching {
                val estimate = repository.estimateNutrition(food, grams)
                repository.addNutrition(estimate, meal)
            }.onSuccess { log ->
                _state.update { current ->
                    current.copy(
                        nutritionBusy = false,
                        dashboard = current.dashboard?.copy(nutritionLogs = listOf(log) + current.dashboard.nutritionLogs),
                        nutritionViewingLogs = if (current.nutritionViewingDate == LocalDate.now()) listOf(log) + current.nutritionViewingLogs else current.nutritionViewingLogs,
                        nutritionHistory = listOf(log) + current.nutritionHistory,
                        transientMessage = "${log.name} öğün günlüğüne eklendi.",
                    )
                }
            }.onFailure { error -> _state.update { it.copy(nutritionBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun sendChat(text: String, locale: String = "tr") {
        val clean = text.trim()
        if (clean.isEmpty() || _state.value.chatBusy) return
        val userMessage = ChatMessageState(clean, true)
        _state.update { it.copy(chatBusy = true, chatMessages = it.chatMessages + userMessage) }
        viewModelScope.launch {
            val history = _state.value.chatMessages.map { it.text to it.user }
            runCatching {
                repository.sendChat(history, _state.value.dashboard, locale)
            }
                .onSuccess { reply ->
                    _state.update {
                        it.copy(chatBusy = false, chatMessages = it.chatMessages + ChatMessageState(reply.text, false), chatUsageUsed = reply.used ?: it.chatUsageUsed, chatUsageLimit = reply.limit ?: it.chatUsageLimit)
                    }
                }
                .onFailure { error ->
                    val message = friendlyError(error)
                    _state.update { it.copy(chatBusy = false, chatMessages = it.chatMessages + ChatMessageState("Fit Koç şu anda yanıtı tamamlayamadı: $message", false), transientMessage = message) }
                }
        }
    }

    fun clearChat() {
        if (_state.value.chatBusy) return
        _state.update { it.copy(chatMessages = emptyList(), transientMessage = "Sohbet temizlendi.") }
    }

    fun saveProfile(update: ProfileUpdateData, regeneratePlan: Boolean = false, onComplete: () -> Unit = {}) {
        if (_state.value.profileSaving) return
        viewModelScope.launch {
            _state.update { it.copy(profileSaving = true) }
            val profile = runCatching { repository.saveProfile(update) }.getOrElse { error ->
                _state.update { it.copy(profileSaving = false, transientMessage = friendlyError(error)) }
                return@launch
            }
            _state.update { current -> current.copy(dashboard = current.dashboard?.copy(profile = profile)) }
            if (!regeneratePlan) {
                _state.update { it.copy(profileSaving = false, transientMessage = "Profilin güncellendi.") }
                onComplete()
                return@launch
            }
            val existingAssessment = _state.value.dashboard?.workoutPrograms?.firstOrNull { it.source == "assessment" }
            runCatching {
                val workouts = repository.generatePlan(profile)
                repository.saveProgram("Kişisel Atlas Programım", "assessment", profile.goal, workouts, existingAssessment?.id ?: java.util.UUID.randomUUID().toString(), showOnHome = true)
            }.onSuccess { program ->
                _state.update { current ->
                    current.copy(
                        profileSaving = false,
                        dashboard = current.dashboard?.let { data -> data.copy(profile = profile, workouts = program.exercises, workoutPrograms = withActiveProgram(data.workoutPrograms, program)) },
                        transientMessage = "OpenAI 15 yanıtını değerlendirdi; Hareket Atlası programın ana ekranda hazır.",
                    )
                }
                onComplete()
            }.onFailure { error ->
                _state.update { it.copy(profileSaving = false, transientMessage = "Profilin kaydedildi. Program şu anda yenilenemedi: ${friendlyError(error)}") }
                onComplete()
            }
        }
    }

    fun saveBodyMeasurement(measurement: BodyMeasurementData) {
        if (_state.value.measurementSaving) return
        viewModelScope.launch {
            _state.update { it.copy(measurementSaving = true, transientMessage = null) }
            runCatching { repository.saveBodyMeasurement(measurement) }
                .onSuccess { saved ->
                    _state.update { current ->
                        val existing = current.dashboard?.measurements.orEmpty().filterNot { it.date.take(10) == saved.date.take(10) }
                        current.copy(
                            measurementSaving = false,
                            dashboard = current.dashboard?.copy(measurements = (existing + saved).sortedBy { it.date }),
                            transientMessage = "Vücut ölçülerin kaydedildi.",
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(measurementSaving = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun resetProgress() {
        if (_state.value.accountBusy) return
        viewModelScope.launch {
            _state.update { it.copy(accountBusy = true) }
            runCatching { repository.resetProgress() }
                .onSuccess {
                    _state.update { it.copy(accountBusy = false, transientMessage = "İlerleme verilerin sıfırlandı.") }
                    refreshAll()
                }
                .onFailure { error -> _state.update { it.copy(accountBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun freezeAccount() {
        if (_state.value.accountBusy) return
        viewModelScope.launch {
            _state.update { it.copy(accountBusy = true) }
            runCatching { repository.freezeAccount() }
                .onSuccess { _state.update { it.copy(accountBusy = false, accountFrozen = true, dashboard = null) } }
                .onFailure { error -> _state.update { it.copy(accountBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun reactivateAccount() {
        if (_state.value.accountBusy) return
        viewModelScope.launch {
            _state.update { it.copy(accountBusy = true) }
            runCatching { repository.reactivateAccount() }
                .onSuccess {
                    _state.update { it.copy(accountBusy = false, accountFrozen = false, transientMessage = "Hesabın yeniden etkinleştirildi.") }
                    refreshAll()
                }
                .onFailure { error -> _state.update { it.copy(accountBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun deleteAccount(email: String) {
        if (_state.value.accountBusy) return
        viewModelScope.launch {
            _state.update { it.copy(accountBusy = true) }
            runCatching { repository.deleteAccount(email) }
                .onSuccess {
                    authRepository.signOut()
                    _state.value = MainUiState(auth = AuthState.SignedOut, transientMessage = "Hesabın kalıcı olarak silindi.")
                }
                .onFailure { error -> _state.update { it.copy(accountBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun consumeTransientMessage() {
        _state.update { it.copy(transientMessage = null) }
    }

    private fun authAction(block: suspend () -> Unit) {
        if (_state.value.authBusy) return
        viewModelScope.launch {
            _state.update { it.copy(authBusy = true, authMessage = null) }
            runCatching { block() }
                .onFailure { error -> _state.update { it.copy(authBusy = false, authMessage = friendlyError(error)) } }
        }
    }

    private suspend fun onSignedIn(session: AuthSession) {
        val cachedAvatar = loadCachedAvatar(session.user.id)
        _state.update { it.copy(auth = AuthState.SignedIn(session), authBusy = false, authMessage = null, avatarPreview = cachedAvatar) }
        checkAccountThenLoad()
    }

    private fun avatarCacheFile(userId: String): File {
        val safeId = userId.replace(Regex("[^a-zA-Z0-9_-]"), "")
        return File(getApplication<Application>().filesDir, "profile-avatar-$safeId.jpg")
    }

    private suspend fun cacheAvatar(userId: String, bytes: ByteArray) = withContext(Dispatchers.IO) {
        avatarCacheFile(userId).writeBytes(bytes)
    }

    private suspend fun loadCachedAvatar(userId: String): ByteArray? = withContext(Dispatchers.IO) {
        avatarCacheFile(userId).takeIf { it.isFile && it.length() in 1..(5L * 1024 * 1024) }?.readBytes()
    }

    private suspend fun downloadAvatar(url: String): ByteArray? = withContext(Dispatchers.IO) {
        runCatching {
            val connection = URL(url).openConnection().apply {
                connectTimeout = 10_000
                readTimeout = 15_000
            }
            connection.getInputStream().use { input ->
                input.readAtMost(5 * 1024 * 1024)
            }
        }.getOrNull()
    }

    private fun InputStream.readAtMost(maxBytes: Int): ByteArray? {
        val output = ByteArrayOutputStream(minOf(maxBytes, 16 * 1024))
        val buffer = ByteArray(8 * 1024)
        var total = 0
        while (true) {
            val read = read(buffer)
            if (read < 0) break
            total += read
            if (total > maxBytes) return null
            output.write(buffer, 0, read)
        }
        return output.toByteArray().takeIf { it.isNotEmpty() }
    }

    private fun checkAccountThenLoad() {
        viewModelScope.launch {
            runCatching { repository.accountStatus() }
                .onSuccess { status ->
                    if (status == "frozen") _state.update { it.copy(accountFrozen = true, dataLoading = false) }
                    else refreshAll()
                }
                .onFailure { refreshAll() }
        }
    }

    private fun friendlyError(error: Throwable): String {
        val message = error.message.orEmpty()
        return when {
            message.contains("Invalid login credentials", true) -> "E-posta veya şifre hatalı."
            message.contains("Email not confirmed", true) -> "E-posta adresini doğrulaman gerekiyor."
            message.contains("Email address", true) && message.contains("invalid", true) -> "Bu e-posta adresi kabul edilmedi. Başka bir e-posta adresi dene."
            message.contains("already registered", true) || message.contains("already exists", true) -> "Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı dene."
            message.contains("rate limit", true) || message.contains("too many", true) -> "Çok fazla deneme yapıldı. Biraz bekleyip yeniden dene."
            message.contains("network", true) || message.contains("Unable to resolve host", true) -> "İnternet bağlantısı kurulamadı."
            message.isNotBlank() -> message.take(220)
            else -> "Beklenmeyen bir hata oluştu."
        }
    }
}
