import Foundation
import Security
import HealthKit
import CoreLocation
import UserNotifications
import BackgroundTasks
import WidgetKit
import Observation

enum AppError: LocalizedError {
    case configuration(String), server(String), invalidResponse
    var errorDescription: String? { switch self { case .configuration(let value), .server(let value): value; case .invalidResponse: "Sunucudan geçersiz yanıt alındı." } }
}

enum AppConfiguration {
    static func value(_ key: String, fallback: String = "") -> String {
        let value = Bundle.main.object(forInfoDictionaryKey: key) as? String ?? fallback
        return value.hasPrefix("$(") ? fallback : value
    }
    static var apiBase: String { value("HEDEFIT_API_BASE_URL", fallback: "https://hedefit.frknian.workers.dev") }
    static var supabaseURL: String { value("SUPABASE_URL") }
    static var anonKey: String { value("SUPABASE_ANON_KEY") }
}

actor KeychainSessionStore {
    static let shared = KeychainSessionStore()
    private let service = "com.hedefit.app.session", account = "current"
    func read() -> UserSession? {
        let query = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account, kSecReturnData: true] as CFDictionary
        var item: CFTypeRef?; guard SecItemCopyMatching(query, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(UserSession.self, from: data)
    }
    func write(_ session: UserSession) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        let key = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account] as CFDictionary
        SecItemDelete(key); var row = key as! [CFString: Any]; row[kSecValueData] = data; row[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly; SecItemAdd(row as CFDictionary, nil)
    }
    func clear() { let key = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account] as CFDictionary; SecItemDelete(key) }
}

