package com.hedefit.app

import android.os.Bundle
import android.Manifest
import android.os.Build
import android.content.pm.PackageManager
import androidx.activity.OnBackPressedDispatcher
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
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
import com.hedefit.app.ui.screens.GameScreen
import com.hedefit.app.ui.screens.AppUserGuideScreen
import com.hedefit.app.ui.screens.ManualActivityScreen
import com.hedefit.app.ui.screens.WelcomeGuideDialog
import com.hedefit.app.shortcuts.HedefitShortcuts
import com.hedefit.app.ui.theme.HedefitTheme
import com.hedefit.app.ui.state.MainViewModel
import com.hedefit.app.data.auth.AuthState
import com.hedefit.app.data.auth.GoogleSignInManager
import android.widget.Toast
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import com.hedefit.app.ui.settings.AppPreferencesStore
import com.hedefit.app.notifications.NotificationScheduler
import com.hedefit.app.notifications.StepCounterNotification
import com.hedefit.app.widgets.HedefitWidgetData
import com.hedefit.app.route.RouteTrackingStore
import com.hedefit.app.health.HealthConnectManager
import com.hedefit.app.steps.StepSource
import com.hedefit.app.ads.AdMobManager

private enum class UtilityPage { Main, Profile, Questionnaire, Notifications, Calendar, ExerciseLibrary, Route, GoalJourney, UserGuide, ManualActivity }

/** Programdaki Türkçe bölge adını atlasın birincil kas filtresine çevirir. */
private fun replacementMuscle(area: String): String {
    val value = area.lowercase(java.util.Locale("tr", "TR"))
    return when {
        "göğ" in value || "chest" in value -> "chest"
        "arka kol" in value || "triceps" in value -> "triceps"
        "ön kol" in value || "bilek" in value || "forearm" in value -> "forearms"
        "biceps" in value || "pazu" in value || "kol" in value -> "biceps"
        "kanat" in value || "lat" in value -> "lats"
        "trapez" in value || "trap" in value -> "traps"
        "boyun" in value || "neck" in value -> "neck"
        "omuz" in value || "shoulder" in value -> "shoulders"
        "karın" in value || "core" in value || "ab" in value -> "abdominals"
        "dış kalça" in value || "abductor" in value -> "abductors"
        "iç bacak" in value || "adductor" in value -> "adductors"
        "kalça" in value || "glute" in value -> "glutes"
        "baldır" in value || "calf" in value -> "calves"
        "arka bacak" in value || "hamstring" in value -> "hamstrings"
        "ön bacak" in value || "quad" in value -> "quadriceps"
        "bel" in value || "lower back" in value -> "lower back"
        "sırt" in value || "back" in value -> "middle back"
        else -> area
    }
}

class MainActivity : ComponentActivity() {
    private val mainViewModel: MainViewModel by viewModels()

