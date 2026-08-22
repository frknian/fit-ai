"use client";

import { ACTIVITY_ICON_PATHS, activityIconName } from "@/lib/activity-icons";

/** Aktivite listelerinde sporun kendi çizgi simgesi (bkz. lib/activity-icons.ts). */
export function ActivityIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg
      className={`activity-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ACTIVITY_ICON_PATHS[activityIconName(name)]} />
    </svg>
  );
}
