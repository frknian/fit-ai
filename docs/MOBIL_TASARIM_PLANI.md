# Hedefit — Gezinme mimarisi ve mobil tasarım planı

Kapsam: kontrol listesindeki **9. madde** (tüm sekmelerin kullanım kolaylığına
göre yeniden tasarlanması) ve **11. madde** (sayfalandırmanın baştan
yazılması).

İkisi tek bir plan çünkü sıraları tersine çevrilemez: sekmeleri yeniden
tasarlamak, önce "hangi ekrandayız" sorusunun **tek** bir cevabı olmasını
gerektiriyor. Bugün o cevap on beş ayrı değişkende dağınık duruyor.

---

## 1. Teşhis

Aşağıdakiler ölçüldü, tahmin değil.

### 1.1 Tek bileşende biriken durum

`components/FitAiApp.tsx` — **2229 satır, 68 `useState`**. Onboarding, panel,
antrenman oynatıcı, plan üretimi, seans geri bildirimi ve sekiz görünümün
tamamı aynı fonksiyonda.

### 1.2 Gezinme durumu on beş değişkene dağılmış

| Nerede | Değişken |
|---|---|
| `FitAiApp` | `authStatus`, `accountStatus`, `step`, `questionIndex`, `chosenView`, `activeWorkout`, `libraryExerciseId`, `pendingSession`, `goalPlanOpen`, `gpsTrackerOpen`, `activityLogOpen`, `paywallOpen`, `guideOpen` |
| `ProfileManager` | `settingsOpen` |
| `TrainingPrograms` | `selection`, `builderId`, `regionBuilderOpen`, `swapOpenFor` |
| `ExerciseLibrary` | `selected` |
| `AiCoachChat` | `open` |

Bunlar birbirinden habersiz. Sonuç: **geçersiz durumlar tip düzeyinde
mümkün** — `activeView === "profile"` iken `gpsTrackerOpen === true` olabilir,
ayarlar açıkken oynatıcı arkada durabilir. Bugün bunlar kazayla değil, kodun
her yere `setX(false)` serpiştirmesiyle engelleniyor.

### 1.3 Görünüm seçimi tek bir dev ifadede

`FitAiApp.tsx:2069` — **1919 karakterlik tek satır**, yedi katlı iç içe ternary
sekiz görünümü seçiyor. Yeni bir ekran eklemek bu zincire dokunmak demek.

### 1.4 Android geri tuşu çalışmıyor

`lib/mobile.ts:245`:

```ts
void App.addListener("backButton", ({ canGoBack }) => {
  if (canGoBack) window.history.back();
  else void App.minimizeApp();
});
```

Uygulama tek sayfa ve **hiçbir zaman `history.pushState` çağırmıyor**. Bu
yüzden `canGoBack` pratikte hep `false`: kullanıcı ayarlardayken, antrenman
oynatıcısındayken veya hareket detayındayken geri tuşuna bastığında uygulama
**kapanıp arka plana düşüyor**. Geri gelmenin tek yolu ekrandaki düğme.

Bu tek başına, tasarımdan bağımsız, düzeltilmesi gereken bir hata.

### 1.5 Kaydırma konumu her geçişte sıfırlanıyor

`FitAiApp.tsx:1362` her görünüm değişiminde `scrollTo(0)` yapıyor. Kütüphanede
400. harekete inip bir detay açtıktan sonra geri dönen kullanıcı listenin
başına düşüyor.

### 1.6 Derin bağlantı yok

Bildirime basınca uygulama hep ana ekrandan açılıyor. "Antrenman saatin
yaklaşıyor" bildirimi kullanıcıyı antrenmana götüremiyor.

---

## 2. Gezinme mimarisi (madde 11)

### 2.1 Tek rota modeli

Yeni dosya: `lib/navigation.ts`. Saf, React'e bağımsız, `node --test` ile
test edilebilir.

