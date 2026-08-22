"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWeightUnit, setStoredWeightUnit } from "@/lib/preferences";
import type { WeightUnit } from "@/lib/units";
import { LocalAiSettings } from "@/components/LocalAiSettings";
import { StepNotificationSettings } from "@/components/StepNotificationSettings";
import { DailyReminderSettings } from "@/components/DailyReminderSettings";
import { useTranslations } from "@/lib/i18n/translate";

/**
 * Ayarlar.
 *
 * Eskiden profil ekranı tek bir uzun sayfaydı: kişisel bilgiler, profil
 * testinin soruları, tercihler, veri dışa aktarma ve hesap silme alt alta
 * duruyordu. "Kilo birimini değiştireceğim" diyen kullanıcı hesap silme
 * düğmesinin yanından geçmek zorunda kalıyordu.
 *
 * Artık profil YALNIZ kimlik ve ölçüdür; değiştirilebilir her ayar buradadır.
 * Profil ekranının sağ üstündeki dişliyle açılır (bkz. ProfileManager).
 */

const EXPORT_TABLES = [
  "profiles", "profile_history", "workout_sessions", "workout_exercise_logs", "workout_set_logs",
  "body_measurements", "sport_activity_entries", "activity_logs", "food_entries", "nutrition_goals",
  "user_streaks", "reminder_preferences", "workout_plans", "workout_schedule", "weekly_ai_reviews",
  "sleep_logs",
];

