"use client";

import { ComponentProps, ComponentType, FormEvent, ReactNode, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { isVerifiedAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { authCallbackUrl, isNativeApp, openNativeBrowser } from "@/lib/mobile";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SportyLoader } from "@/components/SportyLoader";
import { useTranslations, type Dictionary } from "@/lib/i18n/translate";
import { isValidBirthDate } from "@/lib/profile";

type AuthMode = "signup" | "login" | "reset";
type AuthStep = "landing" | "form" | "verify";

type GoogleCredentialResponse = { credential?: string };
type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize: (options: { client_id: string; nonce: string; use_fedcm_for_prompt: boolean; callback: (response: GoogleCredentialResponse) => void }) => void;
      renderButton: (parent: HTMLElement, options: { type: "standard"; theme: "outline"; size: "large"; text: "continue_with"; shape: "rectangular"; width: number }) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

function callbackUrl() {
  return authCallbackUrl();
}

function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
  if (window.google) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("google-identity-services") as HTMLScriptElement | null;
    const script = existing || document.createElement("script");
    const complete = () => window.google ? resolve(window.google) : reject(new Error("Google giriş hizmeti başlatılamadı."));
    script.addEventListener("load", complete, { once: true });
    script.addEventListener("error", () => reject(new Error("Google giriş hizmeti yüklenemedi.")), { once: true });
    if (!existing) {
      script.id = "google-identity-services";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

async function createGoogleNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return { nonce, hashedNonce };
}

// Google'ın marka kılavuzundaki dört renkli "G" işareti; CSP harici kaynak
// yüklemeye izin vermediği için satır içi SVG olarak tutuluyor.
function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
  </svg>;
}

/**
 * Kimlik ekranlarının tek girdi bileşeni (Stitch hesap/giriş/şifre ekranları).
 *
 * Her alan solda bir ikon taşır, şifre alanları kendi göster/gizle düğmesini
 * yönetir. Etiketin yanındaki eylem (ör. "Şifremi unuttum") `<label>` DIŞINDA
 * durur: etiketin içindeki düğme, alana dokunmayı da tetiklerdi.
 */