```ts
export type Tab = "today" | "workout" | "activity" | "coach" | "progress";

/** Bir sekmenin üstüne açılan ekranlar. */
export type Screen =
  | { name: "nutrition" }
  | { name: "calendar" }
  | { name: "programs" }
  | { name: "player"; exerciseIndex: number }
  | { name: "library"; exerciseId?: string }
  | { name: "exerciseDetail"; exerciseId: string }
  | { name: "gpsTracker" }
  | { name: "routeLog" }
  | { name: "sleep" }
  | { name: "profile" }
  | { name: "settings" }
  | { name: "profileTest"; question: number }
  | { name: "paywall" }
  | { name: "guide" }
  | { name: "sessionFeedback" };

/** Ekranın nasıl sunulduğu; geri davranışı buna göre değişmez, sunum değişir. */
export type Present = "push" | "sheet" | "modal";

export type StackEntry = { screen: Screen; present: Present; scrollY: number };

/** Her sekmenin KENDİ yığını var — mobilde beklenen davranış budur. */
export type NavState = { tab: Tab; stacks: Record<Tab, StackEntry[]> };
```

Neden sekme başına yığın: kullanıcı Antrenman'da program listesine iner,
Bugün'e geçip geri döndüğünde **kaldığı yerde** olmalı. Tek ortak yığın bunu
veremez.

### 2.2 Saf indirgeyici

```ts
export type NavAction =
  | { type: "selectTab"; tab: Tab }
  | { type: "push"; screen: Screen; present?: Present }
  | { type: "pop" }
  | { type: "popToRoot" }
  | { type: "replace"; screen: Screen };

export function navigate(state: NavState, action: NavAction): NavState;
```

Kurallar koda gömülür, bileşenlere dağılmaz:

- **Aktif sekmeye yeniden basmak** yığını köke indirir (her mobil uygulamada
  beklenen davranış; bugün hiçbir şey yapmıyor).
- Sekme değişimi diğer yığınları **korur**.
- `pop` boş yığında sekmeyi `today`e alır; `today` kökündeyse hiçbir şey
  yapmaz. Geri gidilecek yer olup olmadığını ayrı bir yüklem söyler
  (`canGoBack`), böylece indirgeyici toplam kalır ve çağıran "uygulamayı arka
  plana al" kararını kendisi verir.
- Aynı ekran üst üste iki kez itilemez (çift dokunuş koruması).

Test edilecekler (`tests/navigation.test.mjs`): geri tuşu senaryoları, sekme
değişiminde yığın korunması, kökten geri, çift itme, geçersiz durum üretilememesi.

### 2.3 Tarayıcı geçmişine bağlama

`components/navigation/NavigationProvider.tsx`:

- Her `push` → `history.pushState(serialize(state), "", url(state))`
- `popstate` → durumu geri yükle
- **Android geri tuşu kendiliğinden düzelir**: `canGoBack` artık `true` olur ve
  `lib/mobile.ts` içindeki mevcut kod doğru çalışmaya başlar. O dosyaya
  dokunmak gerekmiyor.

URL biçimi: `/?t=workout&s=programs,player:2`. Bu aynı zamanda derin bağlantıyı
çözüyor — bildirim doğrudan antrenmanı açabilir.

Uygulamada çıkan iki kısıt (ikisi de tarayıcıda ölçüldü):

**Kaydırma konumu MEVCUT geçmiş girdisine yazılmalı.** Konumu duruma yazıp
yeni girdiyi itmek, kaydedilen değeri yanlış girdiye koyuyor: geri tuşu bir
sonraki girdiyi değil, geride bırakılanı okuyor. Ayrılırken önce
`replaceState` ile bulunduğumuz girdi güncellenir, sonra yenisi itilir.

**Köke inme `history.go(-derinlik)` ile yapılamaz.** Tarayıcı geçmişi
doğrusal, sekme yığınları değil: kullanıcı Antrenman'da iki ekran açıp
Aktivite'ye geçip geri dönerse o iki ekran artık geçmişin son iki girdisi
değildir ve `go(-2)` bambaşka bir yere düşer (ölçüldü: hiçbir şey olmuyordu).
Bunun yerine köke inme yeni bir girdi iter. Bedeli, köke indikten sonra geri
tuşunun kapatılan ekranı geri getirmesi — web'in doğrusal geçmiş modeliyle
tutarlı ve tahmin edilebilir.

**Durum React state'inde değil, `window.history`de tutulur.** Sağlayıcı onu
`useSyncExternalStore` ile okur (lib/preferences.ts ile aynı kalıp). Mount'ta
URL'yi okuyup `setState` etmek hem sunucu/istemci uyuşmazlığı üretiyordu hem
de fazladan bir render turu açıyordu.

