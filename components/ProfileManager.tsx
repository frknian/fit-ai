"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { calculateAge, isValidBirthDate, type EditableProfile } from "@/lib/profile";
import { saveProfileWithHistory, signedAvatarUrl } from "@/lib/profile-service";
import { TrainingPlaceSwitch } from "@/components/TrainingPlaceSwitch";
import { OnboardingIcon } from "@/components/onboarding/OnboardingIcon";
import { GOAL_PRESETS } from "@/lib/goal-presets";
import { EQUIPMENT_CHOICES, INJURY_CHOICES, formatChoices, parseChoices, toggleChoice } from "@/lib/profile-choices";
import { useWeightUnit, setStoredWeightUnit } from "@/lib/preferences";
import { kgToInputValue, parseWeightInputToKg, type WeightUnit } from "@/lib/units";
import { LocalAiSettings } from "@/components/LocalAiSettings";
import { StepNotificationSettings } from "@/components/StepNotificationSettings";
import { translateGender, useTranslations } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";

const EXPORT_TABLES = [
  "profiles", "profile_history", "workout_sessions", "workout_exercise_logs", "workout_set_logs",
  "body_measurements", "sport_activity_entries", "activity_logs", "food_entries", "nutrition_goals",
  "user_streaks", "reminder_preferences", "workout_plans", "workout_schedule", "weekly_ai_reviews",
];

