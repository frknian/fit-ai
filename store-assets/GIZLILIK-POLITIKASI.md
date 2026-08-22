# Hedefit Gizlilik Politikası

**Son güncelleme:** 21 Ağustos 2026

> Bu metin `/gizlilik` adresinde (app/gizlilik/page.tsx) canlı olarak yayınlanır —
> kalıcı prod domain bağlandığında Play Console'a o adresin `/gizlilik` yolu
> verilmelidir. Bu dosya kaynak referansı olarak kalır; asıl güncelleme
> app/gizlilik/page.tsx üzerinden yapılmalıdır.

## 1. Veri sorumlusu

Hedefit uygulamasını **Furkan İnan** işletir (Türkiye). Sorularınız için:
**furkaninanjob@gmail.com**

## 2. Topladığımız veriler

Uygulama yalnızca hizmeti sunmak için gereken verileri toplar. Tüm veriler
hesabınıza bağlıdır ve başka kullanıcılar tarafından görülemez.

### 2.1 Hesap bilgileri
- E-posta adresi (kimlik doğrulama)
- Şifre (Supabase Auth tarafından karma/hash olarak saklanır; biz düz metin
  şifrenizi görmeyiz)
- Google ile giriş yaparsanız Google hesabınızın temel kimlik bilgisi

### 2.2 Sağlık ve fitness verileri
Play Console veri güvenliği sınıflandırmasında **"Sağlık ve fitness"**
kategorisine girer:
- Doğum tarihi, cinsiyet, boy, kilo
- Vücut ölçümleri (bel, kalça, göğüs, kol, bacak)
- Antrenman kayıtları: tamamlanan hareketler, set/tekrar/ağırlık, süre,
  algılanan zorluk, yorgunluk düzeyi ve bildirdiğiniz ağrı bölgeleri
- Aktivite kayıtları (yürüyüş, koşu, bisiklet vb.: süre, mesafe, adım)
- Beslenme kayıtları: yediğiniz besinler, porsiyon, kalori ve makro değerleri
- Uyku kayıtları: kendi girdiğiniz uyku süresi, yatış/kalkış saati, uyku
  kalitesi değerlendirmeniz ve notunuz (yalnızca elle girilir; cihazın uyku
  ölçümü okunmaz)
- Hedefleriniz ve profil testi cevaplarınız

### 2.3 Fotoğraflar
- **İsteğe bağlı vücut fotoğrafı:** Program kişiselleştirmesi için
  gönderebilirsiniz. Zorunlu değildir; plan üretilirken yapay zeka
  sağlayıcımıza iletilir ve sunucularımızda saklanmaz.
- **Profil fotoğrafı:** Yüklerseniz özel (public olmayan) depolamada tutulur ve
  yalnızca kısa süreli imzalı bağlantıyla size gösterilir.

### 2.4 Cihaz izinleri

Aşağıdaki izinlerin tamamı isteğe bağlıdır ve yalnızca ilgili özelliği ilk
kullandığınızda istenir. Reddederseniz uygulamanın geri kalanı çalışmaya devam
eder.

- **Kamera ve fotoğraf arşivi:** isteğe bağlı vücut fotoğrafı ile profil
  fotoğrafı çekme veya seçme
- **Konum (GPS):** Hedefit Rota ile yürüyüş, koşu ve bisiklet aktivitelerinde
  rotanızı, mesafenizi ve tempinizi kaydetmek. Ekran kapalıyken veya uygulama
  arka plandayken kaydın kesilmemesi için arka plan konum izni de istenir;
  konum yalnızca siz bir kayıt başlattığınızda okunur.
- **Hareket ve aktivite tanıma:** günlük adım sayınızı cihazın kendi
  sensöründen okumak. Android'de uygulama kapalıyken de sayabilmek için bir ön
  plan servisi (kalıcı bildirimle) çalışır.
- **Sağlık verisi (adım okuma):** iOS Sağlık ve Android Health Connect
  üzerinden yalnızca adım sayınız okunur; bu servislere veri yazılmaz.
- **Bluetooth:** isteğe bağlı nabız kayışınıza bağlanıp canlı nabzınızı
  göstermek ve aktiviteye kaydetmek
- **Bildirimler:** antrenman hatırlatmaları
- **Saat dilimi:** hatırlatmaların doğru saatte gelmesi için cihazınızın saat
  dilimi okunur ve kaydedilir

### 2.5 Konum ve rota verisi