### 2.4 Kaydırma konumu

`StackEntry.scrollY` yığında taşınır: `push` sırasında mevcut konum kaydedilir,
`pop` sırasında geri yüklenir. Yeni ekran her zaman 0'dan başlar.
`FitAiApp.tsx:1362`'deki koşulsuz `scrollTo(0)` kalkar.

### 2.5 Dosya bölünmesi

Rota çözüldükten sonra 68 state üç bağlama ayrılır:

| Bağlam | İçerik | Yaklaşık state |
|---|---|---|
| `ProfileProvider` | kimlik, ölçüler, test cevapları, avatar, premium, hesap durumu | ~20 |
| `PlanProvider` | `aiWorkouts`, `planReport`, uyarlama, programlar, program günlüğü | ~12 |
| `SessionProvider` | oynatıcı: `activeWorkout`, sayaç, set taslakları, geri bildirim | ~20 |
| `NavigationProvider` | yukarıdaki rota | 1 |

Görünümler `components/screens/` altına taşınır — beş sekme kökü
(`TodayScreen`, `WorkoutScreen`, `ActivityScreen`, `CoachScreen`,
`ProgressScreen`) ve yığına itilen ekranlar (`ProfileScreen`, `SettingsScreen`,
`NutritionScreen`, `PlayerScreen`, `LibraryScreen`…).
`FitAiApp.tsx` yalnız kabuk + sağlayıcı kompozisyonu olarak **~150 satıra**
iner.

**Sıra önemli:** önce navigation (hiçbir şeye bağlı değil), sonra session (en
izole), sonra plan, en son profile (her şey ona bağlı).

### 2.6 Faz 1.5'te yapılanlar

`activeView` artık kendi state'i değil, rotadan türetiliyor. Eski sekiz görünüm
adı geçiş dönemi eşlemesiyle çevriliyor (`lib/navigation.ts` → GEÇİŞ DÖNEMİ),
böylece sekmeler henüz beşe indirilmeden geri tuşu, derin bağlantı ve kaydırma
konumu çalışıyor. Dördü sekme kökü, dördü (beslenme, takvim, profil,
kütüphane) şimdiden yığına itiliyor — hedef tasarımda zaten orada olacaklar.

Beş kaplama da yığına taşındı: hedef planı, GPS takibi, rota günlüğü, ödeme
duvarı, kullanma kılavuzu. Bunlar geri tuşunun en çok acıttığı yerdi —
kaplamadayken geri tuşu uygulamayı kapatıyordu.

`FitAiApp.tsx:1374`'teki koşulsuz `scrollTo(0)` kalktı; kaydırma konumu artık
yığında taşınıyor.

**Kalanlar (Faz 2/3):** antrenman oynatıcısı (`activeWorkout`), seans geri
bildirimi, ayarlar alt sayfası (`ProfileManager` içindeki `settingsOpen`),
program kurucusu ve hareket detayı hâlâ kendi state'lerinde — geri tuşu onları
kapatmıyor.

### 2.7 Faz 2a'da yapılanlar

Oynatıcının durum makinesi `lib/workout-session.ts`'e çıktı. Eskiden on bir
ayrı `useState` ve iç içe geçmiş `setTimer(current => { setWorkoutPhase(...);
setCurrentSet(...) })` çağrılarıyla yazılmıştı; kural — "set bitince
dinlenmeye geç, son sette bitir, sayaç kapalıysa geri sayım yok ama seans
süresi işlemeye devam etsin" — hiçbir yerde tek parça durmuyor ve test
edilemiyordu. Artık 18 test kapsıyor.

`FitAiApp`: 68 → 54 `useState`.

Bağlanırken çıkan iki nokta:

**Sayaç efekti `session`'ın tamamına bağlanamaz.** İlk hâlinde öyleydi ve her
saniye aralığı yıkıp yeniden kuruyordu; o sırada olan her render (ör. set
kaydına yazı yazmak) geri sayımı baştan başlatırdı. Bağımlılıklar eskisi gibi
tek tek alanlar.

