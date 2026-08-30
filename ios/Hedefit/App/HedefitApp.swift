import SwiftUI
import BackgroundTasks

@main
struct HedefitApp: App {
    @State private var store = AppStore()

    init() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.hedefit.app.sync", using: nil) { task in
            Task { await OfflineQueue.shared.flush(); task.setTaskCompleted(success: true) }
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .tint(Color.hedefitGreen)
                .preferredColorScheme(store.settings.darkMode ? .dark : .light)
                .task { await store.bootstrap() }
                .onOpenURL { store.handleDeepLink($0) }
        }
    }
}

extension Color {
    static let hedefitGreen = Color(red: 0.31, green: 0.96, blue: 0.45)
    static let hedefitPurple = Color(red: 0.45, green: 0.35, blue: 0.96)
    static let hedefitOrange = Color(red: 1.0, green: 0.55, blue: 0.18)
    static let panel = Color.primary.opacity(0.07)
}