export function SettingsPanel({
  user, onBack, onFrozen, onDeleted, onProgressReset, onRetakeTest, onRefreshPlan, onSignOut,
  isPremium, onUpgradeRequest, onOpenGuide,
}: {
  user: User;
  onBack: () => void;
  onFrozen: () => void;
  onDeleted: () => void;
  onProgressReset: () => void;
  onRetakeTest: () => void;
  onRefreshPlan: () => Promise<void>;
  onSignOut: () => Promise<void>;
  isPremium: boolean;
  onUpgradeRequest: () => void;
  /** Kullanma kılavuzunu açar (bkz. components/UserGuide.tsx). */
  onOpenGuide: () => void;
}) {
  const t = useTranslations();
  const unit = useWeightUnit();
  const deleteConfirmPhrase = t.profileManager.deleteConfirmPhrase;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteAccepted, setDeleteAccepted] = useState(false);
  const [progressResetOpen, setProgressResetOpen] = useState(false);
  const [progressResetPhrase, setProgressResetPhrase] = useState("");
  const [progressResetAccepted, setProgressResetAccepted] = useState(false);
  const [resettingProgress, setResettingProgress] = useState(false);
  const deleteEmailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!deleteOpen) return undefined;
    deleteEmailRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setDeleteOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deleteOpen, busy]);

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

  async function freezeAccount() {
    if (!window.confirm(t.profileManager.freezeConfirm)) return;
    const client = createClient();
    if (!client) return;
    setBusy(true);
    const { error } = await client.from("profiles").update({ account_status: "frozen", frozen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", user.id);
    setBusy(false);
    if (error) setMessage(t.profileManager.freezeFailed);
    else onFrozen();
  }

  async function deleteAccount() {
    if (deletePhrase !== deleteConfirmPhrase || deleteEmail.trim().toLocaleLowerCase("tr-TR") !== (user.email || "").toLocaleLowerCase("tr-TR") || !deleteAccepted) return;
    const client = createClient();
    if (!client) return;
    setBusy(true);
    setMessage("");
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) {
      setBusy(false);
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
      setBusy(false);
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

  return <section className="profile-editor settings-panel" aria-labelledby="settings-title">
    <div className="settings-head">
      <button type="button" className="back-btn" onClick={onBack}><ArrowLeft size={13} />{t.settings.backToProfile}</button>
      <div className="eyebrow">{t.settings.eyebrow}</div>
      <h2 id="settings-title">{t.settings.title}</h2>
      <p>{t.settings.body}</p>
    </div>

    {message && <p className="profile-save-message" role="status">{message}</p>}

    {/* KUTU 1 — Üyelik ve tercihler. */}
    <div className="profile-box profile-settings">
      <div className="profile-box-head"><span>{t.settings.preferencesEyebrow}</span><strong>{t.settings.preferencesTitle}</strong></div>

      <div className="profile-export premium-row"><div><span>{t.premium.profileRowEyebrow}</span><strong>{isPremium ? t.premium.profileRowTitlePremium : t.premium.profileRowTitleFree}</strong><p>{isPremium ? t.premium.profileRowSubtitlePremium : t.premium.profileRowSubtitleFree}</p></div>{isPremium ? <span className="premium-badge">{t.premium.alreadyPremiumBadge}</span> : <button type="button" onClick={onUpgradeRequest}>{t.premium.ctaUpgrade}</button>}</div>

      <div className="profile-preferences"><div><span>{t.profileManager.preferencesEyebrow}</span><strong>{t.profileManager.weightUnitTitle}</strong><small>{t.profileManager.weightUnitHint}</small></div><div className="segmented unit-segmented">{(["kg", "lb"] as WeightUnit[]).map((option) => <button type="button" key={option} aria-pressed={unit === option} className={unit === option ? "selected" : ""} onClick={() => setStoredWeightUnit(option)}>{option === "kg" ? t.profileManager.unitKg : t.profileManager.unitLb}</button>)}</div></div>

      {/* Günlük hatırlatmalar: sabah selamı, antrenman günü uyarısı, su ve
          doğa önerileri (bkz. components/DailyReminderSettings.tsx). */}
      <DailyReminderSettings />

      {/* Adım bildirimi: yalnız Android'de (kalıcı bildirim orada var). */}
      <StepNotificationSettings />

      {/* Cihaz üstü AI: köprü yoksa (web/iOS) bileşen kendini hiç göstermez. */}
      <LocalAiSettings />
    </div>

    {/* KUTU 2 — Plan, test ve kılavuz. */}
    <div className="profile-box profile-settings">
      <div className="profile-box-head"><span>{t.settings.planEyebrow}</span><strong>{t.settings.planTitle}</strong></div>

      <div className="profile-export"><div><span>{t.settings.guideEyebrow}</span><strong>{t.settings.guideTitle}</strong><p>{t.settings.guideBody}</p></div><button type="button" onClick={onOpenGuide}>{t.settings.guideAction}</button></div>

      <div className="profile-export refresh-plan-zone"><div><span>{t.profileManager.refreshEyebrow}</span><strong>{t.profileManager.refreshTitle}</strong><p>{t.profileManager.refreshBody}</p></div><button type="button" disabled={refreshing} onClick={() => { setRefreshing(true); void onRefreshPlan().finally(() => setRefreshing(false)); }}>{refreshing ? t.profileManager.refreshing : t.profileManager.refreshAction}</button></div>

      {/* Profil testinin SORULARI artık yalnız testin içinde. Buradan yapılan
          tek şey testi yeniden açmak; hedef/ekipman/sakatlık cevapları iki
          ayrı yerde durduğunda hangisinin geçerli olduğu belirsiz kalıyordu. */}
      <div className="profile-export retake-test-zone"><div><span>{t.profileManager.retakeTestEyebrow}</span><strong>{t.profileManager.retakeTestTitle}</strong><p>{t.profileManager.retakeTestBody}</p></div><button type="button" onClick={onRetakeTest}>{t.profileManager.retakeTestAction}</button></div>
    </div>

    {/* KUTU 3 — Veri ve hesap. */}
    <div className="profile-box profile-settings">
      <div className="profile-box-head"><span>{t.settings.accountEyebrow}</span><strong>{t.settings.accountTitle}</strong></div>

      <div className="profile-account"><span>{t.profileManager.verifiedAccount}</span><strong>{user.email}</strong><small>{t.profileManager.emailVerified}</small></div>

      <div className="profile-export"><div><span>{t.profileManager.dataEyebrow}</span><strong>{t.profileManager.exportTitle}</strong><p>{t.profileManager.exportBody}</p></div><button type="button" disabled={exporting} onClick={() => void exportData()}>{exporting ? t.profileManager.exportPreparing : t.profileManager.exportButton}</button></div>

      <div className="account-danger-zone progress-reset-zone"><div><span>{t.profileManager.progressResetEyebrow}</span><strong>{t.profileManager.progressResetTitle}</strong><p>{t.profileManager.progressResetBody}</p></div><div><button className="danger" type="button" disabled={busy || resettingProgress} onClick={() => setProgressResetOpen(true)}>{t.profileManager.progressResetButton}</button></div></div>

      <div className="account-danger-zone"><div><span>{t.profileManager.accountManagementEyebrow}</span><strong>{t.profileManager.accountManagementTitle}</strong><p>{t.profileManager.accountManagementBody}</p></div><div><button type="button" disabled={busy} onClick={() => void freezeAccount()}>{t.profileManager.freezeAccount}</button><button className="danger" type="button" disabled={busy} onClick={() => setDeleteOpen(true)}>{t.profileManager.deleteAccount}</button></div></div>

      <div className="profile-signout"><button type="button" onClick={() => void onSignOut()}>{t.profileManager.signOut}</button></div>
    </div>

    {progressResetOpen && <div className="account-delete-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-progress-title" aria-describedby="reset-progress-description"><div className="account-delete-dialog"><span className="danger-label">{t.profileManager.irreversibleLabel}</span><h2 id="reset-progress-title">{t.profileManager.progressResetDialogTitle}</h2><p id="reset-progress-description">{t.profileManager.progressResetDialogBody}</p><label>{t.profileManager.confirmPhraseLabel}<strong>{t.profileManager.progressResetConfirmPhrase}</strong>{t.profileManager.confirmPhraseSuffix}<input autoFocus value={progressResetPhrase} onChange={(event) => setProgressResetPhrase(event.target.value)} /></label><label className="delete-checkbox"><input type="checkbox" checked={progressResetAccepted} onChange={(event) => setProgressResetAccepted(event.target.checked)} /><span>{t.profileManager.progressResetCheckboxLabel}</span></label><div><button type="button" disabled={resettingProgress} onClick={() => setProgressResetOpen(false)}>{t.profileManager.cancel}</button><button className="danger" type="button" disabled={resettingProgress || progressResetPhrase !== t.profileManager.progressResetConfirmPhrase || !progressResetAccepted} onClick={() => void resetProgress()}>{resettingProgress ? t.profileManager.progressResetting : t.profileManager.progressResetButton}</button></div></div></div>}

    {deleteOpen && <div className="account-delete-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description"><div className="account-delete-dialog"><span className="danger-label">{t.profileManager.irreversibleLabel}</span><h2 id="delete-account-title">{t.profileManager.deleteDialogTitle}</h2><p id="delete-account-description">{t.profileManager.deleteDialogBody}</p><label>{t.profileManager.typeEmailLabel}<input ref={deleteEmailRef} type="email" value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} placeholder={user.email || t.profileManager.emailPlaceholder} /></label><label>{t.profileManager.confirmPhraseLabel}<strong>{deleteConfirmPhrase}</strong>{t.profileManager.confirmPhraseSuffix}<input value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} /></label><label className="delete-checkbox"><input type="checkbox" checked={deleteAccepted} onChange={(event) => setDeleteAccepted(event.target.checked)} /><span>{t.profileManager.deleteCheckboxLabel}</span></label><div><button type="button" disabled={busy} onClick={() => setDeleteOpen(false)}>{t.profileManager.cancel}</button><button className="danger" type="button" disabled={busy || deletePhrase !== deleteConfirmPhrase || deleteEmail.trim().toLocaleLowerCase("tr-TR") !== (user.email || "").toLocaleLowerCase("tr-TR") || !deleteAccepted} onClick={() => void deleteAccount()}>{busy ? t.profileManager.deleting : t.profileManager.confirmDeleteAccount}</button></div></div></div>}
  </section>;
}
