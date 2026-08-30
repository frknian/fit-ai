package com.hedefit.app.ui.screens

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.DirectionsRun
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SportsGymnastics
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hedefit.app.ui.components.HedefitCard
import com.hedefit.app.ui.theme.HedefitColors

private data class GuideSection(
    val key: String,
    val icon: ImageVector,
    val titleTr: String,
    val titleEn: String,
    val introTr: String,
    val introEn: String,
    val detailsTr: List<String>,
    val detailsEn: List<String>,
)

private val guideSections = listOf(
    GuideSection("profile", Icons.Default.Person, "Profil ve 15 soruluk test", "Profile and 15-question test", "Kişisel programın temelini profil bilgilerin oluşturur.", "Your profile is the foundation of your personal plan.",
        listOf("Profil > 15 soruyu yeniden cevapla bölümünden hedef, deneyim, haftalık gün, süre, ortam, ekipman, ağrı ve tercihlerini güncelle.", "Test kaydedildiğinde OpenAI yanıtlarını birlikte değerlendirir; hareket seçimi yalnız doğrulanmış Hareket Atlası içinden yapılır.", "Hedefin veya ekipmanın değiştiğinde testi yenile. Keskin ya da yeni bir ağrı varsa sakatlık alanını mutlaka güncelle.", "Ad, boy, kilo, yaş ve ölçü birimi ayarları hesaplamaları ve gösterimleri kişiselleştirir."),
        listOf("Use Profile > Answer the 15 questions again to update your goal, experience, weekly availability, session time, environment, equipment, pain and preferences.", "When saved, OpenAI evaluates the answers together; exercises are selected only from the verified Exercise Atlas.", "Retake the test when your goal or equipment changes. Always update the pain field for new or sharp pain.", "Name, height, weight, age and unit settings personalize calculations and displays.")),
    GuideSection("home", Icons.Default.Home, "Ana ekran", "Home", "Günün önemli bilgilerini tek yerde gösterir.", "Shows the most important information for your day.",
        listOf("Sağ üstte, bildirim simgesinin yanındaki takvim düğmesi antrenman takvimini açar; antrenmanını bir güne ve saate buradan planlayabilirsin.", "Hedef yolculuğu kartı mevcut durumunu, hedefini ve tahmini süreni gösterir.", "Rota kartından yürüyüş, koşu veya bisiklet kaydını başlatabilirsin.", "Spor aktivitesi ekle kısayoluyla spor türünü, süreyi, mesafeyi ve spora özel detayları kaydedebilirsin.", "Kalori kutusu alınan ve yakılan kaloriyi aynı boyuttaki kartta ayrı gösterir; dokunarak ayrıntıyı açabilirsin.", "Programlar bölümündeki + düğmesiyle yalnız istediğin programları ana ekranda gösterebilirsin."),
        listOf("The calendar button beside Notifications in the top-right opens the workout calendar; schedule a workout for a day and time there.", "The goal journey card shows your current state, target and estimated timeline.", "Start a walk, run or ride from the Route card.", "Use Log a sport to save duration, distance and sport-specific details.", "The calorie card shows calories in and out separately without changing its size; tap it for details.", "Use + in Programs to choose which programs appear on Home.")),
    GuideSection("workout", Icons.Default.FitnessCenter, "Programlar ve antrenman", "Programs and workouts", "OpenAI programı, bölgesel plan veya kendi programını kullanabilirsin.", "Use an OpenAI plan, a regional plan or your own program.",
        listOf("Antrenman sekmesinde aktif programını seç, yeni program oluştur veya bölgeye göre program üret.", "Hareket Atlası'nın yanındaki Antrenman Ekle kutusu yürüyüş, koşu, yüzme, bisiklet ve diğer program dışı sporları kaydeder.", "Yürüyüş ve koşuda süre-mesafe-eğim; yüzmede süre-mesafe-stil; diğer sporlarda uygun alt tür kullanılır. Aktif kalori MET modeliyle hesaplanır.", "Başla düğmesi set ekranını açar. Her sette kilo, tekrar, süre ve algılanan zorluk bilgilerini kaydedebilirsin.", "Eklenen sporlar ve program antrenmanları İlerleme ekranında süre ve kaloriyle saklanır."),
        listOf("Choose your active plan, create a program or generate a body-part plan in Workout.", "Log activity beside Exercise Atlas records walking, running, swimming, cycling and other sports outside a program.", "Walking and running use duration-distance-incline; swimming uses duration-distance-stroke; other sports use an appropriate subtype. Active calories use the MET model.", "Start opens set tracking. Log weight, repetitions, duration and perceived effort for each set.", "Logged sports and program workouts remain in Progress with duration and calories.")),
    GuideSection("atlas", Icons.Default.SportsGymnastics, "Hareket Atlası", "Exercise Atlas", "Doğrulanmış hareketleri kas, ekipman ve seviyeye göre bul.", "Find verified exercises by muscle, equipment and level.",
        listOf("Arama alanına hareket, kas veya ekipman yazabilirsin.", "Bir hareketi açarak görsellerini, çalıştırdığı kasları, ekipmanı ve uygulama adımlarını incele.", "Atlas içinden hareket seçerek kendi programını oluşturabilir veya aktif programdaki bir hareketi değiştirebilirsin.", "Ağrı hissedilen bir hareketi zorlamadan bırak ve uygun bir alternatif seç."),
        listOf("Search by exercise, muscle or equipment.", "Open an exercise to see images, target muscles, equipment and instructions.", "Select Atlas exercises for your own program or replace an exercise in the active plan.", "Stop any painful movement and choose a suitable alternative.")),
    GuideSection("coach", Icons.Default.AutoAwesome, "Fit Koç ve OpenAI", "Fit Coach and OpenAI", "Antrenman, beslenme ve toparlanma sorularında kişisel destek verir.", "Provides personal help for training, nutrition and recovery.",
        listOf("Fit Koç, profil ve uygulamadaki izinli kayıtlarını kullanarak bağlama uygun yanıt verir.", "Programı aç komutuyla Antrenman sekmesine geçebilirsin; sohbetten program dışı hareket eklenmez.", "Yanıtlar sağlık tanısı değildir. Göğüs ağrısı, bayılma, keskin veya kalıcı ağrıda antrenmanı durdurup sağlık uzmanına başvur.", "Sohbet kullanım hakkı ekranda görünür; sohbeti temizlemek kayıtlı antrenman veya profil verilerini silmez."),
        listOf("Fit Coach uses your profile and permitted app records to provide contextual answers.", "Open plan takes you to Workout; chat cannot add exercises outside the Atlas.", "Responses are not medical diagnoses. Stop and seek professional care for chest pain, fainting, or sharp/persistent pain.", "Usage is shown on screen; clearing chat does not delete your workout or profile data.")),
    GuideSection("nutrition", Icons.Default.Restaurant, "Beslenme ve su", "Nutrition and water", "Öğünlerini, makrolarını ve su tüketimini günlük takip et.", "Track meals, macros and water each day.",
        listOf("Yemek adını veya tarifi yazarak AI ile tahmin oluşturabilir ya da Türkçe adlı besin kataloğunda arayabilirsin.", "Fotoğraf düğmesinden kamera veya galeriyi seç. Tabağın tamamı ve çatal ya da kart gibi bir ölçek referansı daha iyi porsiyon tahmini sağlar.", "Fotoğraf sonucundaki her besinin adını ve gramını kontrol et; miktar değişince makro ve mikro değerler yeniden hesaplanır. Yalnız onayladığın kalemler öğüne eklenir.", "Kayıtları düzenleyebilir, silebilir, favoriye alabilir ve favoriyi tekrar ekleyebilirsin. Tarih seçiciyle geçmiş günleri inceleyebilir, su kartından hedefini yönetebilirsin.", "Fotoğraftan porsiyon ve AI besin değerleri tahmindir; ambalaj etiketi, tartı veya uzman planı varsa onu esas al."),
        listOf("Type a food or recipe for an AI estimate, or search the catalog; food names remain Turkish.", "Use the photo button to choose Camera or Gallery. Showing the full plate and a fork or card as scale improves portion estimation.", "Check every detected food name and gram value. Macro and micronutrients rescale when the amount changes, and only selected items are added.", "Edit, delete, favorite and repeat entries. Use the date picker for past days and manage your water target from the water card.", "Photo portions and AI nutrition values are estimates; prefer a label, scale or professional plan when available.")),
    GuideSection("tasks", Icons.Default.SportsEsports, "Görevler ve başarımlar", "Tasks and achievements", "Her gün değişen görevlerle düzenini güçlendir.", "Build consistency through daily rotating tasks.",
        listOf("Görevler her gün otomatik değişir ve günlük ödülleri toplam 100 XP'dir. Su içme görevi yerine adım, antrenman, uyku, rota ve beslenme kaydı gibi doğrulanabilir görevler kullanılır.", "Uyku görevi, Health Connect'ten eşitlenen en az 7 saatlik uyku verisiyle tamamlanır. Uyanış saati verisi olmayan kaynaklarda görev güvenli biçimde tamamlanmaz.", "24 başarımın her biri 100 XP verir. 300 XP'de günlük +1, 500 XP'de günlük +2 Fit Koç soru hakkı açılır; sonrasında her 250 XP'de bir artar ve +5'te durur.", "Görev ve ödüllerin hesabı sunucuda korunur; aynı aktivite tekrar gönderilse bile XP bir kez yazılır."),
        listOf("Tasks rotate automatically each day and always total 100 daily XP. Instead of a water task, they use verifiable steps, workouts, sleep, routes and nutrition logging.", "The sleep task completes from at least seven hours of sleep synced through Health Connect. A source without wake-time data cannot safely complete a wake-time task.", "Each of the 24 achievements awards 100 XP. At 300 XP you unlock +1 daily Fit Coach question, and at 500 XP +2; it then rises every 250 XP up to +5.", "Tasks and rewards are protected server-side, so a repeated activity cannot write XP twice.")),
    GuideSection("progress", Icons.Default.BarChart, "İlerleme", "Progress", "Antrenman düzenini ve vücut değişimini zaman içinde gör.", "See training consistency and body changes over time.",
        listOf("Haftalık antrenman hedefini belirle ve tamamlanan seanslarını izle.", "Kilo ve vücut ölçülerini tarihli olarak kaydet; grafikler eğilimi gösterir.", "Seri, toplam seans, hacim ve performans özetleri tamamlanan kayıtlardan oluşur.", "Günlük dalgalanmalar yerine birkaç haftalık eğilimi değerlendir."),
        listOf("Set a weekly workout target and track completed sessions.", "Save dated weight and body measurements; charts show the trend.", "Streak, sessions, volume and performance summaries use completed records.", "Judge progress by multi-week trends rather than daily fluctuations.")),
    GuideSection("route", Icons.Default.Map, "Rota ve aktiviteler", "Route and activities", "GPS ile yürüyüş, koşu ve bisiklet aktivitelerini kaydet.", "Record walks, runs and rides with GPS.",
        listOf("Konum iznini ver, aktivite türünü seç ve Başlat'a dokun. Süre, mesafe, tempo/hız ve rota çizgisi canlı güncellenir.", "Duraklat devam ettirir; Bitir aktiviteyi geçmişe kaydeder.", "Arka planda güvenilir kayıt için rota bildirimi açık kalır. GPS doğruluğu kapalı alanlarda düşebilir.", "Kalp atış bandı bağlıysa desteklenen veriler rota ekranında gösterilir. Telefonun pil tasarrufu uzun kaydı etkileyebilir."),
        listOf("Grant location permission, select an activity and tap Start. Time, distance, pace/speed and route update live.", "Pause can resume; Finish saves the activity.", "The route notification stays active for reliable background tracking. GPS may be less accurate indoors.", "Supported heart-rate data appears when a strap is connected. Battery saving may affect long recordings.")),
    GuideSection("notifications", Icons.Default.Notifications, "Bildirimler, widget ve kısayollar", "Notifications, widget and shortcuts", "Uygulamayı açmadan günlük işlerine ulaş.", "Reach daily actions without opening the app first.",
        listOf("Profil > Bildirim takviminden antrenman günlerini ve saatlerini düzenle.", "Yürüyüş veya rota kaydı sırasında kalıcı bildirim üstte kalır; buradan aktivite durumunu görebilirsin.", "Adım sayacı bildirimini Profil'den açıp kapatabilirsin.", "Telefon ana ekranına Hedefit widget'ı ekleyerek adım, su, seri ve sıradaki antrenmanı görebilirsin.", "Profil > Ana ekran kısayolları ile rota, antrenman veya öğün ekleme kısayolu oluştur."),
        listOf("Edit workout days and times in Profile > Notification calendar.", "The ongoing notification remains visible during walking or route recording.", "Enable or disable the step-counter notification in Profile.", "Add the Hedefit widget to see steps, water, streak and the next workout.", "Create route, workout or meal shortcuts from Profile > Home screen shortcuts.")),
    GuideSection("health", Icons.Default.Favorite, "Health Connect", "Health Connect", "Desteklenen sağlık uygulamalarındaki verileri Hedefit ile eşleştir.", "Sync supported health-app data with Hedefit.",
        listOf("Profil > Health Connect üzerinden bağlantıyı başlat ve yalnız paylaşmak istediğin izinleri ver.", "Adım, uyku, kilo ve aktif kalori gibi desteklenen kayıtlar izin verildiğinde eşitlenir.", "Kaynak uygulamanın da Health Connect'e yazma izni olmalıdır. Samsung Health veya Fitbit verisi görünmüyorsa iki taraftaki izinleri kontrol et.", "İzinleri Android ayarlarından istediğin zaman geri çekebilirsin."),
        listOf("Start from Profile > Health Connect and grant only the permissions you want.", "Supported steps, sleep, weight and active calories sync when permitted.", "The source app must also write to Health Connect. Check permissions on both sides if Samsung Health or Fitbit data is missing.", "Revoke permissions anytime in Android settings.")),
    GuideSection("settings", Icons.Default.Settings, "Görünüm ve tercihler", "Appearance and preferences", "Hedefit'i kullanım biçimine göre düzenle.", "Adjust Hedefit to the way you use it.",
        listOf("Açık/koyu tema, vurgu rengi ve Türkçe/İngilizce dilini Profil'den değiştir.", "Metrik veya Imperial ölçü birimini seç; kayıtların temel değeri korunur, yalnız gösterim dönüşür.", "Profil fotoğrafı yüklediğinde görsel kareye kırpılır ve cihazda güvenli önbelleğe alınır.", "Fit Koç adını koç ekranından değiştirebilirsin."),
        listOf("Change light/dark theme, accent color and Turkish/English language in Profile.", "Choose Metric or Imperial units; stored base values remain unchanged while display converts.", "Profile photos are cropped square and securely cached on the device.", "Rename Fit Coach from the coach screen.")),
    GuideSection("sync", Icons.Default.CloudSync, "Çevrimdışı kullanım ve eşitleme", "Offline use and sync", "Bağlantı kesildiğinde desteklenen kayıtlar kaybolmaz.", "Supported entries are not lost when your connection drops.",
        listOf("Antrenman, rota ve bazı beslenme kayıtları ağ yoksa cihazda bekletilir ve bağlantı gelince gönderilir.", "Bekleyen kayıt sayısı uygulamada gösterilebilir. Eşitleme tamamlanmadan uygulama verilerini silme veya hesabı değiştirme.", "OpenAI gerektiren program ve besin analizi internet olmadan güvenli yerel sonuca düşebilir ya da yeniden deneme isteyebilir."),
        listOf("Workouts, routes and some nutrition entries wait on-device when offline and upload later.", "Pending count may appear in the app. Avoid clearing app data or switching accounts before sync completes.", "Features requiring OpenAI may use a safe local fallback or ask you to retry.")),
    GuideSection("privacy", Icons.Default.Security, "Hesap, veri ve gizlilik", "Account, data and privacy", "Verilerin üzerinde kontrol sende kalır.", "You stay in control of your data.",
        listOf("Çıkış yap yalnız bu cihazdaki oturumu kapatır; kayıtlarını silmez.", "İlerlemeyi sıfırla; antrenman, ölçüm, kalori, aktivite ve seri kayıtlarını siler, profil ve programı korur.", "Hesabı dondur verileri koruyarak erişimi duraklatır.", "Hesabı kalıcı sil geri alınamaz; tüm hesap verilerini kaldırır.", "Profil fotoğrafı ve kişisel kayıtlar giriş yapılmış hesabın yetkisiyle saklanır. OpenAI anahtarı telefona konmaz, sunucuda tutulur."),
        listOf("Sign out closes only this device session; it does not delete records.", "Reset progress deletes workout, measurement, calorie, activity and streak history while keeping profile and plans.", "Freeze pauses access while preserving data.", "Delete account is irreversible and removes account data.", "Photos and personal records use authenticated storage. The OpenAI key is never stored on the phone; it remains server-side.")),
    GuideSection("safety", Icons.Default.HealthAndSafety, "Güvenlik ve sorun çözme", "Safety and troubleshooting", "Sorun yaşadığında önce güvenli ve basit kontrolleri yap.", "Start with safe, simple checks when something goes wrong.",
        listOf("Keskin ağrı, baş dönmesi, göğüs ağrısı veya nefes darlığında aktiviteyi durdur ve uygun sağlık desteği al.", "Veri görünmüyorsa interneti, hesap oturumunu, izinleri ve seçili tarihi kontrol et; ardından ekranı yenile.", "GPS sorunu için hassas konumu ve pil kısıtlamalarını; bildirim sorunu için Android bildirim iznini kontrol et.", "Program uygun değilse 15 soruyu yeniden cevapla ve ağrı/ekipman bilgilerini güncelle.", "Uygulama sağlık uzmanı, tanı veya acil yardım hizmetinin yerine geçmez."),
        listOf("Stop and seek appropriate help for sharp pain, dizziness, chest pain or breathing difficulty.", "If data is missing, check internet, session, permissions and selected date, then refresh.", "For GPS issues check precise location and battery restrictions; for notifications check Android permission.", "If a plan does not fit, retake the 15 questions and update pain/equipment details.", "The app does not replace a health professional, diagnosis or emergency service.")),
)