    override fun onResume() {
        super.onResume()
        mainViewModel.syncHealthIfConnected()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val preferencesStore = remember { AppPreferencesStore(this@MainActivity) }
            val notificationScheduler = remember { NotificationScheduler(this@MainActivity) }
            val stepCounterNotification = remember { StepCounterNotification }
            val healthConnectManager = remember { HealthConnectManager(this@MainActivity) }
            val adMobManager = remember { AdMobManager(this@MainActivity) }
            var preferences by remember { mutableStateOf(preferencesStore.read()) }
            var adsAllowed by remember { mutableStateOf(false) }

            fun updatePreferences(next: com.hedefit.app.ui.settings.AppPreferences) {
                preferences = next
                preferencesStore.write(next)
                notificationScheduler.apply(next)
            }

            val notificationPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
                updatePreferences(preferences.copy(notificationsEnabled = granted))
                if (!granted) Toast.makeText(
                    this@MainActivity,
                    if (preferences.language == "en") "Notification permission was not granted. Reminders remain off." else "Bildirim izni verilmedi. Hatırlatmalar kapalı kaldı.",
                    Toast.LENGTH_LONG,
                ).show()
            }
            val healthPermissionLauncher = rememberLauncherForActivityResult(healthConnectManager.permissionContract()) { granted ->
                if (granted.contains(healthConnectManager.stepPermission)) mainViewModel.syncHealthConnect()
                else Toast.makeText(this@MainActivity, "Health Connect adım izni verilmedi.", Toast.LENGTH_LONG).show()
                mainViewModel.checkHealthConnect()
            }
            val activityRecognitionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
                mainViewModel.onActivityRecognitionPermissionChanged()
            }
            HedefitTheme(darkTheme = preferences.darkTheme, accentHue = preferences.accentHue) {
                val uiState by mainViewModel.state.collectAsState()
                var selected by rememberSaveable { mutableStateOf(when { intent?.getBooleanExtra("open_workout", false) == true -> AppDestination.Workout; intent?.getBooleanExtra("open_nutrition", false) == true -> AppDestination.Nutrition; else -> AppDestination.Home }) }
                var activeWorkout by rememberSaveable { mutableStateOf(false) }
                var activeWorkoutExercises by remember { mutableStateOf<List<com.hedefit.app.data.model.WorkoutExerciseData>?>(null) }
                var utilityPage by rememberSaveable { mutableStateOf(when { intent?.getBooleanExtra("open_route", false) == true -> UtilityPage.Route; intent?.getBooleanExtra("open_activity", false) == true -> UtilityPage.ManualActivity; else -> UtilityPage.Main }) }
                var googleCredentialBusy by remember { mutableStateOf(false) }
                var showWelcomeGuide by remember { mutableStateOf(!preferences.welcomeGuideSeen) }
                var healthAutoSynced by rememberSaveable { mutableStateOf(false) }
                var activityRecognitionAsked by remember { mutableStateOf(this@MainActivity.getSharedPreferences("hedefit-step-permission", android.content.Context.MODE_PRIVATE).getBoolean("activity_recognition_asked", false)) }
                val scope = rememberCoroutineScope()
                val googleSignIn = remember { GoogleSignInManager(this@MainActivity) }
                val lifecycleOwner = LocalLifecycleOwner.current

                LaunchedEffect(uiState.dashboard?.profile?.id) {
                    val profile = uiState.dashboard?.profile ?: return@LaunchedEffect
                    // İlk program yalnız hızlı başlangıç cevaplarıyla değil, 15 soruluk
                    // profil değerlendirmesiyle hazırlanır. Böylece Atlas seçimleri
                    // ekipman, sakatlık, süre ve hedefin tamamına dayanır.
                    if (profile.historyAnswers.count { it.isNotBlank() } < 15) utilityPage = UtilityPage.Questionnaire
                }
                LaunchedEffect(Unit) { mainViewModel.checkHealthConnect() }
                LaunchedEffect(lifecycleOwner, uiState.dashboard?.profile?.id) {
                    lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                        while (isActive) {
                            mainViewModel.refreshSteps()
                            delay(60_000L)
                        }
                    }
                }
                LaunchedEffect(uiState.healthConnected, uiState.stepSource) {
                    if (!uiState.healthConnected && uiState.stepSource == StepSource.UNAVAILABLE && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !activityRecognitionAsked) {
                        activityRecognitionAsked = true
                        this@MainActivity.getSharedPreferences("hedefit-step-permission", android.content.Context.MODE_PRIVATE).edit().putBoolean("activity_recognition_asked", true).apply()
                        activityRecognitionLauncher.launch(Manifest.permission.ACTIVITY_RECOGNITION)
                    }
                }
                LaunchedEffect(uiState.healthConnected, uiState.dashboard?.profile?.id) {
                    if (uiState.healthConnected && uiState.dashboard != null && !healthAutoSynced) {
                        healthAutoSynced = true
                        mainViewModel.syncHealthConnect()
                    }
                }
                LaunchedEffect(uiState.dashboard?.steps, uiState.dashboard?.activeCalories, preferences.stepCounterNotificationEnabled, preferences.stepGoal) {
                    if (preferences.stepCounterNotificationEnabled) stepCounterNotification.show(this@MainActivity, uiState.dashboard?.steps ?: 0, preferences.stepGoal, uiState.dashboard?.activeCalories ?: 0)
                    else stepCounterNotification.cancel(this@MainActivity)
                }
                LaunchedEffect(uiState.dashboard, preferences.stepGoal) {
                    HedefitWidgetData.write(this@MainActivity, uiState.dashboard, RouteTrackingStore(this@MainActivity).readSummary(), preferences.stepGoal)
                }
                LaunchedEffect(uiState.dashboard?.profile?.id, preferences.stepGoal, preferences.waterGoalMl, preferences.weeklyWorkoutGoal) {
                    if (uiState.dashboard != null) mainViewModel.syncGamificationPreferences(
                        preferences.stepGoal,
                        preferences.waterGoalMl,
                        preferences.weeklyWorkoutGoal,
                        java.time.ZoneId.systemDefault().id,
                    )
                }
                LaunchedEffect(activeWorkout) { HedefitWidgetData.writeWorkoutState(this@MainActivity, activeWorkout) }
                LaunchedEffect(preferences.stepCounterNotificationEnabled) {
                    if (preferences.stepCounterNotificationEnabled && Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
                LaunchedEffect(Unit) { adMobManager.requestConsent { allowed -> adsAllowed = allowed } }

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
                        onClearMessage = mainViewModel::clearAuthMessage,
                        onGoogleSignIn = { legalAcceptance ->
                            if (!googleCredentialBusy && !uiState.authBusy) scope.launch {
                                googleCredentialBusy = true
                                runCatching { googleSignIn.requestCredential() }
                                    .onSuccess { credential ->
                                        mainViewModel.signInWithGoogle(credential.idToken, credential.rawNonce, legalAcceptance)
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
                        language = preferences.language,
                        onReactivate = mainViewModel::reactivateAccount,
                        onSignOut = {
                            scope.launch { googleSignIn.clearCredentialState() }
                            mainViewModel.signOut()
                        },
                    )
                } else if (activeWorkout) {
                    ActiveWorkoutScreen(
                        onBack = { activeWorkout = false; activeWorkoutExercises = null },
                        exercises = activeWorkoutExercises ?: uiState.dashboard?.workouts.orEmpty(),
                        previousPerformance = uiState.previousPerformance,
                        saving = uiState.workoutSaving,
                        language = preferences.language,
                        onFinish = { seconds, calories, sets, feedback ->
                            mainViewModel.completeDetailedWorkout(seconds, calories, sets, feedback, activeWorkoutExercises)
                            activeWorkout = false
                            activeWorkoutExercises = null
                            adMobManager.showAtNaturalTransition(uiState.dashboard?.profile?.isPremium != true)
                        },
                    )
                } else if (utilityPage != UtilityPage.Main && uiState.dashboard != null) {
                    BackHandler { utilityPage = if (utilityPage == UtilityPage.Notifications || utilityPage == UtilityPage.UserGuide) UtilityPage.Profile else UtilityPage.Main }
                    val dashboard = requireNotNull(uiState.dashboard)
                    val signedIn = uiState.auth as AuthState.SignedIn
                    when (utilityPage) {
                        UtilityPage.Profile -> ProfileSettingsScreen(
                            profile = dashboard.profile,
                            email = signedIn.session.user.email,
                            preferences = preferences,
                            saving = uiState.profileSaving,
                            avatarUploading = uiState.avatarUploading,
                            avatarPreview = uiState.avatarPreview,
                            accountBusy = uiState.accountBusy,
                            healthConnected = uiState.healthConnected,
                            healthBusy = uiState.healthBusy,
                            onBack = { utilityPage = UtilityPage.Main },
                            onPreferencesChange = ::updatePreferences,
                            onOpenQuestionnaire = { utilityPage = UtilityPage.Questionnaire },
                            onOpenNotifications = { utilityPage = UtilityPage.Notifications },
                            onOpenUserGuide = { utilityPage = UtilityPage.UserGuide },
                            onAddShortcut = { type ->
                                val accepted = if (type.startsWith("widget_")) HedefitShortcuts.requestWidget(this@MainActivity, type) else HedefitShortcuts.request(this@MainActivity, type)
                                if (!accepted) Toast.makeText(this@MainActivity, "Bu başlatıcı ana ekrana eklemeyi desteklemiyor.", Toast.LENGTH_LONG).show()
                            },
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
                            quickStart = false,
                            onClose = { utilityPage = UtilityPage.Main },
                            onSave = { update -> mainViewModel.saveProfile(update, regeneratePlan = true) { utilityPage = UtilityPage.Main } },
                        )
                        UtilityPage.Notifications -> NotificationCalendarScreen(
                            preferences = preferences,
                            onBack = { utilityPage = UtilityPage.Profile },
                            onChange = ::updatePreferences,
                            onNotificationsEnabledChange = { enabled ->
                                val permissionGranted = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                                when {
                                    !enabled || permissionGranted -> updatePreferences(preferences.copy(notificationsEnabled = enabled))
                                    else -> notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                }
                            },
                        )
                        UtilityPage.Calendar -> WorkoutCalendarScreen(
                            schedule = dashboard.schedule,
                            onBack = { utilityPage = UtilityPage.Main },
                            onSchedule = mainViewModel::scheduleWorkout,
                            language = preferences.language,
                        )
                        UtilityPage.ExerciseLibrary -> ExerciseLibraryScreen(
                            items = uiState.exerciseLibrary,
                            loading = uiState.exerciseLibraryBusy,
                            language = preferences.language,
                            onBack = { utilityPage = UtilityPage.Main },
                            onSearch = { search, muscle, equipment, level, environment, muscleRole, force, mechanic, category -> mainViewModel.loadExerciseLibrary(search, muscle, equipment, level, environment, muscleRole, force, mechanic, category, preferences.language) },
                            onUse = mainViewModel::useExerciseFromLibrary,
                            onStart = { item ->
                                val exercise = com.hedefit.app.data.model.WorkoutExerciseData(item.id, item.name, item.primaryMuscles.firstOrNull() ?: "Tüm Vücut", 3, "8–12", 75)
                                activeWorkoutExercises = listOf(exercise)
                                mainViewModel.loadPreviousPerformance(listOf(exercise))
                                activeWorkout = true
                            },
                        )
                        UtilityPage.Route -> RouteScreen(
                            onBack = { utilityPage = UtilityPage.Main },
                            onCompleted = { snapshot, activityType, title ->
                                mainViewModel.saveRoute(snapshot, activityType, title)
                                adMobManager.showAtNaturalTransition(uiState.dashboard?.profile?.isPremium != true)
                            },
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
                        UtilityPage.UserGuide -> AppUserGuideScreen(
                            language = preferences.language,
                            onBack = { utilityPage = UtilityPage.Profile },
                        )
                        UtilityPage.ManualActivity -> ManualActivityScreen(
                            language = preferences.language,
                            weightKg = dashboard.profile.weightKg,
                            saving = uiState.workoutSaving,
                            onBack = { utilityPage = UtilityPage.Main },
                            onSave = { input -> mainViewModel.recordManualActivity(input, preferences.language) { utilityPage = UtilityPage.Main } },
                        )
                        UtilityPage.Main -> Unit
                    }
                } else {
                    val coachDisplayName = preferences.coachName.ifBlank { if (preferences.language == "en") "Fit Coach" else "Fit Koç" }
                    HedefitAppFrame(selected = selected, onSelect = { selected = it }, language = preferences.language, coachName = coachDisplayName) { padding, expanded ->
                        when (selected) {
                            AppDestination.Home -> HomeScreen(padding, expanded, uiState.dashboard, uiState.avatarPreview, uiState.dataLoading, uiState.dataError, onRetry = mainViewModel::refreshAll, onSignOut = {
                                scope.launch { googleSignIn.clearCredentialState() }
                                mainViewModel.signOut()
                            }, onOpenProfile = { utilityPage = UtilityPage.Profile }, onOpenNotifications = { utilityPage = UtilityPage.Notifications }, onOpenCalendar = { utilityPage = UtilityPage.Calendar }, onOpenRoute = { utilityPage = UtilityPage.Route },
                                onOpenGoal = { utilityPage = UtilityPage.GoalJourney },
                                onOpenActivity = { utilityPage = UtilityPage.ManualActivity },
                                onOpenProgram = { programId ->
                                    programId?.let { id -> uiState.dashboard?.workoutPrograms?.firstOrNull { it.id == id }?.let(mainViewModel::activateProgram) }
                                    selected = AppDestination.Workout
                                },
                                onProgramHomeVisibilityChange = mainViewModel::setProgramHomeVisibility,
                                unitSystem = preferences.unitSystem,
                                stepGoal = preferences.stepGoal,
                                onStepGoalChange = { updatePreferences(preferences.copy(stepGoal = it)) },
                                waterGoalMl = preferences.waterGoalMl,
                                onWaterGoalChange = { updatePreferences(preferences.copy(waterGoalMl = it)) },
                                onAddWater = mainViewModel::addWater,
                                language = preferences.language,
                                stepSource = uiState.stepSource,
                                showAds = adsAllowed && uiState.dashboard?.profile?.isPremium != true)
                            AppDestination.Workout -> WorkoutPlanScreen(padding, expanded, uiState.dashboard?.workouts.orEmpty(), uiState.dashboard?.workoutPrograms.orEmpty(), uiState.exerciseLibrary, uiState.exerciseLibraryBusy, uiState.dataLoading, uiState.planGenerating, mainViewModel::generatePlan, onStartWorkout = {
                                if (!uiState.dashboard?.workouts.isNullOrEmpty()) { activeWorkoutExercises = null; mainViewModel.loadPreviousPerformance(); activeWorkout = true }
                            }, onOpenLibrary = { mainViewModel.loadExerciseLibrary(locale = preferences.language); utilityPage = UtilityPage.ExerciseLibrary },
                                onOpenActivityLog = { utilityPage = UtilityPage.ManualActivity },
                                onGenerateRegional = { muscle, label -> mainViewModel.generateRegionalPlan(muscle, label, preferences.language) },
                                onLoadRegional = { muscle -> mainViewModel.loadExerciseLibrary(muscle = muscle, muscleRole = "primary", category = "strength", locale = preferences.language) },
                                onCreateOwnPlan = { name -> mainViewModel.createCustomProgram(name, preferences.language) { mainViewModel.loadExerciseLibrary(locale = preferences.language); utilityPage = UtilityPage.ExerciseLibrary } },
                                onAddPushPullTemplate = { key -> mainViewModel.addPushPullTemplate(key, preferences.language) },
                                onSelectProgram = mainViewModel::activateProgram,
                                onRemoveProgram = mainViewModel::deleteProgram,
                                onUpdateExercise = mainViewModel::updateWorkoutExercise,
                                onReplaceExercise = mainViewModel::replaceWorkoutExercise,
                                onRemoveExercise = mainViewModel::removeWorkoutExercise,
                                onMoveExercise = mainViewModel::moveWorkoutExercise,
                                onLoadReplacementOptions = { exercise -> mainViewModel.loadExerciseLibrary(muscle = replacementMuscle(exercise.area), muscleRole = "primary", category = "strength", locale = preferences.language) },
                                language = preferences.language)
                            AppDestination.Nutrition -> NutritionScreen(
                                padding, expanded, uiState.dashboard, uiState.nutritionBusy, uiState.foodSearchBusy, uiState.foodSearchResults, uiState.foodSearchQuery,
                                mainViewModel::addNutritionWithAi, { query -> mainViewModel.searchFoods(query, preferences.language) }, mainViewModel::addCatalogFood,
                                mainViewModel::addFavorite, mainViewModel::removeNutritionLog, mainViewModel::updateNutritionLog, mainViewModel::removeFavorite, mainViewModel::repeatFavorite, mainViewModel::addWater,
                                waterGoalMl = preferences.waterGoalMl,
                                onWaterGoalChange = { updatePreferences(preferences.copy(waterGoalMl = it)) },
                                language = preferences.language,
                                selectedDate = uiState.nutritionViewingDate,
                                selectedLogs = uiState.nutritionViewingLogs,
                                historyLogs = uiState.nutritionHistory,
                                dateLoading = uiState.nutritionDateLoading,
                                onSelectDate = mainViewModel::loadNutritionDate,
                                onLoadHistory = mainViewModel::loadNutritionHistory,
                                onAddMealPlanItem = mainViewModel::addMealPlanItem,
                                onToggleMealPlanItem = mainViewModel::toggleMealPlanItem,
                                onRemoveMealPlanItem = mainViewModel::removeMealPlanItem,
                                photoBusy = uiState.photoNutritionBusy,
                                photoResults = uiState.photoNutritionResults,
                                onAnalyzePhoto = mainViewModel::analyzeNutritionPhoto,
                                onClearPhotoResults = mainViewModel::clearPhotoNutritionResults,
                                onSavePhotoResults = mainViewModel::savePhotoNutrition,
                            )
                            AppDestination.Game -> GameScreen(
                                padding = padding,
                                data = uiState.dashboard,
                                stepGoal = preferences.stepGoal,
                                waterGoalMl = preferences.waterGoalMl,
                                weeklyActivityGoal = preferences.weeklyWorkoutGoal,
                                language = preferences.language,
                            )
                            AppDestination.Progress -> ProgressScreen(
                                padding, expanded, uiState.dashboard, preferences.language,
                                unitSystem = preferences.unitSystem,
                                weeklyWorkoutGoal = preferences.weeklyWorkoutGoal,
                                onWeeklyWorkoutGoalChange = { updatePreferences(preferences.copy(weeklyWorkoutGoal = it)) },
                                measurementSaving = uiState.measurementSaving,
                                onSaveMeasurement = mainViewModel::saveBodyMeasurement,
                                onDeleteRoute = mainViewModel::deleteRoute,
                            )
                            AppDestination.Coach -> CoachScreen(
                                padding, expanded, uiState.chatMessages, uiState.chatBusy,
                                { message -> mainViewModel.sendChat(message, preferences.language) },
                                uiState.dashboard,
                                onOpenPlan = { selected = AppDestination.Workout },
                                language = preferences.language,
                                coachName = coachDisplayName,
                                onCoachNameChange = { updatePreferences(preferences.copy(coachName = it)) },
                                onClearChat = mainViewModel::clearChat,
                                usageUsed = uiState.chatUsageUsed,
                                usageLimit = uiState.chatUsageLimit,
                            )
                        }
                    }
                }
                if (showWelcomeGuide && uiState.auth is AuthState.SignedIn && uiState.dashboard != null) WelcomeGuideDialog(
                    language = preferences.language,
                    onConnectHealth = {
                        if (uiState.healthConnected) mainViewModel.syncHealthConnect()
                        else healthPermissionLauncher.launch(healthConnectManager.permissions)
                    },
                    onDismiss = {
                        showWelcomeGuide = false
                        updatePreferences(preferences.copy(welcomeGuideSeen = true))
                    },
                )
            }
        }
    }

}