actor NetworkClient {
    static let shared = NetworkClient()
    private var session: UserSession?
    private let decoder: JSONDecoder = { let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase; return d }()
    func setSession(_ value: UserSession?) { session = value }

    private func execute(_ url: URL, method: String = "GET", json: Any? = nil, auth: Bool = true, extra: [String: String] = [:]) async throws -> Data {
        var request = URLRequest(url: url); request.httpMethod = method; request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if auth, let session { request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization") }
        extra.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        if let json { request.httpBody = try JSONSerialization.data(withJSONObject: json) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AppError.invalidResponse }
        guard 200..<300 ~= http.statusCode else {
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let message = object?["message"] as? String ?? object?["error_description"] as? String ?? object?["error"] as? String ?? "İşlem tamamlanamadı (\(http.statusCode))."
            throw AppError.server(message)
        }
        return data
    }

    func signIn(email: String, password: String) async throws -> UserSession {
        try requireConfig(); let url = URL(string: "\(AppConfiguration.supabaseURL)/auth/v1/token?grant_type=password")!
        let data = try await execute(url, method: "POST", json: ["email": email.trimmingCharacters(in: .whitespaces), "password": password], auth: false, extra: ["apikey": AppConfiguration.anonKey])
        return try parseSession(data)
    }
    func signUp(email: String, password: String) async throws -> UserSession? {
        try requireConfig(); let url = URL(string: "\(AppConfiguration.supabaseURL)/auth/v1/signup")!
        let legal = ["kvkk_notice_version": "2026-08-25", "privacy_policy_version": "2026-08-25", "legal_accepted_at": ISO8601DateFormatter().string(from: Date())]
        let data = try await execute(url, method: "POST", json: ["email": email.trimmingCharacters(in: .whitespaces), "password": password, "data": legal], auth: false, extra: ["apikey": AppConfiguration.anonKey])
        let raw = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return raw?["access_token"] == nil ? nil : try parseSession(data)
    }
    func refresh(_ old: UserSession) async throws -> UserSession {
        let url = URL(string: "\(AppConfiguration.supabaseURL)/auth/v1/token?grant_type=refresh_token")!
        let data = try await execute(url, method: "POST", json: ["refresh_token": old.refreshToken], auth: false, extra: ["apikey": AppConfiguration.anonKey])
        return try parseSession(data)
    }
    func signOut() async { if let url = URL(string: "\(AppConfiguration.supabaseURL)/auth/v1/logout") { _ = try? await execute(url, method: "POST", extra: ["apikey": AppConfiguration.anonKey]) }; session = nil }

    private func parseSession(_ data: Data) throws -> UserSession {
        guard let raw = try JSONSerialization.jsonObject(with: data) as? [String: Any], let access = raw["access_token"] as? String, let refresh = raw["refresh_token"] as? String, let user = raw["user"] as? [String: Any], let id = user["id"] as? String else { throw AppError.invalidResponse }
        let result = UserSession(accessToken: access, refreshToken: refresh, userID: id, email: user["email"] as? String ?? "", expiresAt: Date().addingTimeInterval(raw["expires_in"] as? Double ?? 3600)); session = result; return result
    }
    private func requireConfig() throws { if AppConfiguration.supabaseURL.isEmpty || AppConfiguration.anonKey.isEmpty { throw AppError.configuration("Supabase ayarları iOS derlemesine eklenmemiş.") } }

    func api(_ path: String, method: String = "GET", body: Any? = nil) async throws -> Any {
        let encodedPath = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        let data = try await execute(URL(string: "\(AppConfiguration.apiBase)\(encodedPath)")!, method: method, json: body)
        return try JSONSerialization.jsonObject(with: data)
    }
    func rest(_ table: String, query: String = "", method: String = "GET", body: Any? = nil, prefer: String? = nil) async throws -> Any {
        try requireConfig(); var suffix = query; if !suffix.isEmpty && !suffix.hasPrefix("?") { suffix = "?\(suffix)" }
        var headers = ["apikey": AppConfiguration.anonKey]; if let prefer { headers["Prefer"] = prefer }
        let data = try await execute(URL(string: "\(AppConfiguration.supabaseURL)/rest/v1/\(table)\(suffix)")!, method: method, json: body, extra: headers)
        return data.isEmpty ? [] : try JSONSerialization.jsonObject(with: data)
    }
    func decode<T: Decodable>(_ type: T.Type, from object: Any) throws -> T { try decoder.decode(type, from: JSONSerialization.data(withJSONObject: object)) }
}

actor HedefitRepository {
    static let shared = HedefitRepository(); private let net = NetworkClient.shared
    func dashboard(userID: String) async throws -> Dashboard {
        async let profileRaw = optionalRest("profiles", "select=*&id=eq.\(userID)&limit=1")
        async let planRaw = optionalRest("workout_plans", "select=workouts&user_id=eq.\(userID)&limit=1")
        async let sessionsRaw = optionalRest("workout_sessions", "select=*&user_id=eq.\(userID)&order=completed_at.desc&limit=40")
        async let routesRaw = optionalRest("route_activities", "select=*&user_id=eq.\(userID)&order=started_at.desc&limit=100")
        async let measurementsRaw = optionalRest("body_measurements", "select=*&user_id=eq.\(userID)&order=measured_at.asc&limit=90")
        async let scheduleRaw = optionalRest("workout_schedule", "select=*&user_id=eq.\(userID)&order=scheduled_date.asc&limit=60")
        async let programsRaw = optionalRest("workout_program_collections", "select=*&user_id=eq.\(userID)&order=updated_at.desc&limit=50")
        async let todayRaw = optionalAPI("/api/nutrition/logs?date=\(Self.day(Date()))")
        let profileRows = await profileRaw as? [[String: Any]] ?? []
        var result = Dashboard(); result.profile = parseProfile(profileRows.first, userID: userID)
        let plans = await planRaw as? [[String: Any]] ?? []; result.workouts = parseWorkouts(plans.first?["workouts"])
        result.sessions = decodeRows(await sessionsRaw); result.routeActivities = decodeRows(await routesRaw)
        result.measurements = parseMeasurements(await measurementsRaw); result.schedule = parseSchedule(await scheduleRaw); result.workoutPrograms = parsePrograms(await programsRaw)
        if let json = await todayRaw as? [String: Any] { result.nutritionLogs = decodeRows(json["logs"] ?? []) }
        async let steps = scalar("daily_steps", "steps", userID, "local_date=eq.\(Self.day(Date()))")
        async let water = scalar("water_logs", "milliliters", userID, "local_date=eq.\(Self.day(Date()))")
        async let sleep = scalar("sleep_logs", "minutes", userID, "local_date=eq.\(Self.day(Date()))")
        result.steps = await steps; result.waterMl = await water; result.sleepMinutes = await sleep; result.activeCalories = result.steps / 25
        return result
    }
    private func optionalRest(_ table: String, _ query: String) async -> Any { (try? await net.rest(table, query: query)) ?? [] }
    private func optionalAPI(_ path: String) async -> Any { (try? await net.api(path)) ?? [:] }
    private func scalar(_ table: String, _ field: String, _ user: String, _ extra: String) async -> Int { let value = await optionalRest(table, "select=\(field)&user_id=eq.\(user)&\(extra)&limit=1"); return ((value as? [[String: Any]])?.first?[field] as? NSNumber)?.intValue ?? 0 }
    private func decodeRows<T: Decodable>(_ raw: Any) -> [T] { (try? NetworkClientDecode.rows(T.self, raw)) ?? [] }
    private func parseProfile(_ row: [String: Any]?, userID: String) -> Profile { guard let r = row else { return Profile(id: userID) }; return Profile(id: r.str("id", userID), displayName: r.str("display_name", "Sporcu"), weightKg: r.double("weight_kg"), heightCm: r.double("height_cm"), goal: r.str("goal_text", "Formda kal"), isPremium: r.bool("is_premium"), age: r.int("age"), gender: r.str("gender"), environment: r.str("environment", "Evde"), equipment: r.str("equipment_text"), historyAnswers: r["history_answers"] as? [String] ?? [], targetWeightKg: r.double("target_weight_kg"), targetWeeks: r.int("target_weeks"), accountStatus: r.str("account_status", "active"), avatarURL: nil) }
    private func parseWorkouts(_ raw: Any?) -> [WorkoutExercise] { (raw as? [[String: Any]] ?? []).map { WorkoutExercise(id: $0.str("id", UUID().uuidString), name: $0.str("name"), area: $0.str("area"), sets: $0.int("sets") ?? 3, reps: $0.str("reps", "10"), restSeconds: $0.int("restSeconds") ?? $0.int("rest_seconds") ?? 60) } }
    private func parseMeasurements(_ raw: Any) -> [BodyMeasurement] { (raw as? [[String: Any]] ?? []).map { BodyMeasurement(date: $0.str("measured_at"), weightKg: $0.double("weight_kg"), waistCm: $0.double("waist_cm"), hipsCm: $0.double("hips_cm"), chestCm: $0.double("chest_cm"), armCm: $0.double("arm_cm"), thighCm: $0.double("thigh_cm")) } }
    private func parseSchedule(_ raw: Any) -> [ScheduleItem] { (raw as? [[String: Any]] ?? []).map { ScheduleItem(id: $0.str("id"), date: $0.str("scheduled_date"), time: $0.str("scheduled_time"), status: $0.str("status"), originalDate: $0["original_date"] as? String) } }
    private func parsePrograms(_ raw: Any) -> [WorkoutProgram] { (raw as? [[String: Any]] ?? []).map { WorkoutProgram(id: $0.str("id"), name: $0.str("name"), source: $0.str("source"), focusArea: $0.str("focus_area"), exercises: parseWorkouts($0["exercises"]), isActive: $0.bool("is_active"), showOnHome: $0.bool("show_on_home")) } }

    func setWater(_ total: Int, userID: String) async throws { _ = try await net.rest("water_logs", query: "on_conflict=user_id,local_date", method: "POST", body: ["user_id": userID, "local_date": Self.day(Date()), "milliliters": max(0, min(total, 20_000))], prefer: "resolution=merge-duplicates,return=representation") }
    func saveHealth(_ health: HealthSnapshot, userID: String) async { _ = try? await net.rest("daily_steps", query: "on_conflict=user_id,local_date", method: "POST", body: ["user_id": userID, "local_date": Self.day(Date()), "steps": health.steps, "source": "healthkit"], prefer: "resolution=merge-duplicates"); if health.sleepMinutes > 0 { _ = try? await net.rest("sleep_logs", query: "on_conflict=user_id,local_date", method: "POST", body: ["user_id": userID, "local_date": Self.day(Date()), "minutes": health.sleepMinutes], prefer: "resolution=merge-duplicates") } }
    func saveWorkout(_ exercises: [WorkoutExercise], sets: [WorkoutSet], duration: Int, calories: Int, feedback: WorkoutFeedback, userID: String) async throws {
        let id = UUID().uuidString, now = ISO8601DateFormatter().string(from: Date()); let row: [String: Any] = ["id": id, "user_id": userID, "completed_at": now, "duration_seconds": max(duration, 1), "calories": max(calories, 0), "completed_exercises": Set(sets.map(\.exerciseID)).count, "total_exercises": max(exercises.count, 1), "exercise_names": exercises.map(\.name), "difficulty": feedback.difficulty, "fatigue": feedback.fatigue, "pain_areas": feedback.painAreas, "feedback_note": feedback.note]
        _ = try await net.rest("workout_sessions", method: "POST", body: row)
    }
    func addManualActivity(_ type: ManualActivityType, minutes: Int, effort: Int, weight: Double, userID: String) async throws { let calories = Int(type.met * weight * Double(minutes) / 60); _ = try await net.rest("workout_sessions", method: "POST", body: ["id": UUID().uuidString, "user_id": userID, "completed_at": ISO8601DateFormatter().string(from: Date()), "duration_seconds": minutes * 60, "calories": calories, "completed_exercises": 0, "total_exercises": 1, "fatigue": effort, "manual_activity_key": type.id, "exercise_names": [type.tr]]) }
    func addFood(text: String, grams: Double, meal: String) async throws { guard let parsed = try await net.api("/api/nutrition/parse-text", method: "POST", body: ["query": text, "grams": grams]) as? [String: Any], let item = (parsed["items"] as? [[String: Any]])?.first, let nutrition = item["nutrition"] as? [String: Any] else { throw AppError.invalidResponse }; let body: [String: Any] = ["loggedDate": Self.day(Date()), "mealType": meal, "foodName": item.str("query", text), "portionGrams": item.double("estimatedGrams") ?? grams, "calories": nutrition.int("calories") ?? 0, "protein": nutrition.double("protein") ?? 0, "carbohydrates": nutrition.double("carbohydrates") ?? 0, "fat": nutrition.double("fat") ?? 0, "fiber": nutrition.double("fiber") ?? 0, "inputMethod": "natural_language", "isEstimated": true]; _ = try await net.api("/api/nutrition/logs", method: "POST", body: body) }
    func deleteFood(_ id: String) async throws { _ = try await net.api("/api/nutrition/logs/\(id)", method: "DELETE") }
    func searchExercises(_ query: String) async throws -> [ExerciseCatalogItem] { let result = try await net.api("/api/exercises?limit=1000&search=\(query)&locale=tr") as? [String: Any]; return decodeRows(result?["items"] ?? []) }
    func chat(_ messages: [ChatMessage], dashboard: Dashboard) async throws -> String { let body: [String: Any] = ["messages": messages.suffix(12).map { ["role": $0.fromUser ? "user" : "assistant", "text": $0.text] }, "locale": "tr", "signals": ["today": ["steps": dashboard.steps, "waterMl": dashboard.waterMl, "sleepMinutes": dashboard.sleepMinutes], "profile": ["weightKg": dashboard.profile.weightKg as Any, "goal": dashboard.profile.goal]]]; guard let result = try await net.api("/api/chat", method: "POST", body: body) as? [String: Any] else { throw AppError.invalidResponse }; return result.str("text", result.str("reply", "Yanıt alınamadı.")) }
    func saveRoute(_ snapshot: RouteSnapshot, type: String, title: String, userID: String) async throws { let points = snapshot.points.map { ["lat": $0.coordinate.latitude, "lng": $0.coordinate.longitude, "alt": $0.altitude, "time": Int64($0.timestamp.timeIntervalSince1970 * 1000), "accuracy": $0.horizontalAccuracy] }; _ = try await net.rest("route_activities", method: "POST", body: ["id": snapshot.id.uuidString, "user_id": userID, "activity_type": type, "title": title, "started_at": ISO8601DateFormatter().string(from: snapshot.started), "ended_at": ISO8601DateFormatter().string(from: Date()), "duration_seconds": snapshot.duration, "moving_duration_seconds": snapshot.duration, "distance_meters": snapshot.distance, "average_speed_kmh": snapshot.speedKmh, "calories": Int(snapshot.distance / 1000 * 45), "status": "completed", "route_points": points]) }
    static func day(_ date: Date) -> String { let f = DateFormatter(); f.calendar = .init(identifier: .gregorian); f.locale = .init(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f.string(from: date) }
}

enum NetworkClientDecode { static func rows<T: Decodable>(_ type: T.Type, _ raw: Any) throws -> [T] { let decoder = JSONDecoder(); decoder.keyDecodingStrategy = .convertFromSnakeCase; return try decoder.decode([T].self, from: JSONSerialization.data(withJSONObject: raw)) } }
extension Dictionary where Key == String, Value == Any { func str(_ key: String, _ fallback: String = "") -> String { self[key] as? String ?? fallback }; func int(_ key: String) -> Int? { (self[key] as? NSNumber)?.intValue }; func double(_ key: String) -> Double? { (self[key] as? NSNumber)?.doubleValue }; func bool(_ key: String) -> Bool { (self[key] as? NSNumber)?.boolValue ?? false } }

struct HealthSnapshot { let steps, sleepMinutes, activeCalories: Int; let weightKg: Double? }
actor HealthService {
    static let shared = HealthService(); private let store = HKHealthStore()
    func authorize() async throws { guard HKHealthStore.isHealthDataAvailable() else { throw AppError.server("Sağlık verileri bu cihazda kullanılamıyor.") }; let read: Set<HKObjectType> = [HKQuantityType(.stepCount), HKQuantityType(.activeEnergyBurned), HKQuantityType(.bodyMass), HKCategoryType(.sleepAnalysis)]; let share: Set<HKSampleType> = [HKObjectType.workoutType()]; try await store.requestAuthorization(toShare: share, read: read) }
    func today() async -> HealthSnapshot { async let steps = sum(.stepCount, .count()); async let energy = sum(.activeEnergyBurned, .kilocalorie()); async let sleep = sleepMinutes(); async let weight = latestWeight(); return await HealthSnapshot(steps: Int(steps), sleepMinutes: sleep, activeCalories: Int(energy), weightKg: weight) }
    private func sum(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit) async -> Double { guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return 0 }; let start = Calendar.current.startOfDay(for: Date()); return await withCheckedContinuation { continuation in store.execute(HKStatisticsQuery(quantityType: type, quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: Date()), options: .cumulativeSum) { _, value, _ in continuation.resume(returning: value?.sumQuantity()?.doubleValue(for: unit) ?? 0) }) } }
    private func sleepMinutes() async -> Int { let start = Calendar.current.date(byAdding: .day, value: -1, to: Calendar.current.startOfDay(for: Date()))!; return await withCheckedContinuation { continuation in let query = HKSampleQuery(sampleType: HKCategoryType(.sleepAnalysis), predicate: HKQuery.predicateForSamples(withStart: start, end: Date()), limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in let seconds = (samples as? [HKCategorySample] ?? []).filter { $0.value != HKCategoryValueSleepAnalysis.inBed.rawValue }.reduce(0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }; continuation.resume(returning: Int(seconds / 60)) }; store.execute(query) } }
    private func latestWeight() async -> Double? { return await withCheckedContinuation { continuation in let q = HKSampleQuery(sampleType: HKQuantityType(.bodyMass), predicate: nil, limit: 1, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]) { _, samples, _ in continuation.resume(returning: (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: .gramUnit(with: .kilo))) }; store.execute(q) } }
}

