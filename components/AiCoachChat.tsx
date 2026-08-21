"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import type { CoachMessage } from "@/lib/ai-coach";
import { authorizedFetch } from "@/lib/api-client";
import { generateLocalCoachResponse } from "@/lib/ai/local-first";
import { useTranslations } from "@/lib/i18n/translate";
import { useLocale } from "@/lib/i18n/locale";
import { useAdUnlock } from "@/hooks/useAdUnlock";

type CoachSignals = Record<string, unknown>;
type AssistantMeta = { provider?: string; model?: string; promptVersion?: string };

export function AiCoachChat({ context, signals, onUpgradeRequest }: { context: string; signals?: CoachSignals; onUpgradeRequest?: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const suggestions = [t.aiCoachChat.suggestion1, t.aiCoachChat.suggestion2, t.aiCoachChat.suggestion3];
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<CoachMessage & { id: string; meta?: AssistantMeta }>>([]);
  // Verilen oylar yalnız bu oturumda tutulur; kalıcı kayıt sunucuda
  // (ai_feedback). Amaç düğmenin basıldığını göstermek.
  const [ratings, setRatings] = useState<Record<string, 1 | -1>>({});
  const [busy, setBusy] = useState(false);
  // Cihaz üstü modelden akan kısmi yanıt. Tam yanıt gelince mesaj listesine
  // taşınır ve burası temizlenir.
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const [notice, setNotice] = useState("");
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const lastConversation = useRef<CoachMessage[]>([]);
  const adUnlock = useAdUnlock("chat");

  function closeCoach() {
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCoach();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => () => requestController.current?.abort(), []);

  async function sendConversation(conversation: CoachMessage[]) {
    lastConversation.current = conversation;
    setBusy(true);
    setError("");
    setNotice("");
    setLimitReached(false);
    const controller = new AbortController();
    requestController.current = controller;
    try {
      // ÖNCE CİHAZ. Yerel model kuruluysa istem ve yanıt telefondan hiç
      // çıkmaz: ne uzak sağlayıcıya ne Hedefit sunucusuna gider, kullanım
      // hakkı harcanmaz ve çevrimdışı çalışır. Köprü yoksa (web/tarayıcı) ya
      // da model hazır değilse `null` döner ve akış sunucuya düşer —
      // kullanıcı bir fark görmez.
      const local = await generateLocalCoachResponse({
        messages: conversation.map(({ role, text: messageText }) => ({ role, text: messageText })),
        locale,
        signals,
        fetcher: authorizedFetch,
        // Cihazda üretim ölçülen medyanda ~26 sn sürüyor ama ilk token
        // ~4 sn'de geliyor; akış olmadan kullanıcı boş ekrana bakıyor.
        onToken: setStreamingText,
      });
      setStreamingText("");
      if (local) {
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: "assistant",
          text: local.text,
          meta: { provider: local.provider, model: local.model, promptVersion: local.promptVersion },
        }]);
        void rememberPreferences(conversation.at(-1)?.text || "");
        return;
      }

      const response = await authorizedFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context, signals, messages: conversation.map(({ role, text: messageText }) => ({ role, text: messageText })), locale }), signal: controller.signal });
      const result = await response.json().catch(() => ({})) as { text?: string; error?: string; notice?: string; usage?: { used: number; limit: number }; limitReached?: boolean; provider?: string; model?: string; promptVersion?: string };
      if (!response.ok || !result.text) {
        if (result.limitReached) setLimitReached(true);
        throw new Error(result.error || t.aiCoachChat.coachUnresponsive);
      }
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: result.text as string,
        meta: { provider: result.provider, model: result.model, promptVersion: result.promptVersion },
      }]);
      setNotice(result.notice || "");
      if (result.usage) setUsage(result.usage);
      // Kalıcı tercih çıkarımı YANIT EKRANA BASILDIKTAN SONRA, arka planda.
      // Yanıtın önüne konsaydı kullanıcı ikinci bir model çağrısını beklerdi.
      // Başarısız olursa sessizce geçilir; sohbet zaten tamamlandı.
      void rememberPreferences(conversation.at(-1)?.text || "");
    } catch (requestError) {
      if ((requestError as Error).name !== "AbortError") setError(requestError instanceof Error ? requestError.message : t.aiCoachChat.coachUnreachable);
    } finally {
      if (requestController.current === controller) requestController.current = null;
      setStreamingText("");
      setBusy(false);
    }
  }

  async function send(text: string) {
    const value = text.trim().slice(0, 600);
    if (!value || busy) return;
    const userMessage = { id: crypto.randomUUID(), role: "user" as const, text: value };
    const conversation = [...messages, userMessage].slice(-12);
    setMessages(conversation);
    setInput("");
    await sendConversation(conversation);
  }

  async function watchAdForExtraMessage() {
    const granted = await adUnlock.watchAd();
    if (granted && lastConversation.current.length) await sendConversation(lastConversation.current);
  }

  async function rememberPreferences(message: string) {
    if (!message) return;
    try {
      await authorizedFetch("/api/ai/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, locale }) });
    } catch {
      // Hafıza bir iyileştirmedir; başarısızlığı kullanıcıya gösterilmez.
    }
  }

  async function rateMessage(messageId: string, rating: 1 | -1, meta?: AssistantMeta) {
    setRatings((current) => ({ ...current, [messageId]: rating }));
    try {
      await authorizedFetch("/api/ai/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, rating, category: "conversation", ...meta }) });
    } catch {
      // Oy kaydedilemezse arayüzdeki seçim kalır; tekrar denemeye gerek yok.
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  function stop() {
    requestController.current?.abort();
    requestController.current = null;
    setBusy(false);
  }

  return <>
    {/* Panel açıkken kapatma zaten panel başlığındaki × düğmesiyle yapılıyor;
        sağ alttaki başlatıcı kutusunun panelle üst üste durması gereksizdi. */}
    {!open && <button ref={launcherRef} type="button" className="coach-launcher" aria-label={t.aiCoachChat.openCoach} aria-expanded={false} aria-controls="ai-coach-panel" onClick={() => setOpen(true)}><span aria-hidden="true">✦</span><strong>{t.aiCoachChat.launcherLabel}</strong></button>}
    {open && <aside id="ai-coach-panel" className="coach-chat" role="dialog" aria-modal="false" aria-labelledby="ai-coach-title">
      <header><div><span className="coach-online" aria-hidden="true" /><div><strong id="ai-coach-title">{t.aiCoachChat.title}</strong><small>{t.aiCoachChat.subtitle}</small></div></div><button type="button" aria-label={t.aiCoachChat.closeCoach} onClick={closeCoach}>×</button></header>
      <Conversation className="coach-conversation"><ConversationContent className="coach-messages">
        {messages.length === 0 ? <ConversationEmptyState title={t.aiCoachChat.emptyTitle} description={t.aiCoachChat.emptyDescription} icon={<span className="coach-empty-icon">✦</span>} /> : messages.map((message) => <Message from={message.role} key={message.id}><MessageContent><MessageResponse>{message.text}</MessageResponse>
          {message.role === "assistant" && <div className="coach-feedback">
            <button type="button" aria-label={t.aiCoachChat.helpful} aria-pressed={ratings[message.id] === 1} className={ratings[message.id] === 1 ? "active" : ""} onClick={() => void rateMessage(message.id, 1, message.meta)}>👍</button>
            <button type="button" aria-label={t.aiCoachChat.notHelpful} aria-pressed={ratings[message.id] === -1} className={ratings[message.id] === -1 ? "active" : ""} onClick={() => void rateMessage(message.id, -1, message.meta)}>👎</button>
          </div>}
        </MessageContent></Message>)}
        {busy && streamingText && <Message from="assistant"><MessageContent><MessageResponse>{streamingText}</MessageResponse></MessageContent></Message>}
        {busy && !streamingText && <div className="coach-thinking" role="status"><i /><i /><i /><span>{t.aiCoachChat.thinking}</span></div>}
        {error && <div className="coach-error" role="alert">
          {error} {!limitReached && t.aiCoachChat.tryAgain}
          {limitReached && adUnlock.showButton && <button type="button" className="watch-ad-inline-cta" disabled={adUnlock.watching} onClick={() => void watchAdForExtraMessage()}>{adUnlock.watching ? t.ads.watching : t.ads.watchAdCta}</button>}
          {limitReached && onUpgradeRequest && <button type="button" className="upgrade-inline-cta" onClick={onUpgradeRequest}>{t.premium.upgradeCta}</button>}
        </div>}
        {adUnlock.status === "granted" && <div className="coach-notice" role="status">{t.ads.rewardGranted}</div>}
        {adUnlock.status === "failed" && <div className="coach-notice" role="status">{t.ads.adFailed}</div>}
        {notice && <div className="coach-notice" role="status">{notice}</div>}
        {usage && <div className="coach-usage" role="status">{t.aiCoachChat.dailyUsage(usage.used, usage.limit)}</div>}
      </ConversationContent><ConversationScrollButton aria-label={t.aiCoachChat.goToLastMessage} /></Conversation>
      {messages.length === 0 && <div className="coach-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}</button>)}</div>}
      <form className="coach-input" onSubmit={submit}><label htmlFor="coach-question" className="sr-only">{t.aiCoachChat.inputLabel}</label><textarea ref={inputRef} id="coach-question" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} placeholder={t.aiCoachChat.inputPlaceholder} maxLength={600} rows={2} /><button type={busy ? "button" : "submit"} aria-label={busy ? t.aiCoachChat.stopResponse : t.aiCoachChat.sendQuestion} onClick={busy ? stop : undefined}>{busy ? "■" : "↑"}</button></form>
      <p className="coach-disclaimer">{t.aiCoachChat.disclaimer}</p>
    </aside>}
  </>;
}
