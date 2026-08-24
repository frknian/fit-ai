package com.hedefit.app

import android.os.Bundle
import android.Manifest
import android.os.Build
import androidx.activity.OnBackPressedDispatcher
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.hedefit.app.ui.components.HedefitAppFrame
import com.hedefit.app.ui.model.AppDestination
import com.hedefit.app.ui.screens.ActiveWorkoutScreen
import com.hedefit.app.ui.screens.AuthGateScreen
import com.hedefit.app.ui.screens.CoachScreen
import com.hedefit.app.ui.screens.HomeScreen
import com.hedefit.app.ui.screens.NutritionScreen
import com.hedefit.app.ui.screens.ProgressScreen
import com.hedefit.app.ui.screens.WorkoutPlanScreen
import com.hedefit.app.ui.screens.ProfileSettingsScreen
import com.hedefit.app.ui.screens.ProfileQuestionnaireScreen
import com.hedefit.app.ui.screens.NotificationCalendarScreen
import com.hedefit.app.ui.screens.FrozenAccountScreen
import com.hedefit.app.ui.screens.WorkoutCalendarScreen
import com.hedefit.app.ui.screens.ExerciseLibraryScreen
import com.hedefit.app.ui.screens.RouteScreen
import com.hedefit.app.ui.screens.GoalJourneyScreen
import com.hedefit.app.shortcuts.HedefitShortcuts
import com.hedefit.app.ui.theme.HedefitTheme
import com.hedefit.app.ui.state.MainViewModel
import com.hedefit.app.data.auth.AuthState
import com.hedefit.app.data.auth.GoogleSignInManager
import android.widget.Toast
import kotlinx.coroutines.launch
import com.hedefit.app.ui.settings.AppPreferencesStore
import com.hedefit.app.notifications.NotificationScheduler
import com.hedefit.app.health.HealthConnectManager

private enum class UtilityPage { Main, Profile, Questionnaire, Notifications, Calendar, ExerciseLibrary, Route, GoalJourney }