function AuthField({
  label,
  icon: Icon,
  hint,
  labelAction,
  ...inputProps
}: ComponentProps<"input"> & { label: string; icon: ComponentType<{ className?: string }>; hint?: string; labelAction?: ReactNode }) {
  const t = useTranslations();
  const fieldId = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = inputProps.type === "password";
  return (
    <div className="auth-field">
      <div className="auth-field-label">
        <label htmlFor={fieldId}>{label}</label>
        {labelAction}
      </div>
      <div className="auth-field-control">
        <Icon className="auth-field-icon" aria-hidden />
        <input id={fieldId} {...inputProps} type={isPassword && revealed ? "text" : inputProps.type} />
        {isPassword && (
          <button type="button" className="auth-field-reveal" aria-label={revealed ? t.auth.hidePassword : t.auth.showPassword} onClick={() => setRevealed((current) => !current)}>
            {revealed ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        )}
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function friendlyAuthError(message: string, copy: Dictionary["auth"]) {
  const normalized = message.toLocaleLowerCase("en-US");
  if (normalized.includes("invalid login credentials")) return copy.errorInvalidCredentials;
  if (normalized.includes("email_address_invalid") || normalized.includes("invalid email") || normalized.includes("unable to validate email")) return copy.errorInvalidEmail;
  if (normalized.includes("email not confirmed")) return copy.errorEmailNotConfirmed;
  if (normalized.includes("token has expired") || normalized.includes("otp_expired") || normalized.includes("invalid token") || normalized.includes("token is invalid")) return copy.errorTokenExpired;
  if (normalized.includes("user already registered") || normalized.includes("already been registered")) return copy.errorAlreadyRegistered;
  if (normalized.includes("weak_password") || normalized.includes("password is known to be weak") || normalized.includes("password should contain")) return copy.errorWeakPassword;
  if (normalized.includes("password should be")) return copy.errorPasswordTooShort;
  if (normalized.includes("error sending confirmation email") || normalized.includes("email_send_failed") || normalized.includes("smtp")) return copy.errorEmailDelivery;
  if (normalized.includes("signup_disabled") || normalized.includes("signups not allowed") || normalized.includes("signup is disabled")) return copy.errorSignupDisabled;
  if (normalized.includes("database error saving new user") || normalized.includes("unexpected_failure")) return copy.errorSignupDatabase;
  if (normalized.includes("rate limit")) return copy.errorRateLimit;
  const safeDetail = message.replace(/\s+/g, " ").trim().slice(0, 160);
  return safeDetail ? copy.errorGenericWithDetail(safeDetail) : copy.errorGeneric;
}

export function AuthScreen({ status, onSignedIn }: { status: "loading" | "anonymous" | "unavailable"; onSignedIn: (user: User) => void }) {
  const t = useTranslations();
  const [mode, setMode] = useState<AuthMode>("signup");
  // İlk açılışta önce bir SEÇİM ekranı gösterilir (Giriş yap / Google ile
  // giriş yap / Kayıt ol); e-posta formu yalnız kullanıcı bir seçim
  // yaptıktan sonra açılır.
  const [step, setStep] = useState<AuthStep>("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [googleButtonReady, setGoogleButtonReady] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const usesGoogleIdentityButton = !isNativeApp() && Boolean(googleClientId);

  const completeGoogleSignIn = useEffectEvent(async (response: GoogleCredentialResponse, nonce: string) => {
    if (!response.credential) {
      setError(friendlyAuthError("Google kimlik bilgisi alınamadı.", t.auth));
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setError(t.auth.errorServiceUnavailable);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: tokenError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
        nonce,
      });
      if (tokenError) throw tokenError;
      if (!isVerifiedAuthUser(data.user)) throw new Error("Google hesabının e-posta doğrulaması alınamadı.");
      onSignedIn(data.user);
    } catch (authError) {
      setError(friendlyAuthError(authError instanceof Error ? authError.message : "", t.auth));
    } finally {
      setBusy(false);
    }
  });

  const reportGoogleSetupError = useEffectEvent((authError: unknown) => {
    setGoogleButtonReady(false);
    setError(friendlyAuthError(authError instanceof Error ? authError.message : "", t.auth));
  });

  useEffect(() => {
    // Google düğmesi hem başlangıç seçim ekranında hem de e-posta formunda
    // görünür (bkz. googleButtonBlock); `step` bağımlılıklarda olmalı, yoksa
    // ekranlar arası geçişte konteyner değişse de düğme yeniden çizilmez.
    if (!usesGoogleIdentityButton || !googleClientId || status === "unavailable" || mode === "reset" || step === "verify") {
      return;
    }
    let active = true;
    const container = googleButtonRef.current;
    if (!container) return;
    container.replaceChildren();

    void Promise.all([loadGoogleIdentity(), createGoogleNonce()])
      .then(([google, { nonce, hashedNonce }]) => {
        if (!active) return;
        google.accounts.id.initialize({
          client_id: googleClientId,
          nonce: hashedNonce,
          use_fedcm_for_prompt: true,
          callback: (response) => {
            if (active) void completeGoogleSignIn(response, nonce);
          },
        });
        google.accounts.id.renderButton(container, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: Math.max(240, Math.round(container.getBoundingClientRect().width)),
        });
        setGoogleButtonReady(true);
      })
      .catch((authError) => {
        if (!active) return;
        reportGoogleSetupError(authError);
      });

    return () => {
      active = false;
      container.replaceChildren();
    };
  }, [googleClientId, mode, status, step, usesGoogleIdentityButton]);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setGoogleButtonReady(false);
    setStep("form");
    setError("");
    setNotice("");
    setPassword("");
    setPasswordAgain("");
    setCode("");
  }

  function backToForm() {
    setStep("form");
    setError("");
    setNotice("");
    setCode("");
  }

  function backToLanding() {
    setStep("landing");
    setGoogleButtonReady(false);
    setError("");
    setNotice("");
  }

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (mode === "reset") {
      if (!email.trim()) {
        setError(t.auth.errorEmailRequired);
        return;
      }
      const supabase = createClient();
      if (!supabase) {
        setError(t.auth.errorServiceUnavailable);
        return;
      }
      setBusy(true);
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (resetError) throw resetError;
        setStep("verify");
        setNotice(t.auth.noticeResetVerify);
      } catch (authError) {
        setError(friendlyAuthError(authError instanceof Error ? authError.message : "", t.auth));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === "signup" && password !== passwordAgain) {
      setError(t.auth.errorPasswordMismatch);
      return;
    }
    if (mode === "signup" && !isValidBirthDate(birthDate)) {
      setError(t.auth.errorInvalidBirthDate);
      return;
    }
    if (password.length < 8) {
      setError(t.auth.errorPasswordTooShort);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError(t.auth.errorServiceUnavailable);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { birth_date: birthDate } },
        });
        if (signUpError) throw signUpError;
        if (data.session?.user) {
          if (isVerifiedAuthUser(data.session.user)) {
            onSignedIn(data.session.user);
            return;
          }
          await supabase.auth.signOut({ scope: "local" });
        }
        setStep("verify");
        setNotice(t.auth.noticeSignupVerify);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) {
          // E-postası henüz doğrulanmamışsa kullanıcıyı kod ekranına al ve yeni kod gönder.
          const message = signInError.message.toLocaleLowerCase("en-US");
          if (message.includes("email not confirmed")) {
            await supabase.auth.resend({ type: "signup", email: email.trim() });
            setStep("verify");
            setNotice(t.auth.noticeSignupVerify);
            return;
          }
          throw signInError;
        }
        if (!isVerifiedAuthUser(data.user)) {
          await supabase.auth.signOut({ scope: "local" });
          setStep("verify");
          setError(t.auth.errorEmailNotConfirmed);
          return;
        }
        onSignedIn(data.user);
      }
    } catch (authError) {
      setError(friendlyAuthError(authError instanceof Error ? authError.message : "", t.auth));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setNotice("");
    const supabase = createClient();
    if (!supabase) {
      setError(t.auth.errorServiceUnavailable);
      return;
    }
    setBusy(true);
    const native = isNativeApp();
    const { data, error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(), skipBrowserRedirect: native, queryParams: { access_type: "offline", prompt: "consent" } },
    });
    if (googleError) {
      setError(friendlyAuthError(googleError.message, t.auth));
      setBusy(false);
    } else if (native && data.url) {
      await openNativeBrowser(data.url);
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) {
      setError(t.auth.errorCodeLength);
      return;
    }
    if (mode === "reset") {
      if (password.length < 8) {
        setError(t.auth.errorNewPasswordTooShort);
        return;
      }
      if (password !== passwordAgain) {
        setError(t.auth.errorPasswordMismatch);
        return;
      }
    }
    const supabase = createClient();
    if (!supabase) {
      setError(t.auth.errorServiceUnavailable);
      return;
    }
    setBusy(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: mode === "reset" ? "recovery" : "signup",
      });
      if (verifyError) throw verifyError;
      if (mode === "reset") {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        if (data.user) {
          onSignedIn(data.user);
          return;
        }
        setError(t.auth.errorPasswordUpdateFailed);
        return;
      }
      if (data.user && isVerifiedAuthUser(data.user)) {
        onSignedIn(data.user);
        return;
      }
      setError(t.auth.errorVerifyFailed);
    } catch (authError) {
      setError(friendlyAuthError(authError instanceof Error ? authError.message : "", t.auth));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = createClient();
    const { error: resendError } = supabase
      ? mode === "reset"
        ? await supabase.auth.resetPasswordForEmail(email.trim())
        : await supabase.auth.resend({ type: "signup", email: email.trim() })
      : { error: new Error(t.auth.errorSupabaseNotConfigured) };
    setBusy(false);
    if (resendError) setError(friendlyAuthError(resendError.message, t.auth));
    else setNotice(t.auth.noticeResendCode);
  }

  if (status === "loading") {
    return <SportyLoader title={t.auth.loadingTitle} body={t.auth.loadingBody} />;
  }

  // Başlangıç ekranı ve e-posta formu aynı Google düğmesini paylaşır — ikisi
  // aynı anda ekranda olmadığı için (step ya "landing" ya "form") tek bir
  // `googleButtonRef` konteynerini sırayla kullanmaları güvenli.
  const googleButtonBlock = usesGoogleIdentityButton ? (
    <div className={`google-identity-button${googleButtonReady ? " ready" : ""}`} aria-label={t.auth.googleButton}>
      <div ref={googleButtonRef} />
      {!googleButtonReady && <span>{t.auth.submitBusy}</span>}
    </div>
  ) : (
    <button type="button" className="google-auth-button" onClick={() => void handleGoogleSignIn()} disabled={busy || status === "unavailable"}><GoogleMark /> {t.auth.googleButton}</button>
  );

  return (
    <main className="auth-shell">
      <div className="toggle-row auth-toggle-row"><LanguageToggle /><ThemeToggle /></div>
      <section className="auth-layout">
        <div className="auth-story">
          <div className="auth-brand"><span className="brand-mark" aria-hidden="true" /><span>Hede<span className="brand-letter-gradient">f</span><span className="brand-dot">it</span></span></div>
          <div><div className="eyebrow">{t.auth.eyebrow}</div><h1>{t.auth.heroTitleLine1}<br /><em>{t.auth.heroTitleEm}</em></h1><p>{t.auth.heroBody}</p></div>
          <div className="auth-benefits"><span>01</span><p><strong>{t.auth.benefit1Title}</strong><small>{t.auth.benefit1Body}</small></p><span>02</span><p><strong>{t.auth.benefit2Title}</strong><small>{t.auth.benefit2Body}</small></p></div>
        </div>

        {/* Stitch kimlik ekranları tek bir ortalanmış kart: üstte geri düğmesi
            (yalnız alt akışlarda), marka başlığı, ikonlu alanlar ve altta
            diğer moda geçiren bağlantı. Sekme anahtarı kaldırıldı — üç ekranın
            hepsinde bu bağlantı deseni var ve iki ayrı geçiş yolu gereksizdi. */}
        <div className="auth-panel">
          {/* Geri oku üç akışta görünür: doğrulama kodundan forma, şifre
              sıfırlamadan girişe, giriş/kayıt formundan başlangıç seçimine.
              Başlangıç ekranının (step==="landing") kendisinde ok yoktur —
              geri gidilecek bir yer kalmamıştır. */}
          {(step === "verify" || step === "form") && (
            <button type="button" className="auth-back" aria-label={step === "verify" ? t.auth.backToForm : mode === "reset" ? t.auth.backToForm : t.auth.backToLanding} onClick={() => step === "verify" ? backToForm() : mode === "reset" ? changeMode("login") : backToLanding()} disabled={busy}>
              <ArrowLeft className="size-5" />
            </button>
          )}
          {step !== "verify" && (
            <div className="auth-panel-heading">
              {step === "landing" ? (
                <><span>{t.auth.headingLandingEyebrow}</span><h2>{t.auth.headingLandingTitle}</h2><p>{t.auth.headingLandingBody}</p></>
              ) : (
                <><span>{mode === "signup" ? t.auth.headingSignupEyebrow : mode === "reset" ? t.auth.headingResetEyebrow : t.auth.headingLoginEyebrow}</span><h2>{mode === "signup" ? t.auth.headingSignupTitle : mode === "reset" ? t.auth.headingResetTitle : t.auth.headingLoginTitle}</h2><p>{mode === "signup" ? t.auth.headingSignupBody : mode === "reset" ? t.auth.headingResetBody : t.auth.headingLoginBody}</p></>
              )}
            </div>
          )}

          {status === "unavailable" && <div className="auth-message error auth-configuration" role="alert"><strong>{t.auth.unavailableTitle}</strong><span>{t.auth.unavailableBody}</span></div>}
          {step === "landing" ? (
            // Uygulama ilk açıldığında görülen üç seçenek: giriş yap, Google
            // ile giriş yap, kayıt ol. E-posta/şifre alanları burada YOK —
            // yalnız bir seçim yaptıktan sonra açılır.
            <div className="auth-landing-actions">
              <button type="button" className="auth-submit" onClick={() => changeMode("login")} disabled={status === "unavailable"}>{t.auth.landingLoginButton}<span>→</span></button>
              {googleButtonBlock}
              <button type="button" className="auth-landing-signup" onClick={() => changeMode("signup")} disabled={status === "unavailable"}>{t.auth.landingSignupButton}</button>
            </div>
          ) : step === "form" ? (
            <>
              <form className="auth-form" onSubmit={handleEmailAuth}>
                <AuthField label={t.auth.emailLabel} icon={Mail} type="email" name="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t.auth.emailPlaceholder} />
                {mode === "signup" && <AuthField label={t.auth.birthDateLabel} icon={CalendarDays} hint={t.auth.birthDateHint} type="date" name="birth-date" autoComplete="bday" min="1905-01-01" max={new Date().toISOString().slice(0, 10)} required value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />}
                {mode !== "reset" && <AuthField label={t.auth.passwordLabel} icon={Lock} type="password" name="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t.auth.passwordPlaceholder}
                  labelAction={mode === "login" ? <button type="button" className="auth-linkish" onClick={() => changeMode("reset")} disabled={busy}>{t.auth.forgotPassword}</button> : undefined} />}
                {mode === "signup" && <AuthField label={t.auth.passwordAgainLabel} icon={Lock} type="password" name="password-confirmation" autoComplete="new-password" minLength={8} required value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} placeholder={t.auth.passwordAgainPlaceholder} />}
                {error && <div className="auth-message error" role="alert">{error}</div>}
                <button className="auth-submit" type="submit" disabled={busy || status === "unavailable"}>{busy ? t.auth.submitBusy : status === "unavailable" ? t.auth.submitUnavailable : mode === "signup" ? t.auth.submitSignup : mode === "reset" ? t.auth.submitReset : t.auth.submitLogin}<span>→</span></button>
              </form>
              {mode !== "reset" && <>
                <div className="auth-divider"><span>{t.auth.dividerText}</span></div>
                {googleButtonBlock}
              </>}
            </>
          ) : (
            <form className="auth-form" onSubmit={verifyCode}>
              <div className="auth-panel-heading"><span>{mode === "reset" ? t.auth.verifyResetEyebrow : t.auth.verifyCodeEyebrow}</span><h2>{mode === "reset" ? t.auth.verifyResetTitle : t.auth.verifyCodeTitle}</h2><p>{t.auth.verifyCodeBody(email)}</p></div>
              {notice && <div className="auth-message success" role="status"><strong>{t.auth.checkEmailTitle}</strong><span>{notice}</span></div>}
              <AuthField label={t.auth.codeLabel} icon={KeyRound} className="auth-code-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" />
              {mode === "reset" && <><AuthField label={t.auth.newPasswordLabel} icon={Lock} type="password" name="new-password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t.auth.passwordPlaceholder} /><AuthField label={t.auth.newPasswordAgainLabel} icon={Lock} type="password" name="new-password-confirmation" autoComplete="new-password" minLength={8} required value={passwordAgain} onChange={(event) => setPasswordAgain(event.target.value)} placeholder={t.auth.passwordAgainPlaceholder} /></>}
              {error && <div className="auth-message error" role="alert">{error}</div>}
              <button className="auth-submit" type="submit" disabled={busy}>{busy ? t.auth.submitBusy : mode === "reset" ? t.auth.verifySubmitReset : t.auth.verifySubmitCode}<span>→</span></button>
              <div className="auth-verify-actions"><button type="button" className="auth-linkish" onClick={() => void resendVerification()} disabled={busy}>{t.auth.resendCode}</button></div>
            </form>
          )}
          {step === "form" && mode !== "reset" && (
            <p className="auth-switch">
              {mode === "signup" ? t.auth.hasAccountPrompt : t.auth.noAccountPrompt}
              <button type="button" onClick={() => changeMode(mode === "signup" ? "login" : "signup")} disabled={busy}>{mode === "signup" ? t.auth.tabLogin : t.auth.tabSignup}</button>
            </p>
          )}
          <p className="auth-privacy">{t.auth.privacyNote}</p>
        </div>
      </section>
    </main>
  );
}