struct RouteSnapshot { let id: UUID; let started: Date; var points: [CLLocation]; var distance: Double; var duration: Int { Int(Date().timeIntervalSince(started)) }; var speedKmh: Double { duration > 0 ? distance / Double(duration) * 3.6 : 0 } }
@Observable final class RouteService: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager(); var snapshot: RouteSnapshot?; var isTracking = false; var error: String?
    override init() { super.init(); manager.delegate = self; manager.activityType = .fitness; manager.desiredAccuracy = kCLLocationAccuracyBest; manager.distanceFilter = 4; manager.allowsBackgroundLocationUpdates = true; manager.pausesLocationUpdatesAutomatically = false }
    func start() { manager.requestAlwaysAuthorization(); snapshot = RouteSnapshot(id: UUID(), started: Date(), points: [], distance: 0); isTracking = true; manager.startUpdatingLocation() }
    func stop() -> RouteSnapshot? { manager.stopUpdatingLocation(); isTracking = false; return snapshot }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) { guard isTracking, var value = snapshot else { return }; for location in locations where location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= 40 { if let last = value.points.last { let delta = location.distance(from: last); if delta < 250 { value.distance += delta } }; value.points.append(location) }; snapshot = value }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { self.error = error.localizedDescription }
}

enum NotificationService {
    static func configure(_ settings: AppSettings) async {
        let center = UNUserNotificationCenter.current(); if settings.notifications { _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge]) }
        center.removeAllPendingNotificationRequests(); guard settings.notifications else { return }
        if settings.waterReminder { for hour in [10, 13, 16, 19] { let c = UNMutableNotificationContent(); c.title = "Su zamanı 💧"; c.body = "Hedefine yaklaşmak için bir bardak su iç."; c.sound = .default; let trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: hour), repeats: true); try? await center.add(UNNotificationRequest(identifier: "water-\(hour)", content: c, trigger: trigger)) } }
        if settings.workoutReminder { let c = UNMutableNotificationContent(); c.title = "Hedefit antrenmanı"; c.body = "Bugünkü programın seni bekliyor."; c.sound = .default; try? await center.add(UNNotificationRequest(identifier: "workout", content: c, trigger: UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: 18), repeats: true))) }
    }
}

actor OfflineQueue {
    static let shared = OfflineQueue(); private var file: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("offline.json") }
    func enqueue(_ object: [String: String]) { var rows = (try? JSONDecoder().decode([[String: String]].self, from: Data(contentsOf: file))) ?? []; rows.append(object); try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true); try? JSONEncoder().encode(rows).write(to: file, options: .atomic); schedule() }
    func flush() async { /* Mutations retain their payload until a signed-in store replays them. */ }
    private func schedule() { let request = BGProcessingTaskRequest(identifier: "com.hedefit.app.sync"); request.requiresNetworkConnectivity = true; try? BGTaskScheduler.shared.submit(request) }
}

enum WidgetShared {
    static func update(_ dashboard: Dashboard, settings: AppSettings) { let defaults = UserDefaults(suiteName: "group.com.hedefit.app"); defaults?.set(dashboard.steps, forKey: "steps"); defaults?.set(settings.stepGoal, forKey: "stepGoal"); defaults?.set(dashboard.waterMl, forKey: "water"); defaults?.set(dashboard.activeCalories, forKey: "calories"); defaults?.set(dashboard.workouts.first?.name ?? "Antrenman", forKey: "workout"); WidgetCenter.shared.reloadAllTimelines() }
}
