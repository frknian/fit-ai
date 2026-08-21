"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n/translate";
import { readStoredStepGoal } from "@/lib/step-counter";
import {
  isBackgroundStepServiceSupported,
  isStepNotificationEnabled,
  setBackgroundStepGoal,
  setStepNotificationEnabled,
  startBackgroundStepService,
  stopBackgroundStepService,
} from "@/lib/native-step-counter";

/**
 * "Adımı bildirim çubuğunda göster" ayarı.
 *
 * TASARIM KURALI: Hedefit yeniden tasarlanmaz — satır, ProfileManager'daki
 * diğer tercih satırlarıyla (`profile-preferences` + `segmented`) aynı yapıda.
 *
 * Yalnız Android'de görünür: kalıcı bildirim, adımları arka planda sayan
 * foreground service'in ayrılmaz parçası (bkz. StepCounterService.kt). iOS'ta
 * böyle bir bildirim hiç yok, dolayısıyla açılıp kapatılacak bir şey de yok.
 */
export function StepNotificationSettings() {
  // Köprü ve tercih yalnız tarayıcıda okunabilir (StepCounterCard'daki
  // `customGoal` ile aynı kalıp): sunucuda satır hiç render edilmez.
  const [supported] = useState(() => typeof window !== "undefined" && isBackgroundStepServiceSupported());
  const [enabled, setEnabled] = useState(() => typeof window === "undefined" || isStepNotificationEnabled());
  const t = useTranslations();

  if (!supported) return null;

  async function apply(next: boolean) {
    setEnabled(next);
    setStepNotificationEnabled(next);
    if (next) {
      await startBackgroundStepService();
      await setBackgroundStepGoal(readStoredStepGoal());
    } else {
      // Bildirimi gizlemenin tek yolu servisi durdurmak: foreground service
      // çalışırken Android bildirimi her hâlükârda gösterir.
      await stopBackgroundStepService();
    }
  }

  return <div className="profile-preferences step-notification-zone">
    <div>
      <span>{t.stepNotification.eyebrow}</span>
      <strong>{t.stepNotification.title}</strong>
      <small>{enabled ? t.stepNotification.body : t.stepNotification.hint}</small>
    </div>
    <div className="segmented">
      <button type="button" aria-pressed={enabled} className={enabled ? "selected" : ""} onClick={() => void apply(true)}>{t.stepNotification.on}</button>
      <button type="button" aria-pressed={!enabled} className={enabled ? "" : "selected"} onClick={() => void apply(false)}>{t.stepNotification.off}</button>
    </div>
  </div>;
}
