import Foundation
import CoreLocation

enum AppTab: String, CaseIterable, Identifiable {
    case home, workout, nutrition, coach, progress
    var id: Self { self }
    var title: String { switch self { case .home: "Ana Sayfa"; case .workout: "Antrenman"; case .nutrition: "Beslenme"; case .coach: "Koç"; case .progress: "İlerleme" } }
    var icon: String { switch self { case .home: "house.fill"; case .workout: "dumbbell.fill"; case .nutrition: "fork.knife"; case .coach: "bubble.left.and.bubble.right.fill"; case .progress: "chart.line.uptrend.xyaxis" } }
}

struct AppSettings: Codable {
    var darkMode = true; var language = "tr"; var accentHue = 132.0
    var notifications = false; var workoutReminder = true; var waterReminder = true
    var stepGoal = 10_000; var waterGoal = 2_500; var weeklyWorkoutGoal = 3
    var weightUnit = "kg"; var distanceUnit = "km"; var welcomeSeen = false
}

struct UserSession: Codable { let accessToken, refreshToken, userID, email: String; let expiresAt: Date }

struct Profile: Codable, Identifiable {
    var id = ""; var displayName = "Sporcu"; var weightKg: Double?; var heightCm: Double?
    var goal = "Formda kal"; var isPremium = false; var age: Int?; var gender = ""
    var environment = "Evde"; var equipment = ""; var historyAnswers: [String] = []
    var targetWeightKg: Double?; var targetWeeks: Int?; var accountStatus = "active"; var avatarURL: String?
}

struct WorkoutExercise: Codable, Identifiable, Hashable {
    var id: String; var name: String; var area: String; var sets: Int; var reps: String; var restSeconds: Int
}
struct WorkoutProgram: Codable, Identifiable { var id, name, source, focusArea: String; var exercises: [WorkoutExercise]; var isActive, showOnHome: Bool }
struct WorkoutSession: Codable, Identifiable {
    var id, completedAt: String; var durationSeconds, calories, completedExercises, totalExercises: Int
    var fatigue: Int?; var exerciseNames: [String] = []; var difficulty: String?; var painAreas: [String] = []; var manualActivityKey: String?
}
struct NutritionGoal: Codable { var calories = 2250; var protein = 110; var carbs = 297; var fat = 69 }
struct NutritionLog: Codable, Identifiable {
    var id, date, meal, name: String; var calories: Int; var protein, carbs, fat: Double; var grams: Double?
    var fiber = 0.0; var sugar = 0.0; var sodiumMg = 0.0; var potassiumMg = 0.0; var calciumMg = 0.0; var ironMg = 0.0; var vitaminCMg = 0.0
}
struct Food: Codable, Identifiable {
    var id, name: String; var brand: String?; var servingGrams: Double; var calories: Int; var protein, carbs, fat, fiber, sugar, sodiumMg, potassiumMg, calciumMg, ironMg, vitaminCMg: Double; var verified: Bool; var source: String
}
struct BodyMeasurement: Codable, Identifiable { var id: String { date }; var date: String; var weightKg, waistCm, hipsCm, chestCm, armCm, thighCm: Double? }
struct ScheduleItem: Codable, Identifiable { var id, date, time, status: String; var originalDate: String? }
struct RoutePoint: Codable, Identifiable { var id = UUID(); var latitude, longitude: Double; var recordedAt: Int64; var accuracyMeters: Double; var altitudeMeters: Double?; enum CodingKeys: String, CodingKey { case latitude, longitude, recordedAt, accuracyMeters, altitudeMeters } }
struct RouteActivity: Codable, Identifiable { var id, activityType, title, startedAt, endedAt: String; var durationSeconds, movingDurationSeconds: Int; var distanceMeters: Double; var averagePaceSecondsPerKm: Int?; var averageSpeedKmh: Double; var calories: Int; var status: String; var routePoints: [RoutePoint] }
struct DailyStep: Codable, Identifiable { var id: String { date }; var date: String; var steps: Int }
struct Achievement: Identifiable { let id, title, detail, icon: String; let target, progress, xp: Int }
struct ExerciseCatalogItem: Codable, Identifiable { var id, name, level, equipment: String; var primaryMuscles, instructions: [String]; var category: String; var imageUrls: [String]; var secondaryMuscles: [String] = []; var force = ""; var mechanic = "" }

struct Dashboard: Codable {
    var profile = Profile(); var workouts: [WorkoutExercise] = []; var sessions: [WorkoutSession] = []
    var nutritionLogs: [NutritionLog] = []; var nutritionGoal = NutritionGoal(); var steps = 0; var waterMl = 0
    var sleepMinutes = 0; var streakDays = 0; var measurements: [BodyMeasurement] = []; var activeCalories = 0
    var schedule: [ScheduleItem] = []; var workoutPrograms: [WorkoutProgram] = []; var routeActivities: [RouteActivity] = []
    var stepHistory: [DailyStep] = []; var gamificationTotalXp: Int?; var gamificationWeeklyXp: Int?; var unlockedAchievements: [String: String] = [:]
}

struct ChatMessage: Identifiable, Codable { var id = UUID(); let text: String; let fromUser: Bool; var pending = false }
struct WorkoutSet: Identifiable, Codable { var id = UUID(); let exerciseID, exerciseName: String; let exerciseOrder, setNumber: Int; var weightKg: Double?; var reps: Int?; var durationSeconds: Int?; var rpe: Int?; var setType = "normal"; var note = "" }
struct WorkoutFeedback: Codable { var difficulty = "Uygun"; var fatigue = 3; var painAreas = ["Yok"]; var note = "" }
struct ManualActivityType: Identifiable { let id, tr, en, icon: String; let met: Double }
let manualActivities = [
    ManualActivityType(id: "walking", tr: "Yürüyüş", en: "Walking", icon: "figure.walk", met: 3.5),
    .init(id: "running", tr: "Koşu", en: "Running", icon: "figure.run", met: 8), .init(id: "cycling", tr: "Bisiklet", en: "Cycling", icon: "bicycle", met: 6.8),
    .init(id: "swimming", tr: "Yüzme", en: "Swimming", icon: "figure.pool.swim", met: 7), .init(id: "football", tr: "Futbol", en: "Football", icon: "soccerball", met: 7),
    .init(id: "basketball", tr: "Basketbol", en: "Basketball", icon: "basketball", met: 6.5), .init(id: "yoga", tr: "Yoga", en: "Yoga", icon: "figure.mind.and.body", met: 2.5),
    .init(id: "pilates", tr: "Pilates", en: "Pilates", icon: "figure.core.training", met: 3), .init(id: "other", tr: "Diğer", en: "Other", icon: "figure.mixed.cardio", met: 5)
]
