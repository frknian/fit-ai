import { tr } from "./dictionaries/tr.ts";

export type Locale = "tr" | "en";
export type Dictionary = typeof tr;

export function translatePainArea(t: Dictionary, value: string): string {
  if (value === "Yok") return t.feedback.painNone;
  if (value === "Bel") return t.feedback.painLowerBack;
  if (value === "Diz") return t.feedback.painKnee;
  if (value === "Omuz") return t.feedback.painShoulder;
  if (value === "Diğer") return t.feedback.painOther;
  return value;
}