type ProfileManagerProps = {
  user: User;
  profile: EditableProfile;
  avatarUrl: string | null;
  onSaved: (profile: EditableProfile, avatarUrl: string | null) => void;
  onFrozen: () => void;
  onDeleted: () => void;
  onProgressReset: () => void;
  onRetakeTest: () => void;
  /** Profildeki cevaplarla AI programını yeniden kurar. */
  onRefreshPlan: () => Promise<void>;
  /** Profil testindeki sakatlık cevabı; burada da düzenlenebilir. */
  injuryAnswer: string;
  onInjuryChange: (next: string) => void;
  onSignOut: () => Promise<void>;
  isPremium: boolean;
  onUpgradeRequest: () => void;
};

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function ProfileManager({ user, profile, avatarUrl, onSaved, onFrozen, onDeleted, onProgressReset, onRetakeTest, onSignOut, injuryAnswer, onInjuryChange, onRefreshPlan, isPremium, onUpgradeRequest }: ProfileManagerProps) {
  const [refreshing, setRefreshing] = useState(false);
  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "tr-TR";
  const deleteConfirmPhrase = t.profileManager.deleteConfirmPhrase;
  const [draft, setDraft] = useState(profile);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteAccepted, setDeleteAccepted] = useState(false);
  const [progressResetOpen, setProgressResetOpen] = useState(false);
  const [progressResetPhrase, setProgressResetPhrase] = useState("");
  const [progressResetAccepted, setProgressResetAccepted] = useState(false);
  const [resettingProgress, setResettingProgress] = useState(false);
  const [exporting, setExporting] = useState(false);
  const deleteEmailRef = useRef<HTMLInputElement>(null);
  const age = useMemo(() => calculateAge(draft.birthDate), [draft.birthDate]);
  // Stitch "Physical Measurements" ızgarası: aynı VKİ formülü (bkz.
  // FitAiApp'teki `bmi`), yalnız burada gerçek veri yoksa "22.4" gibi bir
  // varsayılana düşmüyor — profil ekranı kendi cevabını gösterir.
  const profileBmi = useMemo(() => {
    const h = (draft.heightCm ?? 0) / 100;
    const w = draft.weightKg ?? 0;
    return h && w ? (w / (h * h)).toFixed(1) : null;
  }, [draft.heightCm, draft.weightKg]);
  const shownAvatar = avatarPreview || avatarUrl;
  const unit = useWeightUnit();

  async function exportData() {
    const client = createClient();
    if (!client) { setMessage(t.profileManager.exportUnavailable); return; }
    setExporting(true);
    setMessage("");
    try {
      const bundle: Record<string, unknown> = { exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email } };
      for (const table of EXPORT_TABLES) {
        const { data, error } = await client.from(table).select("*");
        bundle[table] = error ? [] : data || [];
      }
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hedefit-verilerim-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(t.profileManager.exportDownloaded);
    } catch {
      setMessage(t.profileManager.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  useEffect(() => {
    if (!deleteOpen) return undefined;
    deleteEmailRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) setDeleteOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deleteOpen, saving]);

  function update<K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setMessage(t.profileManager.avatarSizeError);
      return;
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidBirthDate(draft.birthDate)) {
      setMessage(t.profileManager.invalidBirthDate);
      return;
    }
    if (!draft.heightCm || draft.heightCm < 80 || draft.heightCm > 250 || !draft.weightKg || draft.weightKg < 20 || draft.weightKg > 500) {
      setMessage(t.profileManager.invalidHeightWeight);
      return;
    }
    const client = createClient();
    if (!client) { setMessage(t.profileManager.profileServiceUnavailable); return; }
    setSaving(true);
    setMessage("");
    let uploadedPath: string | null = null;
    try {
      let nextAvatarPath = draft.avatarPath;
      if (avatarFile) {
        const extension = avatarFile.name.split(".").pop()?.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${user.id}/avatar-${Date.now()}.${extension}`;
        const { error: uploadError } = await client.storage.from("profile-avatars").upload(path, avatarFile, { contentType: avatarFile.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPath = path;
        nextAvatarPath = path;
      }
      const nextProfile = { ...draft, avatarPath: nextAvatarPath };
      await saveProfileWithHistory(client, nextProfile);
      if (uploadedPath && draft.avatarPath) await client.storage.from("profile-avatars").remove([draft.avatarPath]);
      const nextAvatarUrl = await signedAvatarUrl(client, nextAvatarPath);
      setDraft(nextProfile);
      setAvatarFile(null);
      setAvatarPreview(null);
      onSaved(nextProfile, nextAvatarUrl);
      setMessage(t.profileManager.profileSaved);
    } catch {
      if (uploadedPath) await client.storage.from("profile-avatars").remove([uploadedPath]);
      setMessage(t.profileManager.profileSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function freezeAccount() {
    if (!window.confirm(t.profileManager.freezeConfirm)) return;
    const client = createClient();
    if (!client) return;
    setSaving(true);
    const { error } = await client.from("profiles").update({ account_status: "frozen", frozen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", user.id);
    setSaving(false);
    if (error) setMessage(t.profileManager.freezeFailed);
    else onFrozen();
  }

  async function deleteAccount() {
    if (deletePhrase !== deleteConfirmPhrase || deleteEmail.trim().toLocaleLowerCase("tr-TR") !== (user.email || "").toLocaleLowerCase("tr-TR") || !deleteAccepted) return;
    const client = createClient();
    if (!client) return;
    setSaving(true);
    setMessage("");
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) {
      setSaving(false);
      setMessage(t.profileManager.secureSessionFailed);
      return;
    }
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ confirmation: deletePhrase, email: deleteEmail.trim() }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || t.profileManager.deleteFailedGeneric);
      await client.auth.signOut();
      onDeleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.profileManager.deleteFailed);
      setSaving(false);
    }
  }

  async function resetProgress() {
    if (progressResetPhrase !== t.profileManager.progressResetConfirmPhrase || !progressResetAccepted) return;
    const client = createClient();
    if (!client) return;
    setResettingProgress(true);
    setMessage("");
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) {
      setResettingProgress(false);
      setMessage(t.profileManager.secureSessionFailed);
      return;
    }
    try {
      const response = await fetch("/api/account/reset-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ confirmation: "RESET_PROGRESS" }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || t.profileManager.progressResetFailed);
      setProgressResetOpen(false);
      setProgressResetPhrase("");
      setProgressResetAccepted(false);
      onProgressReset();
      setMessage(t.profileManager.progressResetComplete);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.profileManager.progressResetFailed);
    } finally {
      setResettingProgress(false);
    }
  }

  return <section className="profile-editor profile-manager" aria-labelledby="profile-manager-title">
    <div className="profile-manager-intro">
      <div className="eyebrow">{t.profileManager.eyebrow}</div><h2 id="profile-manager-title">{t.profileManager.title}</h2><p>{t.profileManager.body}</p>
      <div className="profile-avatar-card"><div className="profile-avatar-preview">{shownAvatar ? <Image className="profile-avatar-image" src={shownAvatar} alt={t.profileManager.avatarAlt} width={76} height={76} unoptimized /> : <span>{draft.displayName.charAt(0).toLocaleUpperCase(dateLocale) || "S"}</span>}</div><div><strong>{t.profileManager.profilePhoto}</strong><small>{t.profileManager.photoSizeHint}</small><label className="profile-avatar-button">{t.profileManager.changePhotoPrefix} {shownAvatar ? t.profileManager.changePhoto : t.profileManager.uploadPhoto}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} /></label></div></div>
      {/* Stitch "Physical Measurements" bento kartlarının sade karşılığı: boy,
          kilo ve VKİ formda zaten düzenlenebilir; burada yalnız özet olarak
          büyük punto ile görünür. */}
      <div className="profile-stat-row">
        <div className="profile-stat-tile"><span>{t.profileManager.heightLabel}</span><strong>{draft.heightCm ?? "—"}<small>cm</small></strong></div>
        <div className="profile-stat-tile"><span>{t.profileManager.weightLabel(unit.toLocaleUpperCase(dateLocale))}</span><strong>{draft.weightKg ? kgToInputValue(draft.weightKg, unit) : "—"}<small>{unit}</small></strong></div>
        <div className="profile-stat-tile"><span>{t.dashboard.bmiLabel}</span><strong>{profileBmi ?? "—"}</strong></div>
      </div>
      <div className="profile-account"><span>{t.profileManager.verifiedAccount}</span><strong>{user.email}</strong><small>{t.profileManager.emailVerified}</small></div>
    </div>

    <form className="profile-editor-fields" onSubmit={save}>
      <div className="profile-personal-grid"><label>{t.profileManager.nameLabel}<input required value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} /></label><label>{t.profileManager.birthDateLabel}<input required type="date" min="1905-01-01" max={new Date().toISOString().slice(0, 10)} value={draft.birthDate} onChange={(event) => update("birthDate", event.target.value)} /><small>{age === null ? t.profileManager.ageAutoCalculated : t.profileManager.ageSuffix(age)}</small></label><label>{t.profileManager.genderLabel}<select value={draft.gender} onChange={(event) => update("gender", event.target.value)}><option value="Kadın">{translateGender(t, "Kadın")}</option><option value="Erkek">{translateGender(t, "Erkek")}</option><option value="Belirtmek istemiyorum">{translateGender(t, "Belirtmek istemiyorum")}</option></select></label><label>{t.profileManager.heightLabel}<input required type="number" min="80" max="250" step="0.1" value={draft.heightCm ?? ""} onChange={(event) => update("heightCm", numberOrNull(event.target.value))} /></label><label>{t.profileManager.weightLabel(unit.toLocaleUpperCase(dateLocale))}<input required type="number" min={unit === "lb" ? 44 : 20} max={unit === "lb" ? 1100 : 500} step="0.1" value={kgToInputValue(draft.weightKg, unit)} onChange={(event) => update("weightKg", parseWeightInputToKg(event.target.value, unit))} /></label></div>
      <button className="primary-btn" disabled={saving} type="submit">{saving ? t.profileManager.saving : t.profileManager.saveChanges}</button>{message && <p className="profile-save-message" role="status">{message}</p>}
    </form>

    {/* KUTU 2 — Antrenman ayarları. Hepsi serbest metindi; çoğu kullanıcı boş
        bırakıyor, dolduranın cümlesini de plan üretimi güvenilir okuyamıyordu.
        Şıklı sorular kanonik değer üretir ve doğrudan akıllı analize gider. */}
    <div className="profile-box profile-training">
      <div className="profile-box-head"><span>{t.profileChoices.trainingEyebrow}</span><strong>{t.profileChoices.trainingTitle}</strong><p>{t.profileChoices.trainingBody}</p></div>

      {/* TrainingPlaceSwitch kendi legend'ini basıyor; üstüne bir başlık daha
          koymak aynı soruyu iki kez soruyordu. Metni ona veriyoruz. */}
      <TrainingPlaceSwitch value={draft.environment} onChange={(environment) => update("environment", environment)} label={t.profileManager.environmentQuestion} />

      <fieldset className="profile-question">
        <legend>{t.profileChoices.goalQuestion}</legend>
        <div className="option-cards option-cards-3">{GOAL_PRESETS.map((preset) => (
          <button type="button" key={preset.id} aria-pressed={draft.goalText.trim() === preset.text}
            className={draft.goalText.trim() === preset.text ? "option-card selected" : "option-card"}
            onClick={() => update("goalText", draft.goalText.trim() === preset.text ? "" : preset.text)}>
            <OnboardingIcon name={preset.icon} /><span>{t.onboarding.goalPresets[preset.id]}</span>
          </button>
        ))}</div>
      </fieldset>

      <fieldset className="profile-question">
        <legend>{t.profileChoices.equipmentQuestion}</legend>
        <div className="answer-grid">{EQUIPMENT_CHOICES.map((choice) => {
          const chosen = parseChoices(draft.equipmentText).includes(choice);
          return <button type="button" key={choice} aria-pressed={chosen} className={chosen ? "answer selected" : "answer"}
            onClick={() => update("equipmentText", formatChoices(toggleChoice(parseChoices(draft.equipmentText), choice)))}>{choice}</button>;
        })}</div>
      </fieldset>

      <fieldset className="profile-question">
        <legend>{t.profileChoices.injuryQuestion}</legend>
        <div className="answer-grid">{INJURY_CHOICES.map((choice) => {
          const chosen = parseChoices(injuryAnswer).includes(choice);
          return <button type="button" key={choice} aria-pressed={chosen} className={chosen ? "answer selected" : "answer"}
            onClick={() => onInjuryChange(formatChoices(toggleChoice(parseChoices(injuryAnswer), choice)))}>{choice}</button>;
        })}</div>
      </fieldset>

      <label className="textarea-label">{t.profileChoices.requestedQuestion} <small>{t.profileChoices.requestedHint}</small>
        <textarea maxLength={1000} value={draft.requestedExercises} onChange={(event) => update("requestedExercises", event.target.value)} />
      </label>

      {/* Yaş/boy/kilo hedefle birlikte okunur: kalori hedefi ve haftalık tempo
          bu dörtlüden çıkar, ayrı ayrı anlam taşımazlar. */}
      <div className="profile-body-link"><span>{t.profileChoices.bodyEyebrow}</span><p>{t.profileChoices.bodyBody(age === null ? "—" : String(age), draft.heightCm === null ? "—" : String(draft.heightCm), draft.weightKg === null ? "—" : String(Math.round(draft.weightKg)))}</p></div>
    </div>

    {/* KUTU 3 — Ayarlar ve hesap. Beş ayrı kutu hâlinde dağınıktı. */}
    <div className="profile-box profile-settings">
      <div className="profile-box-head"><span>{t.profileChoices.settingsEyebrow}</span><strong>{t.profileChoices.settingsTitle}</strong></div>

    <div className="profile-export premium-row"><div><span>{t.premium.profileRowEyebrow}</span><strong>{isPremium ? t.premium.profileRowTitlePremium : t.premium.profileRowTitleFree}</strong><p>{isPremium ? t.premium.profileRowSubtitlePremium : t.premium.profileRowSubtitleFree}</p></div>{isPremium ? <span className="premium-badge">{t.premium.alreadyPremiumBadge}</span> : <button type="button" onClick={onUpgradeRequest}>{t.premium.ctaUpgrade}</button>}</div>

    <div className="profile-preferences"><div><span>{t.profileManager.preferencesEyebrow}</span><strong>{t.profileManager.weightUnitTitle}</strong><small>{t.profileManager.weightUnitHint}</small></div><div className="segmented unit-segmented">{(["kg", "lb"] as WeightUnit[]).map((option) => <button type="button" key={option} aria-pressed={unit === option} className={unit === option ? "selected" : ""} onClick={() => setStoredWeightUnit(option)}>{option === "kg" ? t.profileManager.unitKg : t.profileManager.unitLb}</button>)}</div></div>

    <div className="profile-export"><div><span>{t.profileManager.dataEyebrow}</span><strong>{t.profileManager.exportTitle}</strong><p>{t.profileManager.exportBody}</p></div><button type="button" disabled={exporting} onClick={() => void exportData()}>{exporting ? t.profileManager.exportPreparing : t.profileManager.exportButton}</button></div>

    {/* Profil cevapları değişince Full Body/Bölgesel programlar kendiliğinden
        güncellenir (ekipmandan türetilirler), ama Akıllı Program AI'dan gelir
        ve yeniden üretilmesi gerekir. */}
    {/* Adım bildirimi: yalnız Android'de (kalıcı bildirim orada var). */}
    <StepNotificationSettings />

    {/* Cihaz üstü AI: köprü yoksa (web/iOS) bileşen kendini hiç göstermez. */}
    <LocalAiSettings />

    <div className="profile-export refresh-plan-zone"><div><span>{t.profileManager.refreshEyebrow}</span><strong>{t.profileManager.refreshTitle}</strong><p>{t.profileManager.refreshBody}</p></div><button type="button" disabled={refreshing} onClick={() => { setRefreshing(true); void onRefreshPlan().finally(() => setRefreshing(false)); }}>{refreshing ? t.profileManager.refreshing : t.profileManager.refreshAction}</button></div>

    <div className="profile-export retake-test-zone"><div><span>{t.profileManager.retakeTestEyebrow}</span><strong>{t.profileManager.retakeTestTitle}</strong><p>{t.profileManager.retakeTestBody}</p></div><button type="button" onClick={onRetakeTest}>{t.profileManager.retakeTestAction}</button></div>

    <div className="account-danger-zone progress-reset-zone"><div><span>{t.profileManager.progressResetEyebrow}</span><strong>{t.profileManager.progressResetTitle}</strong><p>{t.profileManager.progressResetBody}</p></div><div><button className="danger" type="button" disabled={saving || resettingProgress} onClick={() => setProgressResetOpen(true)}>{t.profileManager.progressResetButton}</button></div></div>

    <div className="account-danger-zone"><div><span>{t.profileManager.accountManagementEyebrow}</span><strong>{t.profileManager.accountManagementTitle}</strong><p>{t.profileManager.accountManagementBody}</p></div><div><button type="button" disabled={saving} onClick={() => void freezeAccount()}>{t.profileManager.freezeAccount}</button><button className="danger" type="button" disabled={saving} onClick={() => setDeleteOpen(true)}>{t.profileManager.deleteAccount}</button></div></div>

      <div className="profile-signout"><button type="button" onClick={() => void onSignOut()}>{t.profileManager.signOut}</button></div>
    </div>

    {progressResetOpen && <div className="account-delete-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-progress-title" aria-describedby="reset-progress-description"><div className="account-delete-dialog"><span className="danger-label">{t.profileManager.irreversibleLabel}</span><h2 id="reset-progress-title">{t.profileManager.progressResetDialogTitle}</h2><p id="reset-progress-description">{t.profileManager.progressResetDialogBody}</p><label>{t.profileManager.confirmPhraseLabel}<strong>{t.profileManager.progressResetConfirmPhrase}</strong>{t.profileManager.confirmPhraseSuffix}<input autoFocus value={progressResetPhrase} onChange={(event) => setProgressResetPhrase(event.target.value)} /></label><label className="delete-checkbox"><input type="checkbox" checked={progressResetAccepted} onChange={(event) => setProgressResetAccepted(event.target.checked)} /><span>{t.profileManager.progressResetCheckboxLabel}</span></label><div><button type="button" disabled={resettingProgress} onClick={() => setProgressResetOpen(false)}>{t.profileManager.cancel}</button><button className="danger" type="button" disabled={resettingProgress || progressResetPhrase !== t.profileManager.progressResetConfirmPhrase || !progressResetAccepted} onClick={() => void resetProgress()}>{resettingProgress ? t.profileManager.progressResetting : t.profileManager.progressResetButton}</button></div></div></div>}

    {deleteOpen && <div className="account-delete-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description"><div className="account-delete-dialog"><span className="danger-label">{t.profileManager.irreversibleLabel}</span><h2 id="delete-account-title">{t.profileManager.deleteDialogTitle}</h2><p id="delete-account-description">{t.profileManager.deleteDialogBody}</p><label>{t.profileManager.typeEmailLabel}<input ref={deleteEmailRef} type="email" value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} placeholder={user.email || t.profileManager.emailPlaceholder} /></label><label>{t.profileManager.confirmPhraseLabel}<strong>{deleteConfirmPhrase}</strong>{t.profileManager.confirmPhraseSuffix}<input value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} /></label><label className="delete-checkbox"><input type="checkbox" checked={deleteAccepted} onChange={(event) => setDeleteAccepted(event.target.checked)} /><span>{t.profileManager.deleteCheckboxLabel}</span></label><div><button type="button" disabled={saving} onClick={() => setDeleteOpen(false)}>{t.profileManager.cancel}</button><button className="danger" type="button" disabled={saving || deletePhrase !== deleteConfirmPhrase || deleteEmail.trim().toLocaleLowerCase("tr-TR") !== (user.email || "").toLocaleLowerCase("tr-TR") || !deleteAccepted} onClick={() => void deleteAccount()}>{saving ? t.profileManager.deleting : t.profileManager.confirmDeleteAccount}</button></div></div></div>}
  </section>;
}

export function FrozenAccountScreen({ user, onReactivated, onSignOut }: { user: User; onReactivated: () => void; onSignOut: () => Promise<void> }) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function reactivate() {
    const client = createClient();
    if (!client) return;
    setBusy(true);
    const { error: updateError } = await client.from("profiles").update({ account_status: "active", frozen_at: null, updated_at: new Date().toISOString() }).eq("id", user.id);
    setBusy(false);
    if (updateError) setError(t.profileManager.reactivateFailed);
    else onReactivated();
  }
  return <main className="frozen-account"><div className="brand"><span className="brand-mark" aria-hidden="true" /><span>Hede<span className="brand-letter-gradient">f</span><span className="brand-dot">it</span></span></div><section><span>{t.profileManager.frozenEyebrow}</span><h1>{t.profileManager.frozenTitle1}<br /><em>{t.profileManager.frozenTitle2}</em></h1><p>{t.profileManager.frozenBody}</p>{error && <div role="alert">{error}</div>}<button type="button" disabled={busy} onClick={() => void reactivate()}>{busy ? t.profileManager.reactivating : t.profileManager.reactivateAccount}</button><button type="button" className="text-button" onClick={() => void onSignOut()}>{t.profileManager.signOut}</button></section></main>;
}
