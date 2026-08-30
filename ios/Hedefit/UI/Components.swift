import SwiftUI

struct RootView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        Group { switch store.phase { case .loading: ProgressView("Hedefit hazırlanıyor…"); case .signedOut: AuthView(); case .configurationError(let text): ContentUnavailableView("Yapılandırma gerekli", systemImage: "wrench.and.screwdriver", description: Text(text)); case .frozen: FrozenAccountView(); case .signedIn: MainShell() } }
            .alert("Hedefit", isPresented: Binding(get: { store.error != nil || store.message != nil }, set: { if !$0 { store.error = nil; store.message = nil } })) { Button("Tamam", role: .cancel) {} } message: { Text(store.error ?? store.message ?? "") }
    }
}

struct MainShell: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        @Bindable var store = store
        TabView(selection: $store.selectedTab) {
            NavigationStack { HomeView() }.tabItem { Label(AppTab.home.title, systemImage: AppTab.home.icon) }.tag(AppTab.home)
            NavigationStack { WorkoutView() }.tabItem { Label(AppTab.workout.title, systemImage: AppTab.workout.icon) }.tag(AppTab.workout)
            NavigationStack { NutritionView() }.tabItem { Label(AppTab.nutrition.title, systemImage: AppTab.nutrition.icon) }.tag(AppTab.nutrition)
            NavigationStack { CoachView() }.tabItem { Label(AppTab.coach.title, systemImage: AppTab.coach.icon) }.tag(AppTab.coach)
            NavigationStack { ProgressDashboardView() }.tabItem { Label(AppTab.progress.title, systemImage: AppTab.progress.icon) }.tag(AppTab.progress)
        }
        .overlay(alignment: .top) { if store.loading { ProgressView().padding(9).background(.ultraThinMaterial, in: Capsule()).padding(.top, 6) } }
    }
}

struct AuthView: View {
    @Environment(AppStore.self) private var store; @State private var email = ""; @State private var password = ""; @State private var signUp = false; @State private var legal = false
    var body: some View {
        ZStack { LinearGradient(colors: [.black, Color.hedefitPurple.opacity(0.65), .black], startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea(); ScrollView { VStack(spacing: 22) { Spacer(minLength: 55); Image(systemName: "arrow.up.right.circle.fill").font(.system(size: 72)).foregroundStyle(Color.hedefitGreen); Text("HEDEFIT").font(.system(size: 38, weight: .black, design: .rounded)).tracking(4); Text("Daha güçlü bir sen, her gün.").foregroundStyle(.secondary); VStack(spacing: 14) { TextField("E-posta", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).hedefitField(); SecureField("Parola", text: $password).textContentType(signUp ? .newPassword : .password).hedefitField(); if signUp { Toggle(isOn: $legal) { Text("KVKK Aydınlatma Metni ve Gizlilik Politikası’nı okudum, kabul ediyorum.").font(.caption) }.tint(Color.hedefitGreen) }; Button { Task { await store.authenticate(email: email, password: password, signUp: signUp, legal: legal) } } label: { Text(signUp ? "Hesap oluştur" : "Giriş yap").frame(maxWidth: .infinity) }.buttonStyle(HedefitButtonStyle()).disabled(store.loading); Button(signUp ? "Zaten hesabın var mı? Giriş yap" : "Hesabın yok mu? Kayıt ol") { signUp.toggle() }.font(.subheadline) }.padding().background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24)); Spacer() }.padding() } }.preferredColorScheme(.dark)
    }
}

struct FrozenAccountView: View {
    @Environment(AppStore.self) private var store
    var body: some View { ContentUnavailableView { Label("Hesabın dondurulmuş", systemImage: "snowflake") } description: { Text("Verilerin korunuyor. Hesabını yeniden açabilir veya çıkış yapabilirsin.") } actions: { Button("Hesabı yeniden aç") { store.phase = .signedIn }; Button("Çıkış yap", role: .destructive) { Task { await store.signOut() } } } }
}

struct HedefitButtonStyle: ButtonStyle { var color: Color = Color.hedefitGreen; func makeBody(configuration: ButtonStyle.Configuration) -> some View { configuration.label.fontWeight(.bold).padding(.vertical, 13).padding(.horizontal, 18).background(color.opacity(configuration.isPressed ? 0.65 : 1), in: RoundedRectangle(cornerRadius: 14)).foregroundStyle(Color.black).scaleEffect(configuration.isPressed ? 0.98 : 1) } }
extension View { func hedefitField() -> some View { self.padding(13).background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 13)) } }

struct MetricCard: View { let title, value, icon: String; var color: Color = Color.hedefitGreen; var body: some View { VStack(alignment: .leading, spacing: 8) { Label(title, systemImage: icon).font(.caption).foregroundStyle(.secondary); Text(value).font(.title2.bold()).foregroundStyle(color) }.frame(maxWidth: .infinity, alignment: .leading).padding().background(Color.panel, in: RoundedRectangle(cornerRadius: 18)) } }
struct ProgressRing: View { let value: Double; let color: Color; let title, center: String; var body: some View { VStack { ZStack { Circle().stroke(color.opacity(0.18), lineWidth: 9); Circle().trim(from: 0, to: min(max(value, 0), 1)).stroke(color, style: StrokeStyle(lineWidth: 9, lineCap: .round)).rotationEffect(.degrees(-90)); Text(center).font(.caption.bold()) }.frame(width: 75, height: 75); Text(title).font(.caption).foregroundStyle(.secondary) } } }
struct SectionHeader: View { let title: String; var action: (() -> Void)?; var body: some View { HStack { Text(title).font(.title3.bold()); Spacer(); if let action { Button("Tümü", action: action).font(.caption) } } } }
