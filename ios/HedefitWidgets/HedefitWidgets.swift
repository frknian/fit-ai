import WidgetKit
import SwiftUI

struct HedefitEntry: TimelineEntry { let date: Date; let steps, goal, water, calories: Int; let workout: String }
struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> HedefitEntry { .init(date: Date(), steps: 6432, goal: 10000, water: 1250, calories: 384, workout: "Tüm Vücut") }
    func getSnapshot(in context: Context, completion: @escaping (HedefitEntry) -> Void) { completion(entry()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<HedefitEntry>) -> Void) { completion(Timeline(entries: [entry()], policy: .after(Date().addingTimeInterval(900)))) }
    private func entry() -> HedefitEntry { let d = UserDefaults(suiteName: "group.com.hedefit.app"); return .init(date: Date(), steps: d?.integer(forKey: "steps") ?? 0, goal: max(d?.integer(forKey: "stepGoal") ?? 10000, 1), water: d?.integer(forKey: "water") ?? 0, calories: d?.integer(forKey: "calories") ?? 0, workout: d?.string(forKey: "workout") ?? "Antrenman") }
}

struct DashboardWidget: Widget {
    let kind = "HedefitDashboard"
    var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: Provider()) { entry in ZStack { Color(red: 0.05, green: 0.04, blue: 0.08); VStack(alignment: .leading, spacing: 9) { HStack { Text("HEDEFIT").font(.caption.bold()).foregroundStyle(.green); Spacer(); Image(systemName: "arrow.up.right.circle.fill").foregroundStyle(.green) }; HStack { WidgetMetric(icon: "shoeprints.fill", value: entry.steps.formatted(), label: "adım"); WidgetMetric(icon: "drop.fill", value: "\(entry.water)", label: "ml"); WidgetMetric(icon: "flame.fill", value: "\(entry.calories)", label: "kcal") }; ProgressView(value: Double(entry.steps), total: Double(entry.goal)).tint(.green) }.padding() }.containerBackground(.clear, for: .widget) }.configurationDisplayName("Hedefit Dashboard").description("Adım, su ve kalori durumunu gösterir.").supportedFamilies([.systemMedium, .systemLarge]) }
}
struct ActivityWidget: Widget { var body: some WidgetConfiguration { StaticConfiguration(kind: "HedefitActivity", provider: Provider()) { e in Link(destination: URL(string: "hedefit://workout")!) { ZStack { Color(red: 0.05, green: 0.04, blue: 0.08); VStack { Image(systemName: "dumbbell.fill").font(.largeTitle).foregroundStyle(.green); Text(e.workout).font(.headline).foregroundStyle(.white); Text("Antrenmanı aç").font(.caption).foregroundStyle(.secondary) }.padding() }.containerBackground(.clear, for: .widget) } }.configurationDisplayName("Hedefit Antrenman").description("Aktif antrenmanına hızlıca ulaş.").supportedFamilies([.systemSmall, .systemMedium]) } }
struct CaloriesWidget: Widget { var body: some WidgetConfiguration { StaticConfiguration(kind: "HedefitCalories", provider: Provider()) { e in ZStack { Color(red: 0.05, green: 0.04, blue: 0.08); VStack { Image(systemName: "flame.fill").font(.largeTitle).foregroundStyle(.orange); Text("\(e.calories)").font(.title.bold()).foregroundStyle(.white); Text("aktif kcal").font(.caption).foregroundStyle(.secondary) }.padding() }.containerBackground(.clear, for: .widget) }.configurationDisplayName("Hedefit Kalori").description("Aktif kalorini gösterir.").supportedFamilies([.systemSmall]) } }
struct WidgetMetric: View { let icon, value, label: String; var body: some View { VStack(alignment: .leading) { Image(systemName: icon).foregroundStyle(.green); Text(value).font(.headline).foregroundStyle(.white); Text(label).font(.caption2).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, alignment: .leading) } }

@main struct HedefitWidgetBundle: WidgetBundle { var body: some Widget { DashboardWidget(); ActivityWidget(); CaloriesWidget() } }
