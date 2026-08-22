import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gizlilik Politikası — Hedefit",
  description: "Hedefit uygulamasının gizlilik politikası.",
};

const KURUM_ADI = "Furkan İnan";
const ILETISIM_EPOSTASI = "furkaninanjob@gmail.com";
const VERI_SORUMLUSU_ADRESI = "Türkiye";

export default function GizlilikPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        Hedefit Gizlilik Politikası
      </h1>
      <p className="mb-8 text-sm text-neutral-500">Son güncelleme: 21 Ağustos 2026</p>

      <Section title="1. Veri sorumlusu">
        <p>
          Hedefit uygulamasını <strong>{KURUM_ADI}</strong> işletir ({VERI_SORUMLUSU_ADRESI}).
          Sorularınız için: <strong>{ILETISIM_EPOSTASI}</strong>
        </p>
      </Section>

      <Section title="2. Topladığımız veriler">
        <p>
          Uygulama yalnızca hizmeti sunmak için gereken verileri toplar. Tüm veriler hesabınıza
          bağlıdır ve başka kullanıcılar tarafından görülemez.
        </p>

        <h3 className="mt-4 mb-1 font-medium">2.1 Hesap bilgileri</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>E-posta adresi (kimlik doğrulama)</li>
          <li>
            Şifre (Supabase Auth tarafından karma/hash olarak saklanır; biz düz metin şifrenizi
            görmeyiz)
          </li>
          <li>Google ile giriş yaparsanız Google hesabınızın temel kimlik bilgisi</li>
        </ul>

        <h3 className="mt-4 mb-1 font-medium">2.2 Sağlık ve fitness verileri</h3>
        <p className="mb-1">
          Play Console veri güvenliği sınıflandırmasında <strong>&quot;Sağlık ve fitness&quot;</strong>{" "}
          kategorisine girer:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Doğum tarihi, cinsiyet, boy, kilo</li>
          <li>Vücut ölçümleri (bel, kalça, göğüs, kol, bacak)</li>
          <li>
            Antrenman kayıtları: tamamlanan hareketler, set/tekrar/ağırlık, süre, algılanan
            zorluk, yorgunluk düzeyi ve bildirdiğiniz ağrı bölgeleri
          </li>
          <li>Aktivite kayıtları (yürüyüş, koşu, bisiklet vb.: süre, mesafe, adım)</li>
          <li>Beslenme kayıtları: yediğiniz besinler, porsiyon, kalori ve makro değerleri</li>
          <li>Uyku kayıtları: kendi girdiğiniz uyku süresi, yatış/kalkış saati, uyku kalitesi değerlendirmeniz ve notunuz (yalnızca elle girilir; cihazın uyku ölçümü okunmaz)</li>
          <li>Hedefleriniz ve profil testi cevaplarınız</li>
        </ul>

        <h3 className="mt-4 mb-1 font-medium">2.2.1 AI koç hafızası ve geri bildirimi</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Koç hafızası:</strong> Sohbet sırasında belirttiğiniz kalıcı tercihler
            (ör. &quot;koşmayı sevmiyorum&quot;, &quot;akşam antrenmanı tercih ediyorum&quot;,
            ekipman ve sakatlık kısıtları) hesabınıza bağlı olarak saklanır; böylece koç
            önerilerini bunlara göre şekillendirir. Sohbetlerinizin tamamı değil, yalnızca
            bu kısa tercih kayıtları tutulur. Bunları uygulama içinden görebilir ve
            silebilirsiniz.
          </li>
          <li>
            <strong>Yanıt geri bildirimi:</strong> Bir koç yanıtına 👍/👎 verdiğinizde
            yalnızca oyunuz ve yanıtı üreten teknik bilgi (sağlayıcı, model, sürüm)
            saklanır. <strong>Mesaj metni bu kayda dahil edilmez.</strong>
          </li>
          <li>
            <strong>Teknik ölçümler:</strong> Hangi AI sağlayıcısının kullanıldığı, yanıt
            süresi ve hata türü kaydedilir. Bu kayıtlarda istek veya yanıt metni
            <strong> bulunmaz</strong>.
          </li>
        </ul>

        <h3 className="mt-4 mb-1 font-medium">2.3 Fotoğraflar</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>İsteğe bağlı vücut fotoğrafı:</strong> Program kişiselleştirmesi için
            gönderebilirsiniz. Zorunlu değildir; plan üretilirken yapay zeka sağlayıcımıza
            iletilir ve sunucularımızda saklanmaz.
          </li>
          <li>
            <strong>Profil fotoğrafı:</strong> Yüklerseniz özel (public olmayan) depolamada
            tutulur ve yalnızca kısa süreli imzalı bağlantıyla size gösterilir.
          </li>
        </ul>

        <h3 className="mt-4 mb-1 font-medium">2.4 Cihaz izinleri</h3>
        <p className="mb-2">
          Aşağıdaki izinlerin tamamı isteğe bağlıdır ve yalnızca ilgili özelliği ilk
          kullandığınızda istenir. Reddederseniz uygulamanın geri kalanı çalışmaya devam eder.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Kamera ve fotoğraf arşivi:</strong> isteğe bağlı vücut fotoğrafı ile profil
            fotoğrafı çekme veya seçme
          </li>
          <li>
            <strong>Konum (GPS):</strong> Hedefit Rota ile yürüyüş, koşu ve bisiklet
            aktivitelerinde rotanızı, mesafenizi ve tempinizi kaydetmek. Ekran kapalıyken veya
            uygulama arka plandayken kaydın kesilmemesi için arka plan konum izni de istenir;
            konum yalnızca siz bir kayıt başlattığınızda okunur.
          </li>
          <li>
            <strong>Hareket ve aktivite tanıma:</strong> günlük adım sayınızı cihazın kendi
            sensöründen okumak. Android&apos;de uygulama kapalıyken de sayabilmek için bir ön
            plan servisi (kalıcı bildirimle) çalışır.
          </li>
          <li>
            <strong>Sağlık verisi (adım okuma):</strong> iOS Sağlık ve Android Health Connect
            üzerinden yalnızca adım sayınız okunur; bu servislere veri yazılmaz.
          </li>
          <li>
            <strong>Bluetooth:</strong> isteğe bağlı nabız kayışınıza bağlanıp canlı nabzınızı
            göstermek ve aktiviteye kaydetmek
          </li>
          <li>
            <strong>Bildirimler:</strong> antrenman hatırlatmaları
          </li>
          <li>
            <strong>Saat dilimi:</strong> hatırlatmaların doğru saatte gelmesi için cihazınızın
            saat dilimi okunur ve kaydedilir
          </li>
        </ul>

        <h3 className="mt-4 mb-1 font-medium">2.5 Konum ve rota verisi</h3>
        <p>
          Hedefit Rota ile kaydettiğiniz aktivitenin GPS noktaları, kayıt bittiğinde tek bir
          kodlanmış çizgi (polyline) olarak hesabınıza yazılır. Bu veri satır bazlı erişim
          kurallarıyla korunur: yalnızca siz okuyabilirsiniz. Rota verisi yapay zeka
          sağlayıcısına, reklam ağına veya başka bir üçüncü tarafa gönderilmez ve
          pazarlama amacıyla kullanılmaz. Bir aktiviteyi sildiğinizde rotası da silinir.
          Rotanızın görselini paylaşmayı yalnızca siz seçersiniz; paylaşım cihazınızın kendi
          paylaşım menüsüyle yapılır.
        </p>
      </Section>

      <Section title="3. Verileri neden işliyoruz">
        <ul className="list-disc space-y-1 pl-5">
          <li>Kişisel antrenman ve beslenme planı üretmek</li>
          <li>İlerlemenizi zaman içinde takip etmek ve göstermek</li>
          <li>
            Kaydettiğiniz rotayı, günlük adım sayınızı ve aktivite geçmişinizi size geri
            göstermek
          </li>
          <li>Antrenman hatırlatmaları göndermek</li>
          <li>Hesabınızı güvenli tutmak (e-posta doğrulama, oturum yönetimi)</li>
        </ul>
        <p className="mt-2">
          Verilerinizi satmıyoruz. Ücretsiz plandaki bir kullanıcı, günlük AI hakkı dolduğunda
          isteğe bağlı olarak ödüllü bir reklam izleyip ekstra hak kazanabilir; bunun dışında
          uygulamada sürekli görünen banner/interstitial reklam yoktur. Bu reklamlar Google AdMob
          üzerinden gösterilir (bkz. Bölüm 4).
        </p>
      </Section>

      <Section title="4. Üçüncü taraf hizmetler">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
                <th className="py-2 pr-3 font-medium">Hizmet</th>
                <th className="py-2 pr-3 font-medium">Amaç</th>
                <th className="py-2 font-medium">Paylaşılan veri</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-200 align-top dark:border-neutral-800">
                <td className="py-2 pr-3">Supabase</td>
                <td className="py-2 pr-3">Hesap, veritabanı ve dosya depolama</td>
                <td className="py-2">Bölüm 2&apos;deki tüm veriler</td>
              </tr>
              <tr className="border-b border-neutral-200 align-top dark:border-neutral-800">
                <td className="py-2 pr-3">AI sağlayıcısı (Moonshot AI, Kimi modelleri)</td>
                <td className="py-2 pr-3">
                  Plan üretimi, yazdığınız besinin kalori/makro tahmini, koç sohbeti, haftalık
                  değerlendirme
                </td>
                <td className="py-2">
                  Anonim profil özeti, gönderdiyseniz isteğe bağlı vücut fotoğrafı, yazdığınız
                  besin adı ve gramajı, sohbet mesajları. Konum ve rota verisi
                  gönderilmez. Kimlik bilgileriniz
                  (e-posta, ad) gönderilmez. Kalori, kilo ve ilerleme hesapları AI
                  sağlayıcısına yaptırılmaz; kendi sunucumuzda hesaplanır. Acil sağlık
                  belirtisi içeren mesajlar AI sağlayıcısına hiç gönderilmez.
                </td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3">Google AdMob</td>
                <td className="py-2 pr-3">
                  Yalnızca ücretsiz plandaki kullanıcının kendi isteğiyle izlediği ödüllü reklam
                </td>
                <td className="py-2">
                  Reklam kimliği ve cihaz/reklam etkileşim verileri; Google&apos;ın kendi
                  gizlilik politikasına tabidir
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="5. Saklama ve silme">
        <ul className="list-disc space-y-1 pl-5">
          <li>Veriler siz silene kadar saklanır.</li>
          <li>
            <strong>Hesabınızı uygulama içinden kalıcı olarak silebilirsiniz:</strong> Profilim →
            Hesap yönetimi → Hesabı sil. Bu işlem profilinizi, antrenman, ölçüm, beslenme ve tüm
            diğer kayıtlarınızı geri alınamaz biçimde kaldırır.
          </li>
          <li>
            <strong>Hesabı dondurma</strong> seçeneği verilerinizi korur ve erişimi geçici
            durdurur.
          </li>
          <li>
            <strong>Verilerinizi dışa aktarma:</strong> Profilim → Verilerin → JSON olarak indir.
          </li>
        </ul>
      </Section>

      <Section title="6. Güvenlik">
        <ul className="list-disc space-y-1 pl-5">
          <li>Tüm trafik HTTPS üzerinden şifrelenir.</li>
          <li>
            Veritabanında satır düzeyi güvenlik (RLS) etkindir: her kullanıcı yalnızca kendi
            kayıtlarına erişebilir.
          </li>
          <li>API uç noktaları kimlik doğrulaması ve hız sınırı ile korunur.</li>
          <li>Profil fotoğrafları herkese açık olmayan depoda tutulur.</li>
        </ul>
      </Section>

      <Section title="7. Çocuklar">
        <p>
          Uygulama 13 yaşın altındaki çocuklara yönelik değildir ve bilerek onlardan veri
          toplamayız.
        </p>
      </Section>

      <Section title="8. Sağlık uyarısı">
        <p>
          Hedefit tıbbi cihaz değildir. Ürettiği plan, kalori hedefi ve değerlendirmeler tıbbi
          teşhis, tedavi veya beslenme reçetesi yerine geçmez. Hamilelik, emzirme, yeme bozukluğu
          öyküsü, diyabet, kalp veya böbrek rahatsızlığı gibi durumlarda uygulamayı kullanmadan
          önce bir sağlık uzmanına danışın. Antrenman sırasında keskin ağrı, göğüs ağrısı veya baş
          dönmesi yaşarsanız durun ve hekime başvurun.
        </p>
      </Section>

      <Section title="9. Haklarınız">
        <p>
          KVKK ve GDPR kapsamında verilerinize erişme, düzeltme, silme ve taşıma haklarına
          sahipsiniz. Erişim ve silme işlemlerini uygulama içinden doğrudan yapabilirsiniz; diğer
          talepler için <strong>{ILETISIM_EPOSTASI}</strong> adresine yazın.
        </p>
      </Section>

      <Section title="10. Değişiklikler">
        <p>
          Bu politikada değişiklik yaparsak güncel sürümü bu adreste yayınlar ve &quot;Son
          güncelleme&quot; tarihini değiştiririz.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        {title}
      </h2>
      {children}
    </section>
  );
}
