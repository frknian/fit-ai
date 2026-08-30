# Hedefit iOS

Android uygulamasının SwiftUI karşılığıdır. iOS 17 ve üzerini hedefler; HealthKit,
Core Location, UserNotifications, WidgetKit ve Keychain kullanır.

## Kurulum

1. `Config.xcconfig.example` dosyasını `Config.xcconfig` adıyla kopyalayın ve
   Supabase değerlerini ekleyin.
2. `xcodegen generate` çalıştırın.
3. `Hedefit.xcodeproj` dosyasını Xcode ile açın, Signing & Capabilities altında
   takımınızı ve App Group'u seçin.

`xcodebuild -project Hedefit.xcodeproj -scheme Hedefit -sdk iphonesimulator build`
komutu imzasız simülatör derlemesini doğrular.
