// Bağlam kurucu ve bağlam bütçesi.
//
// Göç öncesinde koça giden bağlam, istemcinin ürettiği 8.000 karakterlik düz
// bir metindi ve son 12 mesajın tamamı her istekte tekrar gönderiliyordu. İki
// sonucu vardı: (1) her mesaj, konuyla ilgisi olmayan geçmişin bedelini
// ödüyordu, (2) sunucu bağlamın doğruluğunu denetleyemiyordu.
//
// Buradaki kural: BAĞLAM SEÇİLİR, DÖKÜLMEZ. Öncelik sırası —
//   1. kullanıcının şu anki mesajı        (her zaman)
//   2. bugünün deterministik gerçekleri   (her zaman)
//   3. aktif hedef                        (her zaman)
//   4. ilgili trend                       (yalnız hesaplanabildiyse)
//   5. ilgili hafıza                      (puanla sıralanmış, sınırlı)
//   6. ilgili bilgi parçası               (yalnız sorguyla eşleşiyorsa)
//   7. konuşma özeti                      (yalnız sohbet uzunsa)
//
// Eski ve alakasız bilgi bağlamı TÜKETMEZ.

import { formatKnowledge, staticKnowledgeRetriever, type KnowledgeChunk, type KnowledgeRetriever } from "./knowledge.ts";
import { formatMemories, rankMemories, type UserMemory } from "./memory.ts";
import { buildCoachSystemPrompt, type PromptInput } from "./prompts.ts";
import { atlasLines } from "./exercise-atlas.ts";
import type { CoachFacts } from "./intelligence.ts";
import type { AiMessage } from "./types.ts";

/** Bağlama girecek en fazla hafıza sayısı. Hepsi değil, en alakalı olanlar. */
export const MEMORY_BUDGET = 8;
export const KNOWLEDGE_BUDGET = 2;
// Bu sayının ötesindeki mesajlar tek tek gönderilmez, özetlenir.
export const RECENT_MESSAGE_BUDGET = 6;
const SUMMARY_CHAR_BUDGET = 600;

export type UserCoachContext = {
  facts: CoachFacts;
  memories: UserMemory[];
  knowledge: KnowledgeChunk[];
  atlas: string[];
  recentMessages: AiMessage[];
  conversationSummary?: string;
};

/**
 * Uzun sohbeti kısaltır.
 *
 * Neden MODELLE özetlemiyoruz? Özet için ikinci bir LLM çağrısı, her mesajın
 * gecikmesini ve maliyetini iki katına çıkarır — tam da kaçınmaya çalıştığımız
 * şey. Bunun yerine eski mesajlardan deterministik, kayıpsız-olmayan ama ucuz
 * bir "neler konuşuldu" satırı üretilir. Model bunu bağlam olarak alır, sohbetin
 * konusunu hatırlar; ayrıntı gerekiyorsa kullanıcı zaten tekrar sorar.
 */
export function summarizeOlderMessages(messages: AiMessage[]): string | undefined {
  if (messages.length <= RECENT_MESSAGE_BUDGET) return undefined;
  const older = messages.slice(0, -RECENT_MESSAGE_BUDGET);
  const userTopics = older
    .filter((message) => message.role === "user")
    .map((message) => message.text.replace(/\s+/g, " ").trim().slice(0, 90))
    .filter(Boolean);
  if (!userTopics.length) return undefined;
  let summary = `Kullanıcı bu sohbette daha önce şunları sordu: ${userTopics.join(" · ")}`;
  if (summary.length > SUMMARY_CHAR_BUDGET) summary = `${summary.slice(0, SUMMARY_CHAR_BUDGET - 1)}…`;
  return summary;
}

/**
 * `CoachFacts`'ten modele gidecek JSON'u üretir. `undefined` alanlar
 * JSON.stringify tarafından zaten atılır; ayrıca boş kalan üst düzey gruplar da
 * temizlenir ki model boş bir `"today": {}` görüp "veri var ama sıfır" sanmasın.
 */