**Çıkışta oynatıcı kapanmıyordu.** `resetToNewUser` oynatıcıya hiç
dokunmuyordu; çıkan kullanıcının yarım antrenmanı sonraki oturumda ekranda
kalabiliyordu. Sıfırlama artık oturumu da kapatıyor.

---

## 3. Tasarım yönü (madde 9)

### 3.1 Sekiz görünüm → beş sekme

Alt çubuktaki beş sütunun her biri bir **eylem**. Ortada yükseltilmiş düğme
yok: beş eylem eşit ağırlıkta durur, birini öne çıkarmak diğerlerini ikinci
sınıf gösteriyordu.

| Sekme | Tek görevi | Bugün nereden geliyor |
|---|---|---|
| **Bugün** | Gör — günün özeti ve görevleri | `plan` |
| **Antrenman** | Çalış | `workout` + `library` |
| **Aktivite** | Dışarı çık, kaydet | `activity` (Rota, spor, uyku) |
| **Koç** | Yardım al | `AiCoachChat` (yüzen panelden sekmeye) |
| **İlerleme** | Sonuçlarını gör | `progress` + adım/rota geçmişi + hedef planı |

Yer değiştirenler:

- **Profil** → çubuktan iner. Bugün ve İlerleme başlıklarındaki avatardan
  açılır; içinde kimlik, ölçüler, profil testi girişi ve dişliden Ayarlar.
  Gerekçe: diğer beşi bir eylem, profil ise günlük kullanılan bir yer değil ve
  ayarlar zaten alt sayfaya taşındı.
- **Beslenme** → Bugün'deki kalori kartından açılan tam ekran alt sayfa
- **Takvim** → Bugün > "Planı gör"
- **Kütüphane** → Antrenman > Kütüphane, ayrıca genel aramadan
- **Kütüphane detayı** → yığında `sheet` olarak

> **Kayıt:** beslenme kaydı ve profil erişimi birer dokunuş uzaklaşıyor.
> Karşılığı, uygulamanın en geniş yüzeyi olan Antrenman'ın kendi sütununu
> alması ve alt çubuğun altı yerine beş sütunda kalması.

### 3.2 Aktivite sekmesi: "Nasıl hareket ediyoruz?"

Sekme açıldığında dört büyük seçenek:

```
Yürüyüş · Koşu · Bisiklet · Diğer
```

İlk üçü doğrudan Hedefit Rota'yı büyük sayı düzeniyle açar (mesafe / süre /
kalori, koşarken okunabilir punto). "Diğer" kalan spor kataloğunu (yüzme,
futbol, yoga…) manuel kayıt formuyla açar. Uyku kaydı ve rota geçmişi bu
sekmenin altında kalır.

Antrenman buradan **çıktı**: kendi sekmesi oldu (3.2.1).

### 3.2.1 Antrenman: kendi sekmesi

Uygulamanın en geniş işlev yüzeyi: akıllı program, tam vücut, on iki bölge
(+ özel bölgeler), en fazla on iki özel program, program kurucusu, oynatıcı ve
873 hareketlik katalog. Bir mod paneline sığmıyor — alt çubukta kendi sütununu
alıyor:

```
Antrenman
Salon · dambıl, barfiks

┌ BUGÜNKÜ ANTRENMANIN ──────────┐
│ Akıllı Program                │
│ 6 hareket · ~45 dk · Üst vücut│
│ [        BAŞLA        ]       │
└───────────────────────────────┘

PROGRAMLARIN
  Tam Vücut                    →
  İtiş Günü          6 hareket

BÖLGESEL
  [Üst vücut] [Arka vücut] [Bacak] [Kol] [+ Bölge]

┌ Kütüphane · 873 hareket ─────→┐
```

Kritik ayrıntı: **bugünkü antrenman ekranın tepesinde ve doğrudan başlar.**
Program seçmek zorunlu değil.

Dokunuş sayıları:

| Hedef | Bugün | Yeni |
|---|---|---|
| Antrenmana başla | 3 (sekme → programı aç → başlat) | **2** |
| Program seç | 2 | 2 |
| Bölgesel çalışma | 3 | 3 |
| Kütüphaneye gözat | **1** (başlık ikonu) | 2 |
| Bir hareketi bul | arama | arama |
| Profil / ayarlar | **1** | 2 |

