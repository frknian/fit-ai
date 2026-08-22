import type { Metadata } from "next";
import "./globals.css";

// Tema ve dil, ilk boyamadan önce senkron olarak uygulanır; aksi halde
// CSS text-transform:uppercase, <html lang> Türkçe kalırsa İngilizce
// metinlerde "i" harfini yanlış büyük harfe çevirir (ör. "WİTH").
// Tema seçimi ilk boyamadan ÖNCE uygulanır (aksi hâlde açık tema bir an
// görünüp koyuya dönerdi). Varsayılan KOYU: uygulama koyu-öncelikli
// tasarlandı (bkz. docs/MOBIL_TASARIM_PLANI.md 3.4). Açık tema korunuyor —
// GPS ekranı güneş altında kullanılıyor ve orada koyu ekran okunmuyor.
const themeScript = `(function(){try{var t=localStorage.getItem('hedefit-theme')||localStorage.getItem('form-ai-theme');if(t!=='light'&&t!=='dark'){t='dark'}document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}try{var l=localStorage.getItem('hedefit:locale')||localStorage.getItem('fitai:locale');if(l!=='en'&&l!=='tr'){l=(navigator.language||'tr').toLowerCase().indexOf('en')===0?'en':'tr'}document.documentElement.lang=l}catch(e){}})()`;

export const viewport = { themeColor: "#D9F76B" };

const metadataBase = new URL("https://hedefit.frknian.workers.dev");
const title = "Hedefit — Hedefin için fit plan.";
const description = "Hareketleri adım adım öğren, yapay zeka destekli kişisel antrenman planını güvenle uygula.";

// İstek başlıklarını okumak tüm uygulamayı dinamik SSR'a zorlar. Bu, ücretsiz
// Worker'ın kısa CPU bütçesinde OAuth dönüşlerinde 1102 hatasına yol açabiliyor.
export const metadata: Metadata = {
  metadataBase,
  title,
  description,
  openGraph: { title, description, type: "website", locale: "tr_TR", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Hedefit kişisel antrenman rehberi" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
  },
  icons: [
    { rel: "icon", url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    { rel: "icon", url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    { rel: "manifest", url: "/manifest.json" },
    { rel: "apple-touch-icon", url: "/apple-touch-icon.png", sizes: "180x180" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body>{children}</body></html>;
}
