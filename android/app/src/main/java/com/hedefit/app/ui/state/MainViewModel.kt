package com.hedefit.app.ui.state

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.hedefit.app.data.auth.AuthRepository
import com.hedefit.app.data.auth.AuthSession
import com.hedefit.app.data.auth.AuthState
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
import com.hedefit.app.data.offline.OfflineQueueStore
import com.hedefit.app.data.offline.OfflineSyncScheduler
import com.hedefit.app.data.offline.workoutOfflinePayload
import com.hedefit.app.health.HealthConnectManager
import com.hedefit.app.route.RouteSnapshot
import com.hedefit.app.data.network.HedefitApiClient
import com.hedefit.app.data.network.JsonHttpClient
import com.hedefit.app.data.network.SupabaseRestClient
import com.hedefit.app.data.repository.HedefitRepository
import com.hedefit.app.coach.LocalCoach
import com.hedefit.app.coach.LocalCoachState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate

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
    val localCoach: LocalCoachState? = null,
    val transientMessage: String? = null,
    val profileSaving: Boolean = false,
    val avatarUploading: Boolean = false,
    val measurementSaving: Boolean = false,
    val accountBusy: Boolean = false,
    val accountFrozen: Boolean = false,
    val healthConnected: Boolean = false,
    val healthBusy: Boolean = false,
    val foodSearchBusy: Boolean = false,
    val foodSearchResults: List<FoodSearchData> = emptyList(),
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
    private val offlineQueue = OfflineQueueStore(application)
    private val localCoach = LocalCoach(application)

    private val _state = MutableStateFlow(MainUiState())
    val state: StateFlow<MainUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch { localCoach.state.collect { status -> _state.update { it.copy(localCoach = status) } } }
        viewModelScope.launch {
            val auth = authRepository.bootstrap()
            _state.update { it.copy(auth = auth) }
            if (auth is AuthState.SignedIn) checkAccountThenLoad()
        }
    }

    fun signIn(email: String, password: String) = authAction {
        val session = authRepository.signIn(email, password)
        onSignedIn(session)
    }

    fun signUp(email: String, password: String) = authAction {
        when (val result = authRepository.signUp(email, password)) {
            is SignUpResult.SignedIn -> onSignedIn(result.session)
            SignUpResult.VerificationRequired -> _state.update {
                it.copy(authBusy = false, authMessage = "Doğrulama bağlantısı e-posta adresine gönderildi. Doğruladıktan sonra giriş yapabilirsin.")
            }
        }
    }

    fun signInWithGoogle(idToken: String, nonce: String) = authAction {
        onSignedIn(authRepository.signInWithGoogle(idToken, nonce))
    }

    fun reportAuthError(message: String) {
        _state.update { it.copy(authBusy = false, authMessage = message) }
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
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(dataLoading = false, dataError = friendlyError(error)) } }
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

    fun completeDetailedWorkout(durationSeconds: Int, calories: Int, sets: List<WorkoutSetInput>, feedback: WorkoutFeedbackData) {
        val exercises = _state.value.dashboard?.workouts.orEmpty()
        if (exercises.isEmpty() || sets.isEmpty() || _state.value.workoutSaving) return
        viewModelScope.launch {
            _state.update { it.copy(workoutSaving = true) }
            runCatching { repository.recordWorkout(exercises, sets, durationSeconds, calories, feedback) }
                .onSuccess { session ->
                    _state.update { current -> current.copy(workoutSaving = false, dashboard = current.dashboard?.copy(sessions = listOf(session) + current.dashboard.sessions), transientMessage = "Antrenman ve tüm setlerin kaydedildi.") }
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

    private fun adaptPlan(feedback: WorkoutFeedbackData) {
        val profile = _state.value.dashboard?.profile ?: return
        viewModelScope.launch {
            runCatching { repository.generatePlan(profile, feedback) }.onSuccess { workouts ->
                _state.update { current -> current.copy(dashboard = current.dashboard?.copy(workouts = workouts), transientMessage = "Fit Koç geri bildirimine göre sonraki planı uyarladı.") }
            }
        }
    }

    fun syncHealthConnect() {
        if (_state.value.healthBusy) return
        viewModelScope.launch {
            _state.update { it.copy(healthBusy = true) }
            runCatching {
                val snapshot = healthConnect.readToday()
                repository.syncHealth(snapshot)
                snapshot
            }.onSuccess { snapshot ->
                _state.update { current -> current.copy(healthBusy = false, healthConnected = true, dashboard = current.dashboard?.copy(steps = snapshot.steps, sleepMinutes = snapshot.sleepMinutes, activeCalories = snapshot.activeCalories), transientMessage = "Health Connect verileri güncellendi.") }
            }.onFailure { error -> _state.update { it.copy(healthBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun checkHealthConnect() {
        viewModelScope.launch { runCatching { healthConnect.hasPermissions() }.onSuccess { connected -> _state.update { it.copy(healthConnected = connected) } } }
    }

    fun searchFoods(query: String) {
        if (query.trim().length < 2 || _state.value.foodSearchBusy) return
        viewModelScope.launch {
            _state.update { it.copy(foodSearchBusy = true) }
            runCatching { repository.searchFoods(query) }
                .onSuccess { results -> _state.update { it.copy(foodSearchBusy = false, foodSearchResults = results) } }
                .onFailure { error -> _state.update { it.copy(foodSearchBusy = false, transientMessage = friendlyError(error)) } }
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
                        offlineQueue.enqueue("nutrition", payload); OfflineSyncScheduler.enqueue(getApplication())
                        val ratio = grams / 100.0
                        val local = com.hedefit.app.data.model.NutritionLogData("offline-${System.currentTimeMillis()}", java.time.LocalDate.now().toString(), meal, food.name, (food.calories * ratio).toInt(), food.protein * ratio, food.carbs * ratio, food.fat * ratio, grams, food.fiber * ratio, food.sugar * ratio, food.sodiumMg * ratio, food.potassiumMg * ratio, food.calciumMg * ratio, food.ironMg * ratio, food.vitaminCMg * ratio)
                        _state.update { current -> current.copy(nutritionBusy = false, offlinePendingCount = offlineQueue.count(), dashboard = current.dashboard?.copy(nutritionLogs = listOf(local) + current.dashboard.nutritionLogs), nutritionViewingLogs = if (current.nutritionViewingDate == LocalDate.now()) listOf(local) + current.nutritionViewingLogs else current.nutritionViewingLogs, nutritionHistory = listOf(local) + current.nutritionHistory, transientMessage = "Öğün çevrimdışı kaydedildi; bağlantı gelince eşitlenecek.") }
                    } else _state.update { it.copy(nutritionBusy = false, transientMessage = friendlyError(error)) }
                }
        }
    }

    fun addFavorite(log: com.hedefit.app.data.model.NutritionLogData) = viewModelScope.launch {
        runCatching { repository.addFavorite(log) }.onSuccess { favorite -> _state.update { current -> current.copy(dashboard = current.dashboard?.copy(favoriteMeals = listOf(favorite) + current.dashboard.favoriteMeals.filterNot { it.id == favorite.id }), transientMessage = "Öğün favorilere eklendi.") } }
            .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } }
    }

    fun removeFavorite(id: String) = viewModelScope.launch {
        runCatching { repository.removeFavorite(id) }.onSuccess { _state.update { current -> current.copy(dashboard = current.dashboard?.copy(favoriteMeals = current.dashboard.favoriteMeals.filterNot { it.id == id })) } }
    }

    fun repeatFavorite(favorite: FavoriteMealData) = viewModelScope.launch {
        _state.update { it.copy(nutritionBusy = true) }
        runCatching { repository.repeatFavorite(favorite) }.onSuccess { log -> _state.update { current -> current.copy(nutritionBusy = false, dashboard = current.dashboard?.copy(nutritionLogs = listOf(log) + current.dashboard.nutritionLogs), nutritionViewingLogs = if (current.nutritionViewingDate == LocalDate.now()) listOf(log) + current.nutritionViewingLogs else current.nutritionViewingLogs, nutritionHistory = listOf(log) + current.nutritionHistory, transientMessage = "Favori öğün tekrar eklendi.") } }
            .onFailure { error -> _state.update { it.copy(nutritionBusy = false, transientMessage = friendlyError(error)) } }
    }

    fun addWater(amountMl: Int) {
        val dashboard = _state.value.dashboard ?: return
        val next = (dashboard.waterMl + amountMl).coerceIn(0, 20_000)
        _state.update { it.copy(dashboard = dashboard.copy(waterMl = next)) }
        viewModelScope.launch { runCatching { repository.setWater(next) }.onFailure { _state.update { current -> current.copy(transientMessage = friendlyError(it)) } } }
    }

    fun saveRoute(snapshot: RouteSnapshot, activityType: String) = viewModelScope.launch {
        runCatching { repository.saveRoute(snapshot, activityType) }
            .onSuccess {
                val route = RouteActivityData(
                    id = snapshot.id,
                    activityType = activityType,
                    startedAt = Instant.ofEpochMilli(snapshot.startedAt).toString(),
                    endedAt = Instant.ofEpochMilli(snapshot.stoppedAt).toString(),
                    durationSeconds = snapshot.durationSeconds,
                    distanceMeters = snapshot.distanceMeters,
                )
                _state.update { current -> current.copy(
                    dashboard = current.dashboard?.copy(routeActivities = listOf(route) + current.dashboard.routeActivities.filterNot { it.id == route.id }),
                    transientMessage = "Hedefit Rota kaydedildi; yeşil paylaşım kartın hazır.",
                ) }
            }
            .onFailure { error -> _state.update { it.copy(transientMessage = "Rota cihazda saklandı. Sunucu eşitlemesi: ${friendlyError(error)}") } }
    }

    fun uploadAvatar(bytes: ByteArray, mimeType: String) = viewModelScope.launch {
        if (_state.value.avatarUploading) return@launch
        _state.update { it.copy(avatarUploading = true) }
        runCatching { repository.uploadAvatar(bytes, mimeType) }
            .onSuccess { (path, url) -> _state.update { current -> current.copy(avatarUploading = false, dashboard = current.dashboard?.let { data -> data.copy(profile = data.profile.copy(avatarPath = path, avatarUrl = url)) }, transientMessage = "Profil fotoğrafın güncellendi.") } }
            .onFailure { error -> _state.update { it.copy(avatarUploading = false, transientMessage = friendlyError(error)) } }
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

    fun loadPreviousPerformance() {
        val exercises = _state.value.dashboard?.workouts.orEmpty()
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
                if (active != null) repository.saveProgram(active.name, active.source, active.focusArea, current, active.id)
                else repository.saveProgram("Kendi Programım", "custom", replacement.area, current)
            }.onSuccess { program -> _state.update { state -> state.copy(dashboard = state.dashboard?.let { data -> data.copy(workouts = current, workoutPrograms = withActiveProgram(data.workoutPrograms, program)) }, transientMessage = "Hareket programa eklendi.") } }
                .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } }
        }
    }

    fun updateWorkoutExercise(updated: com.hedefit.app.data.model.WorkoutExerciseData) = mutateWorkoutPlan("Hareket güncellendi.") { current ->
        current.map { if (it.id == updated.id) updated else it }
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
            runCatching { if (active != null) repository.saveProgram(active.name, active.source, active.focusArea, next, active.id) else { repository.saveWorkoutPlan(next); null } }
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

    fun activateProgram(program: WorkoutProgramData) {
        viewModelScope.launch { runCatching { repository.activateProgram(program) }
            .onSuccess { active -> _state.update { state -> state.copy(dashboard = state.dashboard?.let { data -> data.copy(workouts = active.exercises, workoutPrograms = withActiveProgram(data.workoutPrograms, active)) }, transientMessage = "${active.name} aktif program oldu.") } }
            .onFailure { error -> _state.update { it.copy(transientMessage = friendlyError(error)) } } }
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
                val plan = repository.loadExerciseCatalog(muscle = muscle, muscleRole = "primary", category = "strength", locale = locale).take(5).mapIndexed { index, item ->
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
            runCatching { repository.generatePlan(profile).let { workouts -> repository.saveProgram("Fit Koç Programı", "assessment", profile.goal, workouts) } }
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

    fun prepareLocalCoach(locale: String = "tr") {
        if (_state.value.chatBusy || _state.value.localCoach?.downloading == true) return
        viewModelScope.launch {
            _state.update { it.copy(chatBusy = true, transientMessage = null) }
            runCatching { localCoach.downloadAndPrepare(locale) }
                .onSuccess { _state.update { it.copy(chatBusy = false, transientMessage = "Akıllı Fit Koç cihazında hazır. İnternet olmadan da konuşabilirsin.") } }
                .onFailure { error -> _state.update { it.copy(chatBusy = false, transientMessage = friendlyError(error)) } }
        }
    }

    fun removeLocalCoach() = localCoach.removeModel()

    fun sendChat(text: String, locale: String = "tr", useLocalCoach: Boolean = false) {
        val clean = text.trim()
        if (clean.isEmpty() || _state.value.chatBusy) return
        val userMessage = ChatMessageState(clean, true)
        _state.update { it.copy(chatBusy = true, chatMessages = it.chatMessages + userMessage) }
        viewModelScope.launch {
            val history = _state.value.chatMessages.map { it.text to it.user }
            runCatching {
                if (useLocalCoach) com.hedefit.app.data.model.ChatReplyData(localCoach.reply(clean, locale), "qwen-local", null, null)
                else repository.sendChat(history, _state.value.dashboard, locale)
            }
                .onSuccess { reply ->
                    _state.update { it.copy(chatBusy = false, chatMessages = it.chatMessages + ChatMessageState(reply.text, false)) }
                }
                .onFailure { error ->
                    val message = friendlyError(error)
                    _state.update { it.copy(chatBusy = false, chatMessages = it.chatMessages + ChatMessageState("Fit Koç şu anda yanıtı tamamlayamadı: $message", false), transientMessage = message) }
                }
        }
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
            runCatching { repository.generatePlan(profile) }.onSuccess { workouts ->
                _state.update { current ->
                    current.copy(
                        profileSaving = false,
                        dashboard = current.dashboard?.copy(profile = profile, workouts = workouts),
                        transientMessage = "Profilin ve kişisel planın yenilendi.",
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
        _state.update { it.copy(auth = AuthState.SignedIn(session), authBusy = false, authMessage = null) }
        checkAccountThenLoad()
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
            message.contains("network", true) || message.contains("Unable to resolve host", true) -> "İnternet bağlantısı kurulamadı."
            message.isNotBlank() -> message.take(220)
            else -> "Beklenmeyen bir hata oluştu."
        }
    }
}