Tek geriye gidiş kütüphaneye gözatma. Telafisi: genel arama zaten katalogu
kapsıyor (`lib/global-search.ts:120` her hareket için `view: "library"` +
`exerciseId` üretiyor) ve sonuca dokunmak doğrudan o hareketin detayını
açıyor — yani aranan hareket her ekrandan tek dokunuş + yazı uzaklıkta
kalıyor. Gözatma günlük bir iş değil; oynatıcıya varmak ise günlük.

### 3.3 Bugün ekranı

Mevcut bileşenlerden ne olur:

| Bileşen | Karar |
|---|---|
| `DailyEnergyRing`, `StepCounterCard` | kalır — birincil/ikincil karta ayrılır |
| `TodaysWorkoutCard` | kalır |
| `OutdoorGoalCard` | kalır (ikincil) |
| `HydrationFasting` | su kısmı ayrılıp Bugün'e mini kart olarak çıkar |
| `SleepLogger` özeti | mini kart |
| `QuickActions` | **kalkar** — beş sekmede ayrı bir kısayol şeridi gereksiz |
| `GoalPlanCard` (compact) | İlerleme'ye taşınır |
| `ActivityStreak` | başlık satırına küçülür |
| `StepHistoryCard`, `RouteHistoryCard` | İlerleme'ye taşınır |

**Yeni kavram — günlük görevler.** Brief'teki `✓ 20 dk yürüyüş / ○ 15 dk
egzersiz / ○ akşam tartıl` listesi bugün uygulamada yok. Yeni saf modül:
`lib/daily-tasks.ts` — görevleri plandan, adım hedefinden, su hedefinden ve
tartı ritminden **türetir**, ayrı bir tabloya yazmaz. Tamamlanma mevcut
kayıtlardan okunur (adım sayacı, seans kaydı, ölçüm kaydı).

### 3.4 Renk

Mevcut jeton sistemi (`app/design-tokens.css`) **korunur** — tek kaynak ve
2000+ satırlık stil ona dayanıyor. Brief'in paletiyle karşılaştırma:

| Rol | Brief | Mevcut (koyu) | Öneri |
|---|---|---|---|
| Zemin | `#080A09` | `#0d0f09` (`surface-lowest`) | `#0a0b09`'a çek |
| Yüzey | `#111411` | `#131410` (`surface`) | değişiklik gerekmez |
| Yükseltilmiş | `#181C19` | `#1e201a` (`surface-container`) | hafif nötrleştir |
| Vurgu | `#7CFF6B` | `#d9f76b` | **karar gerekiyor (5.1)** |
| Metin | `#F5F7F5` | `#e3e3d9` | brief'e çek |

Brief'in asıl değerli kısmı hex'ler değil, **kullanım disiplini**: yeşil yalnız
başarı, ilerleme, birincil eylem, aktif durum ve AI vurgusu için. Bu bir jeton
adlandırma kuralına çevrilir (`--hf-accent-*` yalnız bu beş rol için) ve kod
incelemesinde denetlenir.

### 3.5 Tipografi

Uygulama zaten Montserrat (başlık) + Inter (gövde) kullanıyor — brief'in
"sci-fi fonta girme" uyarısıyla uyumlu, değişiklik gerekmiyor.

Eklenecek olan **metrik ölçeği**, çünkü brief'in doğru tespiti şu: fitness
uygulamalarında rakamlar tasarım öğesidir.

```css
--hf-metric-hero: 56px;  /* 6.842 */
--hf-metric-lg: 32px;    /* 94.6 kg */
--hf-metric-md: 20px;    /* mini kart */
```

Hepsinde `font-variant-numeric: tabular-nums` zorunlu — sayaç çalışırken
rakamlar zıplamamalı.

### 3.6 Kart hiyerarşisi

Üç seviye, `components/design` altında tek bileşen:

```tsx
<StatCard level="primary" />   // günün ana hedefi, tam genişlik
<StatCard level="secondary" /> // su, kalori, uyku — iki sütun
<StatCard level="mini" />      // küçük metrikler — üç/dört sütun
```

Bugünkü `StatTile` bunun içine girer. Hiyerarşi olmadan mobil ekran, brief'in
deyimiyle "makyaj yapmış Excel tablosu" oluyor.

### 3.7 Koç sekmesi: sohbetten kontrol katmanına