Hedefit Rota ile kaydettiğiniz aktivitenin GPS noktaları, kayıt bittiğinde tek
bir kodlanmış çizgi (polyline) olarak hesabınıza yazılır. Bu veri satır bazlı
erişim kurallarıyla korunur: yalnızca siz okuyabilirsiniz. Rota verisi yapay
zeka sağlayıcısına, reklam ağına veya başka bir üçüncü tarafa gönderilmez ve
pazarlama amacıyla kullanılmaz. Bir aktiviteyi sildiğinizde rotası da silinir.
Rotanızın görselini paylaşmayı yalnızca siz seçersiniz; paylaşım cihazınızın
kendi paylaşım menüsüyle yapılır.

## 3. Verileri neden işliyoruz

- Kişisel antrenman ve beslenme planı üretmek
- İlerlemenizi zaman içinde takip etmek ve göstermek
- Kaydettiğiniz rotayı, günlük adım sayınızı ve aktivite geçmişinizi size geri
  göstermek
- Antrenman hatırlatmaları göndermek
- Hesabınızı güvenli tutmak (e-posta doğrulama, oturum yönetimi)

Verilerinizi satmıyoruz. Ücretsiz plandaki bir kullanıcı, günlük AI hakkı
dolduğunda **isteğe bağlı olarak** ödüllü bir reklam izleyip ekstra hak
kazanabilir; bunun dışında uygulamada sürekli görünen banner/interstitial
reklam yoktur. Bu reklamlar Google AdMob üzerinden gösterilir (bkz. Bölüm 4).

## 4. Üçüncü taraf hizmetler

| Hizmet | Amaç | Paylaşılan veri |
|---|---|---|
| Supabase | Hesap, veritabanı ve dosya depolama | Bölüm 2'deki tüm veriler |
| AI sağlayıcısı (Moonshot AI, Kimi modelleri) | Plan üretimi, yazdığınız besinin kalori/makro tahmini, koç sohbeti, haftalık değerlendirme | Anonim profil özeti, gönderdiyseniz isteğe bağlı vücut fotoğrafı, yazdığınız besin adı ve gramajı, sohbet mesajları. Konum ve rota verisi gönderilmez. Kimlik bilgileriniz (e-posta, ad) gönderilmez. |
| Google AdMob | Yalnızca ücretsiz plandaki kullanıcının kendi isteğiyle izlediği ödüllü reklam | Reklam kimliği ve cihaz/reklam etkileşim verileri; Google'ın kendi gizlilik politikasına tabidir |

## 5. Saklama ve silme

- Veriler siz silene kadar saklanır.
- **Hesabınızı uygulama içinden kalıcı olarak silebilirsiniz:**
  Profilim → Hesap yönetimi → Hesabı sil. Bu işlem profilinizi, antrenman,
  ölçüm, beslenme ve tüm diğer kayıtlarınızı geri alınamaz biçimde kaldırır.
- **Hesabı dondurma** seçeneği verilerinizi korur ve erişimi geçici durdurur.
- **Verilerinizi dışa aktarma:** Profilim → Verilerin → JSON olarak indir.

## 6. Güvenlik

- Tüm trafik HTTPS üzerinden şifrelenir.
- Veritabanında satır düzeyi güvenlik (RLS) etkindir: her kullanıcı yalnızca
  kendi kayıtlarına erişebilir.
- API uç noktaları kimlik doğrulaması ve hız sınırı ile korunur.
- Profil fotoğrafları herkese açık olmayan depoda tutulur.

## 7. Çocuklar

Uygulama 13 yaşın altındaki çocuklara yönelik değildir ve bilerek onlardan veri
toplamayız.

## 8. Sağlık uyarısı

Hedefit tıbbi cihaz değildir. Ürettiği plan, kalori hedefi ve değerlendirmeler
tıbbi teşhis, tedavi veya beslenme reçetesi yerine geçmez. Hamilelik, emzirme,
yeme bozukluğu öyküsü, diyabet, kalp veya böbrek rahatsızlığı gibi durumlarda
uygulamayı kullanmadan önce bir sağlık uzmanına danışın. Antrenman sırasında
keskin ağrı, göğüs ağrısı veya baş dönmesi yaşarsanız durun ve hekime başvurun.

## 9. Haklarınız

KVKK ve GDPR kapsamında verilerinize erişme, düzeltme, silme ve taşıma
haklarına sahipsiniz. Erişim ve silme işlemlerini uygulama içinden doğrudan
yapabilirsiniz; diğer talepler için **furkaninanjob@gmail.com** adresine yazın.

## 10. Değişiklikler

Bu politikada değişiklik yaparsak güncel sürümü bu adreste yayınlar ve
"Son güncelleme" tarihini değiştiririz.
