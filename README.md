<div align="center">

<img src="store-assets/play-icon-512.png" alt="Hedefit" width="112" height="112">

# Hedefit

### Hedefin için fit plan.

Planını sen yazma. Hedefit profilini, ekipmanını ve her antrenmandan sonra
verdiğin geri bildirimi okuyup programını kendisi ayarlar.

**Türkçe** · [English](#hedefit--your-ai-trainer-that-adapts-to-you)

<img src="store-assets/feature-graphic-1024x500.png" alt="Hedefit" width="100%">

<sub>GitHub sosyal önizleme: <code>store-assets/github-social-preview-1280x640.png</code></sub>

</div>

---

## Nedir?

Çoğu fitness uygulaması sana sabit bir program verir ve gerisini sana bırakır.
Hedefit tersini yapar: ilk gün seni tanır, sonra **her antrenmandan sonra
dinler**. Hareket zor geldiyse yükü düşürür, kolay geldiyse artırır, ağrı
bildirdiğin bölgeyi programdan çıkarır.

Yanında bir de beslenme tarafı var — yediğini yazman yeterli, yapay zeka
kalori ve makroları hesaplasın.

## Öne çıkanlar

### Sana özel program, tek seferlik değil
Yaşın, boyun, kilon, hedefin, nerede çalıştığın (ev/salon) ve elindeki ekipmana
göre bir plan üretilir. Sonra bu plan sabit kalmaz: her seansın ardından
sorduğu "nasıldı?" sorusunun cevabına göre set, tekrar ve dinlenme süreleri
kendiliğinden ayarlanır.

### Antrenman oynatıcı
Set ve dinlenme sayaçları, ağırlık · tekrar · zorluk kaydı. Bir önceki
performansına bakıp güvenli bir sonraki adım önerir — ağrı veya yüksek
yorgunluk bildirdiysen **yükü artırmayı reddeder**.

### 873 hareket, hepsi animasyonlu
Her hareketin nasıl yapıldığını gösteren yerel animasyon kareleri, kas grubu ve
ekipman filtreleri, Türkçe hareket ve kas adları.

### Hedefit Rota — canlı GPS takibi
Yürüyüş, koşu ve bisiklet için haritada canlı rota kaydı: mesafe, süre, tempo,
hız ve harcanan kalori. Uygulama arka plana atılsa ya da öldürülse bile
devam eden kayıt kaybolmaz, açıldığında kaldığın yerden geri yüklenir.
Bittiğinde rota görselini paylaşabilirsin.

Bluetooth (BLE) nabız kayışın varsa bağlayıp anlık nabzını da kaydedebilirsin.
GPS'e uygun olmayan sporlar (yüzme, kürek vb.) manuel aktivite günlüğünde kalır.

### Adım sayar
Günlük adımların cihazın kendi sensöründen okunur; Android'de ön plan servisiyle
uygulama kapalıyken de sayılır. Kendi günlük adım hedefini belirleyebilirsin.

### AI kalori takibi
- **Yazarak** — yemek adını ve tarttığın gramajı gir; yapay zeka porsiyonun
  kalori, protein, karbonhidrat, yağ ve lif değerlerini hesaplasın
- **AI beslenme önerisi** — kalan kalori ve makro hedefine göre öğün önerisi al

### İlerlemeni gör
Vücut ölçümleri ve trend grafikleri, tahmini 1RM ile kişisel rekorlar, günlük
seri takibi, adım geçmişi, kaydedilmiş rotaların haritalı geçmişi,
koşu/yürüyüş/bisiklet/yüzme gibi aktivite kayıtları ve haftalık yapay zeka
değerlendirmesi.

### Doğada spor
Ana sayfadaki "Bu hafta doğada" kartı haftalık açık hava süreni gösterir,
hedefe kalanı söyler ve tek dokunuşla Hedefit Rota'yı başlatır. Açık havada
geçirdiğin her hafta bir rozet kazandırır (tohum → filiz → ağaç → orman) ve
üst üste tutturulan haftalar seri olarak sayılır.

### Uyku kaydı
Kaç saat uyuduğunu aktivite sekmesinden gir — doğrudan saat/dakika olarak ya da
yatış ve kalkış saatinden hesaplatarak. Son yedi gecenin ortalamasını ve
kaçının önerilen 7–9 saat aralığında kaldığını görürsün.

### Günlük hatırlatmalar
Her sabah seçtiğin saatte bir selam: o gün antrenman günüyse hatırlatır,
değilse hareketli kalmayı önerir; isteğe bağlı su ve doğa önerileri ekler.
Ayarlardan açılır, saati ve içeriği oradan seçilir.

### Kullanma kılavuzu
İlk kayıttan sonra uygulama aşama aşama tanıtılır; sonrasında Ayarlar →
"Uygulamayı tanı" ile istediğin zaman geri dönebilirsin.

### AI koç sohbeti
Programın, hareketlerin veya beslenmen hakkında soru sor. Koç senin profilini
ve planını bilerek cevaplar.

Koç zamanla seni tanır: sohbette belirttiğin kalıcı tercihler (sevmediğin
hareketler, ekipmanın, antrenman saatin) hesabına kaydedilir ve sonraki
önerileri şekillendirir. Bu kayıtları görebilir ve silebilirsin.

Kalori, kilo ve ilerleme sayıları **yapay zekâya hesaplatılmaz** — kendi
sunucumuzda hesaplanır, model yalnızca sonucu anlatır. Sağlayıcı geçici olarak
yanıt veremezse koç, verilerine dayanan güvenli bir yerel öneriyle cevap verir
ve günlük AI hakkın iade edilir.

Mimari ayrıntı: [docs/AI_MIGRATION_PLAN.md](docs/AI_MIGRATION_PLAN.md) ·
model/çalışma zamanı kararı: [docs/AI_MODEL_DECISION.md](docs/AI_MODEL_DECISION.md)

### Ayrıntılar
Açık ve koyu tema · kg/lb birim tercihi · antrenman takvimi ve hatırlatıcılar ·
Türkçe ve İngilizce · tüm verilerini tek JSON dosyası olarak indirme

## Sürümler

| | Ücretsiz | Premium |
|---|---|---|
| Antrenman planı, oynatıcı, hareket kütüphanesi | ✔ | ✔ |
| Manuel öğün kaydı ve makro takibi | ✔ | ✔ |
| Ölçümler, rekorlar, seri, takvim | ✔ | ✔ |
| Hedefit Rota, adım sayar, aktivite günlüğü | ✔ | ✔ |
| AI koç sohbeti | günde 5 mesaj | sınırsız |
| Yazarak AI besin tahmini | günde 3 | sınırsız |
| AI beslenme önerisi | günde 5 | sınırsız |
| Haftalık AI değerlendirmesi | 2 haftada 1 | her hafta |
| Planı AI ile yeniden düzenleme | günde 3 | sınırsız |

Premium: **₺89/ay** veya **₺799/yıl**.

> Ödeme altyapısı henüz açılmadı; premium erişim şimdilik iletişim yoluyla
> veriliyor.

Ücretsiz kullanıcı günlük AI hakkını doldurduğunda, isterse kısa bir ödüllü
reklam izleyip o gün için ekstra hak kazanabilir (bkz. Gizliliğin bölümü).

## Gizliliğin

- **Konumun yalnızca senin kaydettiğin rota içindir.** Hedefit Rota'yı
  başlattığında GPS izni istenir; kayıt bittiğinde rota tek bir kodlanmış
  çizgi olarak yalnızca senin hesabına yazılır (satır bazlı erişim kuralları
  ile korunur), üçüncü taraflara gönderilmez. Rotayı silebilir, izni
  reddedersen uygulamanın geri kalanını kullanmaya devam edebilirsin.
- **Reklam yalnızca isteğe bağlı.** Ücretsiz kullanıcı, günlük AI hakkı dolduğunda isterse
  ödüllü bir reklam (Google AdMob) izleyerek ekstra hak kazanabilir; sürekli görünen banner
  veya interstitial reklam yoktur. AdMob, reklam kimliği gibi verileri Google'ın kendi
  gizlilik politikası kapsamında işler.
- **Hesabın senin.** Uygulama içinden dondurabilir, tüm verini indirebilir, ilerlemeni
  sıfırlayabilir veya hesabını kalıcı olarak silebilirsin.

Ayrıntılar: [Gizlilik Politikası](store-assets/GIZLILIK-POLITIKASI.md)

## Platformlar

Web tarayıcısı · Android · iOS

> Uygulama henüz Google Play ve App Store'da yayında değil.

## Sağlık uyarısı

Hedefit tıbbi bir cihaz değildir. Ürettiği plan, kalori hedefi ve
değerlendirmeler tıbbi teşhis, tedavi veya beslenme reçetesi yerine geçmez.
Hamilelik, emzirme, yeme bozukluğu öyküsü, diyabet, kalp veya böbrek
rahatsızlığı gibi durumlarda uygulamayı kullanmadan önce bir sağlık uzmanına
danışın. Antrenman sırasında keskin ağrı, göğüs ağrısı veya baş dönmesi
yaşarsanız durun ve hekime başvurun.

<br>

---

<div align="center">

<img src="store-assets/play-icon-512.png" alt="Hedefit" width="112" height="112">

# Hedefit — your AI trainer that adapts to you

Stop writing your own program. Hedefit reads your profile, your equipment and
the feedback you give after every session, then adjusts the plan itself.

[Türkçe](#hedefit) · **English**

</div>

---

## What is it?

Most fitness apps hand you a fixed program and leave the rest to you. Hedefit
does the opposite: it gets to know you on day one, then **listens after every
workout**. Too hard, and it backs the load off. Too easy, and it pushes. Report
pain somewhere, and it routes around that area.

There's a nutrition side too — enter the food name and measured weight, and the
AI estimates calories and macros for that portion.

## Highlights

### A program built for you, and rebuilt as you go
Your age, height, weight, goal, training place (home/gym) and available
equipment shape the initial plan. It doesn't stay fixed: the "how did that
feel?" question after each session drives automatic changes to sets, reps and
rest.

### Workout player
Set and rest timers, weight · reps · effort logging. It reads your last
performance to suggest a safe next step — and **refuses to raise the load** if
you reported pain or high fatigue.

### 873 exercises, all animated
Local animation frames showing how each move is performed, filters by muscle
group and equipment, exercise and muscle names in both languages.

### Hedefit Rota — live GPS tracking
Live route recording on a map for walking, running and cycling: distance,
duration, pace, speed and calories burned. An in-progress recording survives
the app being backgrounded or killed — it is restored where you left off. When
you finish, you can share the route image.

Pair a Bluetooth (BLE) heart rate strap to record live BPM alongside it.
Sports GPS can't measure (swimming, rowing and the like) stay in the manual
activity log.

### Step counter
Daily steps are read from the device's own sensor; on Android a foreground
service keeps counting while the app is closed. You set your own daily goal.

### AI calorie tracking
- **Text** — enter the food name and measured weight; AI estimates calories,
  protein, carbohydrates, fat and fiber for that portion
- **AI meal suggestion** — get a meal idea that fits your remaining calorie and
  macro budget

### Watch yourself progress
Body measurements with trend charts, personal records via estimated 1RM, daily
streaks, step history, a mapped history of your recorded routes, activity
logging for running, walking, cycling and swimming, and a weekly AI review.

### Training outdoors
The "Outdoors this week" card on the home screen shows your weekly outdoor
minutes, tells you what is left to the goal and starts Hedefit Rota in one tap.
Every week outdoors earns a badge (seed → sprout → tree → forest), and
consecutive weeks count as a streak.

### Sleep log
Enter how long you slept from the activity tab — either as hours and minutes or
by letting bedtime and wake-up time calculate it. You see the average of the
last seven nights and how many of them stayed in the recommended 7–9 hour range.

### Daily reminders
A greeting every morning at the time you choose: it reminds you when it is a
training day and suggests staying active when it is not, plus optional hydration
and outdoor tips. Turn it on in Settings and pick the time and content there.

### User guide
The app introduces itself step by step after you first sign up; afterwards you
can reopen it any time from Settings → "Get to know the app".

### AI coach chat
Ask about your program, a specific movement, or your nutrition. The coach
answers knowing your profile and your plan.

The coach gets to know you over time: lasting preferences you mention in chat
(exercises you dislike, your equipment, when you train) are saved to your
account and shape later advice. You can review and delete these.

Calorie, weight and progress numbers are **never calculated by the AI** — they
are computed on our own server, and the model only explains the result. If the
provider is temporarily unavailable, the coach falls back to a safe local
suggestion based on your data, and your daily AI quota is refunded.

### Details
Light and dark themes · kg/lb preference · workout calendar and reminders ·
Turkish and English · export all your data as a single JSON file ·
profile and settings on separate pages (identity and measurements in the
profile; preferences, notifications, data and account in settings)

## Plans

| | Free | Premium |
|---|---|---|
| Training plan, player, exercise library | ✔ | ✔ |
| Manual meal and macro tracking | ✔ | ✔ |
| Measurements, records, streaks, calendar | ✔ | ✔ |
| Hedefit Rota, step counter, activity log | ✔ | ✔ |
| AI coach chat | 5 messages/day | unlimited |
| AI nutrition estimate from text | 3/day | unlimited |
| AI meal suggestion | 5/day | unlimited |
| Weekly AI review | every 2 weeks | every week |
| AI plan regeneration | 3/day | unlimited |

Premium: **₺89/month** or **₺799/year** in Türkiye.

> Payments aren't live yet; premium access is currently granted on request.

Free users who hit their daily AI limit can optionally watch a short rewarded
ad for one extra use that day (see Your privacy below).

## Your privacy

- **Location is only for the route you record.** GPS permission is requested
  when you start Hedefit Rota; when the recording ends the route is stored as a
  single encoded line on your account alone (protected by row-level access
  rules) and never sent to third parties. You can delete a route, and if you
  decline the permission the rest of the app keeps working.
- **Ads are opt-in only.** When a free user hits their daily AI limit, they can choose to
  watch a rewarded ad (Google AdMob) for extra usage; there are no always-on banner or
  interstitial ads. AdMob processes data like the advertising ID under Google's own
  privacy policy.
- **The account is yours.** Freeze it, export everything, reset your progress, or
  delete it permanently — all from inside the app.

Details: [Privacy Policy](store-assets/GIZLILIK-POLITIKASI.md) (Turkish)

## Platforms

Web browser · Android · iOS

> Not yet published on Google Play or the App Store.

## Health notice

Hedefit is not a medical device. The plans, calorie targets and reviews it
produces are not a substitute for medical diagnosis, treatment or a prescribed
diet. If you are pregnant or breastfeeding, have a history of eating disorders,
or live with diabetes, heart or kidney conditions, consult a health
professional before using it. Stop and seek medical help if you experience
sharp pain, chest pain or dizziness while training.

<br>

---

<div align="center">

**Geliştirici misin?** Kurulum, mimari ve dağıtım için → [docs/GELISTIRME.md](docs/GELISTIRME.md)<br>
**Building on this?** Setup, architecture and deployment → [docs/GELISTIRME.md](docs/GELISTIRME.md)

<sub>Hareket verisi <a href="https://github.com/yuhonas/free-exercise-db">free-exercise-db</a> (Unlicense) kaynağından türetilmiştir.</sub>

</div>