En büyük işlevsel değişiklik bu. Bugün `AiCoachChat` yüzen bir launcher +
panel ve yalnız metin döndürüyor.

Hedef: yanıt metinle birlikte **eylem** taşısın.

```ts
export type CoachAction =
  | { type: "addToPlan"; workouts: AiWorkout[] }
  | { type: "remind"; at: string; body: string }
  | { type: "createWorkout"; region: string }
  | { type: "suggestMeal"; targetKcal: number }
  | { type: "changeGoal"; goal: string };
```

Uygulanan taşıma biçimi tool-calling DEĞİL: model yanıtının sonuna
` ```hedefit-actions ` etiketli bir JSON bloğu ekler, sunucu onu ayıklar
(`lib/ai/coach-actions.ts`). Gerekçe: uygulama üç farklı uzak sağlayıcıyla ve
bir de cihaz üstü modelle çalışıyor, hepsinin araç çağırma desteği aynı değil.
Blok yoksa ya da bozuksa eylem üretilmez ve kullanıcı normal metni görür —
modelin biçime uymadığı durumda bozulmayan tek davranış bu.

**İki kural pazarlığa kapalı:**

1. **Eylem kullanıcı onayı olmadan uygulanmaz.** Model kendi başına hedef
   değiştiremez, plan yazamaz. Düğme görünür, basan kullanıcıdır.
2. **Yerel yedek yolunda eylem üretilmez.** Cihaz üstü model devreye
   girdiğinde yalnız metin döner; küçük modelin ürettiği yapılandırılmış
   çağrıya güvenilmez. Eylem talimatı o modele hiç gönderilmiyor (her ek
   talimat prefill süresine doğrudan yansıyor).

Uygulamadaki eylemler yalnız GEZİNME yapar: "hedefi düzenle" hedef planı
ekranını açar, hedefi değiştirmez. Kalıcı her değişiklik kullanıcının o
ekranda vereceği ikinci bir karara bağlı.

### 3.8 Onboarding: 15 sorudan 5 ekrana ✅

Bugün: 3 form adımı (profil, ortam, fotoğraf) + 15 soruluk profil testi.
STEP.profile/STEP.place/STEP.photo zaten üç ekrandı ve değiştirilmedi — asıl
şişkinlik on beş soruyu SIRAYLA geçirmeye zorlayan test kısmıydı, kullanıcı
plan görmeden hepsini geçmek zorundaydı.

Soruları silmek risklidir — `history` dizisi plan üretiminin girdisi ve bir
cevap (sakatlık) güvenlikle ilgili: hareket elemesini besliyor. Onun yerine
**soruları SİLMEDEN öne aldık**: veri modeli, index'ler ve
`CURRENT_PROFILE_TEST_VERSION` mekanizması hiç değişmedi.

Uygulanan model (`lib/onboarding-questions.ts` → `ONBOARDING_FLOW`):

1. **Hızlı beşli** — plan üretmeye yeten sorular, akışın en başına alındı:
   hedef, seviye, haftalık gün, seans süresi (= mevcut `REQUIRED_QUESTIONS`),
   + sakatlık/ağrı bölgesi (güvenlik).
2. **Kontrol noktası** — hızlı beşliden hemen sonra gelen ara ekran: *"Planımı
   şimdi kur"* ya da *"Birkaç soru daha cevapla"*. İlkine basmak `createPlan()`'ı
   son sorudaki düğmeyle birebir aynı şekilde çağırır.
3. **Kalan on soru** — ORİJİNAL sırasında, kontrol noktasının ardından. Kullanıcı
   devam etmeyi seçerse hiçbir şey kaybolmaz.

`questionIndex` artık `history` index'i DEĞİL, bu akıştaki KONUMDUR;
`currentQuestion = ONBOARDING_FLOW[questionIndex]` gerçek soruya çevirir. Geri
tuşu (konum − 1) ekstra kod gerekmeden kontrol noktasına da doğru döner —
akışın kendisi bir sıra olduğu için özel durum gerekmedi.

`equipmentText`/`gym` (STEP.place'te toplanan) ile testteki `QUESTION.location`/
`QUESTION.equipment` arasındaki örtüşme **bilinçli olarak dokunulmadı**: ikisi
farklı tüketiciler besliyor (yerel plan vs. `generate-plan` API'sine giden
serbest metin) ve birleştirmek ayrı, daha büyük bir refactor. Not olarak
kalsın.

Risk: az cevapla üretilen plan daha genel olur — plan üretimi zaten eksik
cevaplarda "Belirtilmedi" ile çalışıyordu, bu davranış değişmedi. Karşılığı,
testi yarıda bırakıp hiç plan almayan kullanıcıyı kazanmak. Ölçülebilir:
kontrol noktasında "şimdi kur" oranı.

### 3.9 Mikro animasyon

Brief'in sınırı doğru: konfeti yok. Üç yer yeter — hedef tamamlanınca ilerleme
çubuğu + hafif titreşim (`Haptics` zaten bağımlılıkta), koç önerisi gelince ✦
işaretinin hafif hareketi, kilo girilince grafiğin yeni noktaya animasyonla
gitmesi. Hepsi `prefers-reduced-motion` altında durur — mevcut kural.

---

## 4. Fazlar

Her faz kendi başına sevk edilebilir ve geri alınabilir.

| Faz | İş | Doğrulama | Kullanıcıya görünen |
|---|---|---|---|
| **0** ✅ | `lib/navigation.ts` + 21 test | `tests/navigation.test.mjs` | yok (davranış aynı) |
| **1** ✅ | `NavigationProvider`, geçmiş bağlama, kaydırma, `registerBackButton` | testler + tarayıcıda elle | henüz yok: kabuk bağlanmadı |
| **1.5** ✅ | Kabuğu sağlayıcıya bağla; kaplamalar yığına | 730 test + tarayıcı | **geri tuşu düzelir** |
| **2a** ✅ | Oynatıcının durum makinesi saf indirgeyiciye (`lib/workout-session.ts`) | 18 yeni test | yok (davranış aynı) |
| **2b** | Kalan state'i bağlamlara bölme, `screens/` altına taşıma | mevcut testler | yok |
| **3a** ✅ | 5 sekmeye geçiş, Koç sekmesi, Profil avatarda | kaynak testleri + tarayıcı | **yeni gezinme** |
| **3b** ✅ | Bugün ekranına günün görevleri (`lib/daily-tasks.ts`) | 9 yeni test | **yeni kart** |
| **4a** ✅ | Koyu varsayılan tema, kart hiyerarşisi (StatTile seviyeleri) | tarayıcı | **yeni görünüm** |
| **4b** ✅ | Su/uyku mini kartları + kalan canlı sayaçlara tabular-nums | 6 yeni test | **yeni kart + zıplamayan rakamlar** |
| **5** ✅ | Koç eylemleri: ayrıştırma, prompt, düğmeler, onay | 14 yeni test | **koç aksiyon alır** |
| **6** ✅ | Onboarding: hızlı beşli + kontrol noktası | 7 yeni test | **5 soruda plan kurulabilir** |

Faz 1 tek başına değerli: tasarıma hiç dokunmadan gerçek bir hatayı düzeltiyor.
Sıkışırsak orada durulabilir.

### 4.2 Faz 4b'de yapılanlar

Su ve uyku takibi Bugün ekranına MİNİ KART olarak çıktı (3.3'te söz verilip
tutulmamıştı, bu turda tamamlandı):

- **`HydrationFasting`** artık `compact` prop'u destekliyor: yalnız su
  ilerlemesi, oruç bölümü yok. Dokununca Beslenme'yi açar, hızlı ekleme
  düğmeleri mini kartta YOK — ana ekranda yanlışlıkla su eklemeyi önlemek
  bilinçli bir tercih.
- **`components/SleepSummaryCard.tsx`** (yeni): son gecenin süresi + kaç gece
  kayıtlı olduğu. Dokununca Aktivite'yi açar. Uyku tablosu kurulmamışsa ya da
  hiç kayıt yoksa kart hiç görünmez — `DailyTasksCard`/`OutdoorGoalCard` ile
  aynı "sessizce kaybol" kuralı.

**Kalan canlı sayaçlara `tabular-nums` eklendi**: `.progress-cards`,
`.timer-card` (antrenman oynatıcısının canlı geri sayımı — en yüksek değerli
olanı), `.activity-daily-summaries`, `.monthly-numbers`. `.stats-row` bilerek
atlandı: hiçbir bileşen artık bu sınıfı render etmiyor, ölü CSS.

### 4.1 Faz 3 ve 4a'da yapılanlar

**Alt çubuk beşe indi:** Bugün · Antrenman · Aktivite · Koç · İlerleme. Ortada
yükseltilmiş düğme yok. Koç yüzen panelden kendi sekmesine taşındı
(`AiCoachChat` artık `embedded` kipini destekliyor: başlatıcı ve kapatma
düğmesi olmadan tam sayfa). Profil çubuktan indi, başlıktaki avatardan
açılıyor.

Takvim, kütüphane ve beslenme başlık ikonlarından çıkıp hedef yerlerine
taşındı: Bugün → "Planı gör" (takvim), Bugün → kalori çemberi (beslenme),
Antrenman → Kütüphane satırı. Alt çubukta beş, başlıkta sıfır görünüm ikonu
kaldı. Hiçbir görünüm erişilemez değil; bunu bir test koruyor ve her giriş
noktasını tek tek doğruluyor.

**Bugün ekranına görev listesi geldi** (`lib/daily-tasks.ts` +
`components/DailyTasksCard.tsx`). Görevler TÜRETİLİR, ayrı bir tabloda
tutulmaz: antrenman günü takvim tercihinden, tamamlanma seans kaydından, adım
`daily_steps`'ten, doğa aktivite kayıtlarından, tartılma son ölçümden gelir.
Liste her koşulda en fazla dört madde.

**Koyu tema varsayılan oldu**, açık tema korundu (5.2'deki gerekçe: GPS ekranı
güneş altında kullanılıyor).

**Kart hiyerarşisi** `StatTile`'a girdi: `primary` / `secondary` / `mini`, her
seviyede `tabular-nums` zorunlu.

---

## 5. Senin kararın olan noktalar

### 5.1 Marka yeşili ✅ Onaylandı

Mevcut lime (`#d9f76b`) kalıyor; brief'in `#7CFF6B` önerisi yerine mevcut
markanın *disiplin* kuralı uygulanıyor (3.4: yeşil yalnız başarı, ilerleme,
birincil eylem, aktif durum, AI vurgusu için). Kodda hiçbir renk değişmedi —
zaten değiştirilmemişti, karar yalnız teyit edildi.

