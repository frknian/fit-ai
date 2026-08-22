"use client";

import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { calculateAge, isValidBirthDate, type EditableProfile } from "@/lib/profile";
import { saveProfileWithHistory, signedAvatarUrl } from "@/lib/profile-service";
import { Settings } from "lucide-react";
import { useWeightUnit } from "@/lib/preferences";
import { kgToInputValue, parseWeightInputToKg } from "@/lib/units";
import { SettingsPanel } from "@/components/SettingsPanel";
import { translateGender, useTranslations } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";

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
  onSignOut: () => Promise<void>;
  isPremium: boolean;
  onUpgradeRequest: () => void;
  /** Kullanma kılavuzunu açar; ayarlar sayfasından çağrılır. */
  onOpenGuide: () => void;
};

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function ProfileManager({ user, profile, avatarUrl, onSaved, onFrozen, onDeleted, onProgressReset, onRetakeTest, onSignOut, onRefreshPlan, isPremium, onUpgradeRequest, onOpenGuide }: ProfileManagerProps) {
  // Ayarlar profilin ALT SAYFASI: alt sekme çubuğuna yedinci bir sekme
  // eklemeden erişilir, profil ekranı da yalnız kimlik ve ölçüyle kalır.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "tr-TR";
  const [draft, setDraft] = useState(profile);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
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

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

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

  if (settingsOpen) {
    return <SettingsPanel
      user={user}
      onBack={() => setSettingsOpen(false)}
      onFrozen={onFrozen}
      onDeleted={onDeleted}
      onProgressReset={onProgressReset}
      onRetakeTest={onRetakeTest}
      onRefreshPlan={onRefreshPlan}
      onSignOut={onSignOut}
      isPremium={isPremium}
      onUpgradeRequest={onUpgradeRequest}
      onOpenGuide={onOpenGuide}
    />;
  }

  return <section className="profile-editor profile-manager" aria-labelledby="profile-manager-title">
    <div className="profile-manager-intro">
      {/* Ayarlar dişlisi başlığın sağında: profil ekranı yalnız kimlik ve
          ölçüdür, değiştirilebilir her şey alt sayfada durur. */}
      <div className="profile-manager-title-row">
        <div><div className="eyebrow">{t.profileManager.eyebrow}</div><h2 id="profile-manager-title">{t.profileManager.title}</h2></div>
        <button type="button" className="profile-settings-button" aria-label={t.settings.title} onClick={() => setSettingsOpen(true)}><Settings size={17} /><span>{t.settings.title}</span></button>
      </div>
      <p>{t.profileManager.body}</p>
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

    {/* Antrenman soruları (hedef, ekipman, sakatlık, ortam) buradan
        KALDIRILDI: aynı sorular profil testinde de vardı ve iki yerde
        değiştirilebilen tek bir cevap, hangisinin geçerli olduğunu belirsiz
        bırakıyordu. Artık tek kaynak profil testidir; testi yeniden çözme
        girişi ayarlar sayfasındadır. */}
    <div className="profile-test-link">
      <div><span>{t.profileManager.retakeTestEyebrow}</span><strong>{t.profileManager.retakeTestTitle}</strong><p>{t.profileManager.retakeTestBody}</p></div>
      <button type="button" onClick={onRetakeTest}>{t.profileManager.retakeTestAction}</button>
    </div>

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