class MainActivity : ComponentActivity() {
    private val mainViewModel: MainViewModel by viewModels()
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val preferencesStore = remember { AppPreferencesStore(this@MainActivity) }
            val notificationScheduler = remember { NotificationScheduler(this@MainActivity) }
            val healthConnectManager = remember { HealthConnectManager(this@MainActivity) }
            val healthPermissionLauncher = rememberLauncherForActivityResult(healthConnectManager.permissionContract()) { granted ->
                if (granted.containsAll(healthConnectManager.permissions)) mainViewModel.syncHealthConnect()
            }
            var preferences by remember { mutableStateOf(preferencesStore.read()) }
            HedefitTheme(darkTheme = preferences.darkTheme) {
                val uiState by mainViewModel.state.collectAsState()
                var selected by rememberSaveable { mutableStateOf(when { intent?.getBooleanExtra("open_workout", false) == true -> AppDestination.Workout; intent?.getBooleanExtra("open_nutrition", false) == true -> AppDestination.Nutrition; else -> AppDestination.Home }) }
                var activeWorkout by remember { mutableStateOf(false) }
                var utilityPage by remember { mutableStateOf(if (intent?.getBooleanExtra("open_route", false) == true) UtilityPage.Route else UtilityPage.Main) }
                var googleCredentialBusy by remember { mutableStateOf(false) }
                val scope = rememberCoroutineScope()
                val googleSignIn = remember { GoogleSignInManager(this@MainActivity) }

                fun updatePreferences(next: com.hedefit.app.ui.settings.AppPreferences) {
                    preferences = next
                    preferencesStore.write(next)
                    notificationScheduler.apply(next)
                }

                LaunchedEffect(uiState.dashboard?.profile?.id) {
                    val profile = uiState.dashboard?.profile ?: return@LaunchedEffect
                    if (profile.historyAnswers.count { it.isNotBlank() } < 4) utilityPage = UtilityPage.Questionnaire
                }
                LaunchedEffect(Unit) { mainViewModel.checkHealthConnect() }

                LaunchedEffect(uiState.transientMessage) {
                    uiState.transientMessage?.let {
                        Toast.makeText(this@MainActivity, it, Toast.LENGTH_LONG).show()
                        mainViewModel.consumeTransientMessage()
                    }
                }

                if (uiState.auth !is AuthState.SignedIn) {
                    AuthGateScreen(
                        authState = uiState.auth,
                        busy = uiState.authBusy || googleCredentialBusy,
                        googleBusy = googleCredentialBusy,
                        message = uiState.authMessage,
                        onSignIn = mainViewModel::signIn,
                        onSignUp = mainViewModel::signUp,
                        onGoogleSignIn = {
                            if (!googleCredentialBusy && !uiState.authBusy) scope.launch {
                                googleCredentialBusy = true
                                runCatching { googleSignIn.requestCredential() }
                                    .onSuccess { credential ->
                                        mainViewModel.signInWithGoogle(credential.idToken, credential.rawNonce)
                                    }
                                    .onFailure { error ->
                                        mainViewModel.reportAuthError(error.message ?: "Google ile giriş yapılamadı.")
                                    }
                                googleCredentialBusy = false
                            }
                        },
                    )
                } else if (uiState.accountFrozen) {
                    FrozenAccountScreen(
                        busy = uiState.accountBusy,
                        onReactivate = mainViewModel::reactivateAccount,
                        onSignOut = {
                            scope.launch { googleSignIn.clearCredentialState() }
                            mainViewModel.signOut()
                        },
                    )
                } else if (activeWorkout) {
                    ActiveWorkoutScreen(
                        onBack = { activeWorkout = false },
                        exercises = uiState.dashboard?.workouts.orEmpty(),
                        previousPerformance = uiState.previousPerformance,
                        saving = uiState.workoutSaving,
                        language = preferences.language,
                        onFinish = { seconds, calories, sets, feedback -> mainViewModel.completeDetailedWorkout(seconds, calories, sets, feedback); activeWorkout = false },
                    )
                } else if (utilityPage != UtilityPage.Main && uiState.dashboard != null) {
                    BackHandler { utilityPage = if (utilityPage == UtilityPage.Notifications) UtilityPage.Profile else UtilityPage.Main }
                    val dashboard = requireNotNull(uiState.dashboard)
                    val signedIn = uiState.auth as AuthState.SignedIn
                    when (utilityPage) {
                        UtilityPage.Profile -> ProfileSettingsScreen(
                            profile = dashboard.profile,
                            email = signedIn.session.user.email,
                            preferences = preferences,
                            saving = uiState.profileSaving,
                            avatarUploading = uiState.avatarUploading,
                            accountBusy = uiState.accountBusy,
                            healthConnected = uiState.healthConnected,
                            healthBusy = uiState.healthBusy,
                            onBack = { utilityPage = UtilityPage.Main },
                            onPreferencesChange = ::updatePreferences,
                            onOpenQuestionnaire = { utilityPage = UtilityPage.Questionnaire },
                            onOpenNotifications = { utilityPage = UtilityPage.Notifications },
                            onAddShortcut = { type -> if (!HedefitShortcuts.request(this@MainActivity, type)) Toast.makeText(this@MainActivity, "Bu başlatıcı sabit kısayolu desteklemiyor.", Toast.LENGTH_LONG).show() },
                            onConnectHealth = {
                                if (uiState.healthConnected) mainViewModel.syncHealthConnect()
                                else healthPermissionLauncher.launch(healthConnectManager.permissions)
                            },
                            onSave = { mainViewModel.saveProfile(it) },
                            onUploadAvatar = mainViewModel::uploadAvatar,
                            onResetProgress = mainViewModel::resetProgress,
                            onFreeze = mainViewModel::freezeAccount,
                            onDelete = mainViewModel::deleteAccount,
                            onSignOut = {
                                scope.launch { googleSignIn.clearCredentialState() }
                                utilityPage = UtilityPage.Main
                                mainViewModel.signOut()
                            },
                        )
                        UtilityPage.Questionnaire -> ProfileQuestionnaireScreen(
                            profile = dashboard.profile,
                            saving = uiState.profileSaving,
                            onClose = { utilityPage = UtilityPage.Main },
                            onSave = { update -> mainViewModel.saveProfile(update, regeneratePlan = true) { utilityPage = UtilityPage.Main } },
                        )
                        UtilityPage.Notifications -> NotificationCalendarScreen(
                            preferences = preferences,
                            onBack = { utilityPage = UtilityPage.Profile },
                            onChange = ::updatePreferences,
                            onRequestPermission = { if (Build.VERSION.SDK_INT >= 33) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS) },
                        )
                        UtilityPage.Calendar -> WorkoutCalendarScreen(
                            schedule = dashboard.schedule,
                            onBack = { utilityPage = UtilityPage.Main },
                            onSchedule = mainViewModel::scheduleWorkout,
                        )
                        UtilityPage.ExerciseLibrary -> ExerciseLibraryScreen(
                            items = uiState.exerciseLibrary,
                            loading = uiState.exerciseLibraryBusy,
                            language = preferences.language,
                            onBack = { utilityPage = UtilityPage.Main },
                            onSearch = { search, muscle, equipment, level, environment, muscleRole, force, mechanic, category -> mainViewModel.loadExerciseLibrary(search, muscle, equipment, level, environment, muscleRole, force, mechanic, category, preferences.language) },
                            onUse = mainViewModel::useExerciseFromLibrary,
                        )
                        UtilityPage.Route -> RouteScreen(
                            onBack = { utilityPage = UtilityPage.Main },
                            onCompleted = mainViewModel::saveRoute,
                            language = preferences.language,
                            unitSystem = preferences.unitSystem,
                        )
                        UtilityPage.GoalJourney -> GoalJourneyScreen(
                            dashboard,
                            onBack = { utilityPage = UtilityPage.Main },
                            onSetCurrentWeight = { currentWeight ->
                                val latest = dashboard.measurements.lastOrNull()
                                mainViewModel.saveBodyMeasurement(
                                    com.hedefit.app.data.model.BodyMeasurementData(
                                        date = java.time.LocalDate.now().toString(),
                                        weightKg = currentWeight,
                                        waistCm = latest?.waistCm,
                                        hipsCm = latest?.hipsCm,
                                        chestCm = latest?.chestCm,
                                        armCm = latest?.armCm,
                                        thighCm = latest?.thighCm,
                                    ),
                                )
                            },
                            onCreateRegionalProgram = { muscle, label ->
                                mainViewModel.generateRegionalPlan(muscle, label, preferences.language)
                                utilityPage = UtilityPage.Main
                                selected = AppDestination.Workout
                            },
                            onSetGoalWeight = { targetWeight ->
                                val profile = dashboard.profile
                                mainViewModel.saveProfile(
                                    com.hedefit.app.data.model.ProfileUpdateData(
                                        displayName = profile.displayName,
                                        age = profile.age,
                                        gender = profile.gender,
                                        heightCm = profile.heightCm,
                                        weightKg = profile.weightKg,
                                        goalType = profile.goal.substringBefore(" | "),
                                        targetWeightKg = targetWeight,
                                        targetWeeks = profile.targetWeeks,
                                        environment = profile.environment,
                                        equipment = profile.equipment,
                                        historyAnswers = profile.historyAnswers,
                                    ),
                                )
                            },
                            language = preferences.language,
                            unitSystem = preferences.unitSystem,
                        )
                        UtilityPage.Main -> Unit
                    }
                } else {
                    val coachDisplayName = preferences.coachName.ifBlank { if (preferences.language == "en") "Fit Coach" else "Fit Koç" }
                    HedefitAppFrame(selected = selected, onSelect = { selected = it }, language = preferences.language, coachName = coachDisplayName) { padding, expanded ->
                        when (selected) {
                            AppDestination.Home -> HomeScreen(padding, expanded, uiState.dashboard, uiState.dataLoading, uiState.dataError, onRetry = mainViewModel::refreshAll, onSignOut = {
                                scope.launch { googleSignIn.clearCredentialState() }
                                mainViewModel.signOut()
                            }, onStartWorkout = {
                                if (uiState.dashboard?.workouts.isNullOrEmpty()) selected = AppDestination.Workout else { mainViewModel.loadPreviousPerformance(); activeWorkout = true }
                            }, onOpenProfile = { utilityPage = UtilityPage.Profile }, onOpenNotifications = { utilityPage = UtilityPage.Notifications }, onOpenRoute = { utilityPage = UtilityPage.Route },
                                onOpenGoal = { utilityPage = UtilityPage.GoalJourney },
                                onOpenProgram = { programId ->
                                    programId?.let { id -> uiState.dashboard?.workoutPrograms?.firstOrNull { it.id == id }?.let(mainViewModel::activateProgram) }
                                    selected = AppDestination.Workout
                                },
                                unitSystem = preferences.unitSystem,
                                stepGoal = preferences.stepGoal,
                                onStepGoalChange = { updatePreferences(preferences.copy(stepGoal = it)) }, onAddWater = mainViewModel::addWater,
                                language = preferences.language)
                            AppDestination.Workout -> WorkoutPlanScreen(padding, expanded, uiState.dashboard?.workouts.orEmpty(), uiState.dashboard?.workoutPrograms.orEmpty(), uiState.exerciseLibrary, uiState.exerciseLibraryBusy, uiState.dataLoading, uiState.planGenerating, mainViewModel::generatePlan, onStartWorkout = {
                                if (!uiState.dashboard?.workouts.isNullOrEmpty()) { mainViewModel.loadPreviousPerformance(); activeWorkout = true }
                            }, onOpenCalendar = { utilityPage = UtilityPage.Calendar }, onOpenLibrary = { mainViewModel.loadExerciseLibrary(locale = preferences.language); utilityPage = UtilityPage.ExerciseLibrary },
                                onGenerateRegional = { muscle, label -> mainViewModel.generateRegionalPlan(muscle, label, preferences.language) },
                                onLoadRegional = { muscle -> mainViewModel.loadExerciseLibrary(muscle = muscle, muscleRole = "primary", category = "strength", locale = preferences.language) },
                                onCreateOwnPlan = { name -> mainViewModel.createCustomProgram(name, preferences.language) { mainViewModel.loadExerciseLibrary(locale = preferences.language); utilityPage = UtilityPage.ExerciseLibrary } },
                                onSelectProgram = mainViewModel::activateProgram,
                                onRemoveProgram = mainViewModel::deleteProgram,
                                onUpdateExercise = mainViewModel::updateWorkoutExercise,
                                onRemoveExercise = mainViewModel::removeWorkoutExercise,
                                onMoveExercise = mainViewModel::moveWorkoutExercise,
                                language = preferences.language)
                            AppDestination.Nutrition -> NutritionScreen(
                                padding, expanded, uiState.dashboard, uiState.nutritionBusy, uiState.foodSearchBusy, uiState.foodSearchResults,
                                mainViewModel::addNutritionWithAi, mainViewModel::searchFoods, mainViewModel::addCatalogFood,
                                mainViewModel::addFavorite, mainViewModel::removeFavorite, mainViewModel::repeatFavorite, mainViewModel::addWater, preferences.language,
                                selectedDate = uiState.nutritionViewingDate,
                                selectedLogs = uiState.nutritionViewingLogs,
                                historyLogs = uiState.nutritionHistory,
                                dateLoading = uiState.nutritionDateLoading,
                                onSelectDate = mainViewModel::loadNutritionDate,
                                onLoadHistory = mainViewModel::loadNutritionHistory,
                            )
                            AppDestination.Progress -> ProgressScreen(
                                padding, expanded, uiState.dashboard, preferences.language,
                                unitSystem = preferences.unitSystem,
                                weeklyWorkoutGoal = preferences.weeklyWorkoutGoal,
                                onWeeklyWorkoutGoalChange = { updatePreferences(preferences.copy(weeklyWorkoutGoal = it)) },
                                measurementSaving = uiState.measurementSaving,
                                onSaveMeasurement = mainViewModel::saveBodyMeasurement,
                            )
                            AppDestination.Coach -> CoachScreen(
                                padding, expanded, uiState.chatMessages, uiState.chatBusy,
                                { message -> mainViewModel.sendChat(message, preferences.language, preferences.localCoachEnabled && uiState.localCoach?.ready == true) },
                                uiState.dashboard,
                                onOpenPlan = { selected = AppDestination.Workout },
                                language = preferences.language,
                                coachName = coachDisplayName,
                                onCoachNameChange = { updatePreferences(preferences.copy(coachName = it)) },
                                localCoach = uiState.localCoach,
                                localCoachEnabled = preferences.localCoachEnabled,
                                onLocalCoachEnabledChange = { enabled -> updatePreferences(preferences.copy(localCoachEnabled = enabled)) },
                                onPrepareLocalCoach = { mainViewModel.prepareLocalCoach(preferences.language) },
                                onRemoveLocalCoach = {
                                    updatePreferences(preferences.copy(localCoachEnabled = false))
                                    mainViewModel.removeLocalCoach()
                                },
                            )
                        }
                    }
                }
            }
        }
    }

}