@Composable
fun AppUserGuideScreen(language: String, onBack: () -> Unit) {
    val en = language == "en"
    var query by rememberSaveable { mutableStateOf("") }
    var expandedKey by rememberSaveable { mutableStateOf<String?>("profile") }
    val filtered = remember(query, en) {
        val needle = query.trim().lowercase()
        if (needle.isBlank()) guideSections else guideSections.filter { section ->
            val text = if (en) listOf(section.titleEn, section.introEn) + section.detailsEn else listOf(section.titleTr, section.introTr) + section.detailsTr
            text.joinToString(" ").lowercase().contains(needle)
        }
    }
    Column(Modifier.fillMaxSize().background(HedefitColors.Background)) {
        UtilityHeader(if (en) "User Guide" else "Kullanım Kılavuzu", onBack)
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(18.dp, 10.dp, 18.dp, 36.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                HedefitCard {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (en) "Welcome to Hedefit" else "Hedefit'e hoş geldin", style = MaterialTheme.typography.headlineSmall, color = HedefitColors.Lime)
                        Text(if (en) "Complete your profile, choose a plan, record each workout, log meals and review your progress. This guide explains every feature." else "Profilini tamamla, programını seç, antrenmanlarını kaydet, öğünlerini takip et ve ilerlemeni incele. Bu kılavuz tüm özellikleri açıklar.", color = HedefitColors.TextSecondary)
                        Text(if (en) "Quick start: Profile → 15 questions → Workout → Start → Progress" else "Hızlı başlangıç: Profil → 15 soru → Antrenman → Başla → İlerleme", fontWeight = FontWeight.Bold)
                    }
                }
            }
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it.take(60) },
                    modifier = Modifier.fillMaxWidth(),
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    placeholder = { Text(if (en) "Search the guide" else "Kılavuzda ara") },
                    singleLine = true,
                )
            }
            if (filtered.isEmpty()) item { Text(if (en) "No matching topic." else "Eşleşen konu bulunamadı.", color = HedefitColors.TextSecondary, modifier = Modifier.padding(16.dp)) }
            items(filtered, key = { it.key }) { section ->
                val expanded = expandedKey == section.key || query.isNotBlank()
                HedefitCard(
                    modifier = Modifier.fillMaxWidth().animateContentSize(),
                    onClick = { expandedKey = if (expandedKey == section.key) null else section.key },
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            androidx.compose.foundation.layout.Box(Modifier.size(40.dp).background(HedefitColors.Lime.copy(alpha = .15f), CircleShape), contentAlignment = Alignment.Center) {
                                Icon(section.icon, null, tint = HedefitColors.Lime)
                            }
                            Spacer(Modifier.size(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(if (en) section.titleEn else section.titleTr, style = MaterialTheme.typography.titleMedium)
                                Text(if (en) section.introEn else section.introTr, color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                            }
                            Icon(if (expanded) Icons.Default.ExpandMore else Icons.Default.ChevronRight, null, tint = HedefitColors.TextSecondary)
                        }
                        if (expanded) {
                            Spacer(Modifier.height(2.dp))
                            (if (en) section.detailsEn else section.detailsTr).forEach { detail ->
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                                    Text("•", color = HedefitColors.Lime, fontWeight = FontWeight.Black)
                                    Spacer(Modifier.size(8.dp))
                                    Text(detail, modifier = Modifier.weight(1f), color = HedefitColors.TextSecondary, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
