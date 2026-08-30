export const runtime = "edge";

/**
 * İstemcinin "reklam izlendi" beyanı kanıt değildir. Google AdMob SSV
 * imzasını doğrulayan, transaction_id değerini tek kullanımlık kaydeden bir
 * sunucu callback'i kurulana kadar bu eski uç nokta kapalı kalır.
 */
export async function POST() {
  return Response.json(
    { error: "Reklam ödülü sunucu doğrulaması tamamlanana kadar kullanılamıyor." },
    { status: 501 },
  );
}
