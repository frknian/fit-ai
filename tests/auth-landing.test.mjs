import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [auth, tr, en] = await Promise.all([
  readFile(new URL("../components/AuthScreen.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/i18n/dictionaries/tr.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/i18n/dictionaries/en.ts", import.meta.url), "utf8"),
]);

test("uygulama ilk açıldığında seçim ekranı gösterilir, doğrudan form değil", () => {
  // Eskiden ilk ekran doğrudan kayıt formuydu (e-posta/şifre alanları);
  // kullanıcı önce Giriş yap / Google / Kayıt ol arasında seçim yapmalı.
  assert.match(auth, /type AuthStep = "landing" \| "form" \| "verify";/);
  assert.match(auth, /const \[step, setStep\] = useState<AuthStep>\("landing"\);/);
});

test("başlangıç ekranında üç seçenek sırayla durur: giriş, Google, kayıt", () => {
  const block = auth.slice(auth.indexOf('step === "landing" ? ('), auth.indexOf(') : step === "form" ? ('));
  const loginIndex = block.indexOf("landingLoginButton");
  const googleIndex = block.indexOf("googleButtonBlock");
  const signupIndex = block.indexOf("landingSignupButton");
  assert.ok(loginIndex !== -1 && googleIndex !== -1 && signupIndex !== -1, "üç eylemden biri eksik");
  assert.ok(loginIndex < googleIndex && googleIndex < signupIndex, "sıra: giriş yap → Google → kayıt ol");
});

test("Google düğmesi tek yerde tanımlanır, hem başlangıçta hem formda kullanılır", () => {
  // İki ekran aynı anda mount olmadığı için (step ya landing ya form) tek
  // konteyneri paylaşmaları güvenli; kopyalanmış bir ikinci tanım olmamalı.
  assert.equal((auth.match(/const googleButtonBlock = usesGoogleIdentityButton \?/g) || []).length, 1);
  assert.equal((auth.match(/\{googleButtonBlock\}/g) || []).length, 2, "hem landing hem form ekranında kullanılmalı");
});

test("Google düğmesi efekti başlangıç ve form ekranı arasındaki geçişte yeniden kurulur", () => {
  assert.match(auth, /\}, \[googleClientId, mode, status, step, usesGoogleIdentityButton\]\);/);
});

test("giriş/kayıt formundan geri, başlangıç ekranına döner", () => {
  // Şifre sıfırlama akışı hâlâ doğrudan girişe döner (değişmedi); yalnız
  // normal giriş/kayıt formu artık başlangıç ekranına dönüyor.
  assert.match(auth, /onClick=\{\(\) => step === "verify" \? backToForm\(\) : mode === "reset" \? changeMode\("login"\) : backToLanding\(\)\}/);
  assert.match(auth, /function backToLanding\(\) \{/);
});

test("başlangıç ekranı metinleri iki dilde de tanımlı", () => {
  for (const dict of [tr, en]) {
    for (const key of ["headingLandingEyebrow", "headingLandingTitle", "headingLandingBody", "landingLoginButton", "landingSignupButton", "backToLanding"]) {
      assert.ok(dict.includes(`${key}:`), `eksik anahtar: ${key}`);
    }
  }
});