export function factsJson(facts: CoachFacts): string {
  const groups: Record<string, unknown> = {
    profile: facts.profile,
    goals: facts.goals,
    today: facts.today,
    trends: facts.trends,
    activity: facts.activity,
    training: facts.training,
  };
  const payload: Record<string, unknown> = {};
  for (const [name, group] of Object.entries(groups)) {
    if (group && typeof group === "object" && Object.keys(group as object).length) payload[name] = group;
  }
  if (facts.missing.length) payload.unavailable = facts.missing;
  return JSON.stringify(payload);
}

export async function buildCoachContext(input: {
  facts: CoachFacts;
  memories?: UserMemory[];
  messages: AiMessage[];
  retriever?: KnowledgeRetriever;
  locale?: "tr" | "en";
}): Promise<UserCoachContext> {
  const question = input.messages.at(-1)?.text || "";
  const retriever = input.retriever ?? staticKnowledgeRetriever;
  // Bilgi getirimi SORUYA göre yapılır, profile göre değil: kullanıcı uyku
  // sorduğunda protein parçasını göndermenin bir faydası yok.
  const knowledge = await retriever.retrieve(question, { locale: input.locale, limit: KNOWLEDGE_BUDGET });

  return {
    facts: input.facts,
    memories: rankMemories(input.memories ?? [], MEMORY_BUDGET),
    knowledge,
    atlas: atlasLines(question, input.facts.profile, input.locale === "en" ? "en" : "tr"),
    recentMessages: input.messages.slice(-RECENT_MESSAGE_BUDGET),
    conversationSummary: summarizeOlderMessages(input.messages),
  };
}

/**
 * Sohbet DIŞI görevler için bağlam.
 *
 * Farkı: konuşma geçmişi yoktur. Bilgi getirimi bir `query` dizesiyle yapılır
 * (ör. hedef metni, öğün özeti başlığı) — mesaj listesi taklit etmek yerine
 * ne aradığımızı doğrudan söylemek daha dürüst ve daha isabetli.
 *
 * `facts` burada HAZIR gelir: her rota kendi deterministik motorunu zaten
 * çalıştırıyor (planGoal, profileSignals, validateWeeklySummary...). Onları
 * yeniden hesaplamak iş mantığını ikinci kez yazmak olurdu.
 */
export async function buildTaskContext(input: {
  memories?: UserMemory[];
  query: string;
  retriever?: KnowledgeRetriever;
  locale?: "tr" | "en";
}): Promise<Pick<UserCoachContext, "memories" | "knowledge">> {
  const retriever = input.retriever ?? staticKnowledgeRetriever;
  return {
    memories: rankMemories(input.memories ?? [], MEMORY_BUDGET),
    knowledge: await retriever.retrieve(input.query, { locale: input.locale, limit: KNOWLEDGE_BUDGET }),
  };
}

/** Bağlamı sistem promptuna çevirir. */
export function contextToSystemPrompt(context: UserCoachContext, options: { locale: "tr" | "en"; safetyInstruction?: string; compact?: boolean }): string {
  const promptInput: PromptInput = {
    locale: options.locale,
    factsJson: factsJson(context.facts),
    memoryLines: formatMemories(context.memories),
    // Cihaz üstü modelde bilgi parçaları ATLANIR: ölçüldü, TTFT'nin tamamı
    // prefill süresi (344 token ÷ 81 tok/s ≈ 4,3 sn). Her bilgi parçası
    // istemi ~50 token büyütüyor, yani her biri yarım saniye gecikme. Koçluk
    // yanıtının çekirdeği <facts> ve <memory>; genel bilgi metni mobilde bu
    // bedeli hak etmiyor.
    knowledgeLines: options.compact ? [] : formatKnowledge(context.knowledge),
    atlasLines: context.atlas,
    conversationSummary: context.conversationSummary,
    safetyInstruction: options.safetyInstruction,
    compact: options.compact,
  };
  return buildCoachSystemPrompt(promptInput);
}
