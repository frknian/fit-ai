import SwiftUI
import Observation

enum AuthPhase { case loading, signedOut, signedIn, frozen, configurationError(String) }

@MainActor @Observable final class AppStore {
    var phase: AuthPhase = .loading; var session: UserSession?; var dashboard = Dashboard(); var selectedTab: AppTab = .home
    var loading = false; var message: String?; var error: String?; var chat: [ChatMessage] = []
    var settings: AppSettings { didSet { saveSettings(); Task { await NotificationService.configure(settings) }; WidgetShared.update(dashboard, settings: settings) } }
    var exercises: [ExerciseCatalogItem] = []; let route = RouteService()
    private let net = NetworkClient.shared, repository = HedefitRepository.shared

    init() { settings = (try? JSONDecoder().decode(AppSettings.self, from: UserDefaults.standard.data(forKey: "settings") ?? Data())) ?? AppSettings() }

    func bootstrap() async {
        guard !AppConfiguration.supabaseURL.isEmpty, !AppConfiguration.anonKey.isEmpty else { phase = .configurationError("iOS yapılandırmasında Supabase adresi veya anahtarı eksik."); return }
        guard var stored = await KeychainSessionStore.shared.read() else { phase = .signedOut; return }
        do { if stored.expiresAt.timeIntervalSinceNow < 90 { stored = try await net.refresh(stored); await KeychainSessionStore.shared.write(stored) }; session = stored; await net.setSession(stored); phase = .signedIn; await refresh() } catch { await KeychainSessionStore.shared.clear(); await net.setSession(nil); phase = .signedOut }
    }
    func authenticate(email: String, password: String, signUp: Bool, legal: Bool) async {
        guard !email.isEmpty, password.count >= 8 else { error = "Geçerli e-posta ve en az 8 karakterli parola gir."; return }
        if signUp && !legal { error = "KVKK Aydınlatma Metni ve Gizlilik Politikası'nı onaylamalısın."; return }
        loading = true; defer { loading = false }
        do {
            let result = signUp ? try await net.signUp(email: email, password: password) : try await net.signIn(email: email, password: password)
            guard let result else { message = "Doğrulama bağlantısı e-posta adresine gönderildi."; return }
            session = result; await net.setSession(result); await KeychainSessionStore.shared.write(result); phase = .signedIn; await refresh()
        } catch { self.error = error.localizedDescription }
    }
    func signOut() async { await net.signOut(); await KeychainSessionStore.shared.clear(); session = nil; dashboard = Dashboard(); phase = .signedOut }
    func refresh() async {
        guard let session else { return }; loading = true; error = nil
        do { dashboard = try await repository.dashboard(userID: session.userID); phase = dashboard.profile.accountStatus == "frozen" ? .frozen : .signedIn; if chat.isEmpty { chat = [.init(text: "Merhaba \(dashboard.profile.displayName)! Antrenman, beslenme veya ilerlemen hakkında bana bir şey sorabilirsin.", fromUser: false)] }; await syncHealth(silent: true); WidgetShared.update(dashboard, settings: settings) } catch { self.error = error.localizedDescription }
        loading = false
    }
    func syncHealth(silent: Bool = false) async {
        guard let session else { return }; do { try await HealthService.shared.authorize(); let value = await HealthService.shared.today(); dashboard.steps = value.steps; dashboard.sleepMinutes = value.sleepMinutes; dashboard.activeCalories = value.activeCalories; if value.weightKg != nil { dashboard.profile.weightKg = value.weightKg }; await repository.saveHealth(value, userID: session.userID); WidgetShared.update(dashboard, settings: settings); if !silent { message = "Sağlık verileri eşitlendi." } } catch { if !silent { self.error = error.localizedDescription } }
    }
    func addWater(_ amount: Int) async { guard let session else { return }; let old = dashboard.waterMl; dashboard.waterMl = max(0, min(old + amount, 20_000)); do { try await repository.setWater(dashboard.waterMl, userID: session.userID); WidgetShared.update(dashboard, settings: settings) } catch { dashboard.waterMl = old; self.error = error.localizedDescription } }
    func saveWorkout(sets: [WorkoutSet], seconds: Int, calories: Int, feedback: WorkoutFeedback) async throws { guard let session else { return }; try await repository.saveWorkout(dashboard.workouts, sets: sets, duration: seconds, calories: calories, feedback: feedback, userID: session.userID); message = "Antrenman ve tüm setlerin ilerlemene kaydedildi."; await refresh() }
    func addManual(_ type: ManualActivityType, minutes: Int, effort: Int) async throws { guard let session else { return }; try await repository.addManualActivity(type, minutes: minutes, effort: effort, weight: dashboard.profile.weightKg ?? 70, userID: session.userID); message = "\(type.tr) aktivitesi kaydedildi."; await refresh() }
    func addFood(_ text: String, grams: Double, meal: String) async { guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }; loading = true; do { try await repository.addFood(text: text, grams: grams, meal: meal); message = "Öğün kaydedildi."; await refresh() } catch { self.error = error.localizedDescription }; loading = false }
    func deleteFood(_ log: NutritionLog) async { do { try await repository.deleteFood(log.id); dashboard.nutritionLogs.removeAll { $0.id == log.id } } catch { self.error = error.localizedDescription } }
    func sendChat(_ text: String) async { guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }; chat.append(.init(text: text, fromUser: true)); loading = true; do { let reply = try await repository.chat(chat, dashboard: dashboard); chat.append(.init(text: reply, fromUser: false)) } catch { self.error = error.localizedDescription }; loading = false }
    func searchExercises(_ query: String) async { loading = true; do { exercises = try await repository.searchExercises(query) } catch { self.error = error.localizedDescription }; loading = false }
    func saveRoute(type: String, title: String) async { guard let value = route.stop(), let session else { return }; do { try await repository.saveRoute(value, type: type, title: title, userID: session.userID); message = "Rota kaydedildi."; await refresh() } catch { self.error = error.localizedDescription } }
    func handleDeepLink(_ url: URL) { switch url.host { case "workout": selectedTab = .workout; case "nutrition": selectedTab = .nutrition; default: selectedTab = .home } }
    private func saveSettings() { if let data = try? JSONEncoder().encode(settings) { UserDefaults.standard.set(data, forKey: "settings") } }
}