### 5.2 Açık tema

Brief koyu-öncelikli. Uygulama şu an sistem tercihini izliyor.

**Önerim:** koyu varsayılan olsun, açık tema **kalsın**. Gerekçe doğrudan
5. maddeyle ilgili: doğada spor teşvik ediliyor ve güneş altında koyu ekran
okunmuyor. GPS ekranını dışarıda kullanacak kullanıcı açık temaya ihtiyaç
duyar.

### 5.3 Beslenme ve profil çubuktan çıksın mı?

*(Karar verildi: Antrenman ayrı sekme, Koç ortada değil, Profil çubuktan
indi.)* Geriye kalan tek soru beslenme: Bugün'deki kalori kartı zaten görünür
ve tek dokunuş uzakta olduğu için ayrı bir sütuna gerek görmüyorum.

### 5.4 Onboarding kısalsın mı? ✅ Uygulandı

Soruları silmeden en gerekli beşini öne aldık, aradan sonra "şimdi kur / devam
et" kontrol noktası eklendi (3.8). Kalan açık soru yalnız ölçüm: kontrol
noktasında "şimdi kur" oranı ne çıkacak, bunu senin kullanıcı verinle görmek
gerekiyor.

### 5.5 Koç eylemleri onay istesin mi?

**Önerim: evet, istisnasız.** Onaysız uygulanan bir "hedefini değiştir"
eylemi geri alınması zor bir hata.

---

## 6. Bu plan neyi kapsamıyor

- Gerçek Next.js rotalarına geçiş (her ekran ayrı URL). Faz 2'den sonra
  mümkün hâle gelir ama Capacitor kabuğu ve paylaşılan durum için ek iş
  gerektirir; şimdilik tek sayfa + geçmiş durumu yeterli.
- Yeni AI yetenekleri (3.7 dışında).
- Mağaza görselleri ve marka varlıklarının yenilenmesi (5.1'e bağlı).
