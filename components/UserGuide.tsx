"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Dumbbell, Footprints, House, LineChart, Sparkles, UserRound, Utensils } from "lucide-react";
import { useTranslations } from "@/lib/i18n/translate";

/**
 * Kullanma kılavuzu.
 *
 * İlk kayıttan sonra panele girildiğinde aşama aşama gösterilir; sonrasında
 * Ayarlar → "Uygulamayı tanı" ile istendiği zaman açılır. Gösterildiği
 * bilgisi cihazda saklanır (bkz. lib/preferences.ts → guideSeen), böylece
 * her açılışta tekrar karşılamaz.
 *
 * Aşamalar uygulamanın GERÇEK sekmeleriyle birebir aynı sırada ve aynı
 * ikonlarla durur (bkz. FitAiApp → navItems): kılavuzda görülen simge,
 * ekranda aranan simgedir.
 */

const STEP_ICONS = [House, Dumbbell, Footprints, Utensils, LineChart, CalendarDays, UserRound, Sparkles];

export function UserGuide({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const steps = t.userGuide.steps;
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const Icon = STEP_ICONS[index % STEP_ICONS.length];
  const last = index === steps.length - 1;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && index < steps.length - 1) setIndex((current) => current + 1);
      if (event.key === "ArrowLeft" && index > 0) setIndex((current) => current - 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, steps.length, onClose]);

  return <div className="user-guide-overlay" role="dialog" aria-modal="true" aria-labelledby="user-guide-title">
    <article className="user-guide">
      <div className="user-guide-head">
        <div className="eyebrow">{t.userGuide.eyebrow}</div>
        <button type="button" className="user-guide-skip" onClick={onClose}>{t.userGuide.skip}</button>
      </div>

      <div className="user-guide-icon" aria-hidden="true"><Icon className="size-6" /></div>
      <h2 id="user-guide-title">{step.title}</h2>
      <p>{step.body}</p>

      {/* İlerleme noktaları aynı zamanda gezinme: kullanıcı aradığı adıma
          doğrudan atlayabilir, baştan tıklamak zorunda kalmaz. */}
      <div className="user-guide-dots" role="tablist" aria-label={t.userGuide.stepsLabel}>
        {steps.map((item, position) => (
          <button
            key={item.title}
            type="button"
            role="tab"
            aria-selected={position === index}
            aria-label={item.title}
            className={position === index ? "active" : ""}
            onClick={() => setIndex(position)}
          />
        ))}
      </div>

      <div className="user-guide-actions">
        <button type="button" className="back-btn" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>{t.userGuide.previous}</button>
        <span className="user-guide-count">{index + 1}/{steps.length}</span>
        <button type="button" className="primary-btn" onClick={() => last ? onClose() : setIndex((current) => current + 1)}>{last ? t.userGuide.finish : t.userGuide.next}</button>
      </div>
    </article>
  </div>;
}
