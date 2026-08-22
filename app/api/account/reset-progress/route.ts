import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "../../../../lib/supabase/url.ts";
import { authenticateRequest } from "../../../../lib/api-auth.ts";
import { rateLimit, tooManyRequests } from "../../../../lib/rate-limit.ts";

export const runtime = "nodejs";

const PROGRESS_TABLES = [
  "weekly_ai_reviews",
  "food_entries",
  "sport_activity_entries",
  "activity_logs",
  "user_streaks",
  "body_measurements",
  "sleep_logs",
  "workout_sessions",
] as const;

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  // Geri alınamaz bir işlem: sohbet gibi günlük kotaya değil, kötüye
  // kullanımı sınırlayan dar bir hız sınırına bağlı.
  const rateLimitResult = rateLimit(`account-reset-progress:${auth.user.id}`, 3, 3_600_000);
  if (!rateLimitResult.ok) return tooManyRequests(rateLimitResult.retryAfterSeconds);

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !anonKey || !secretKey) return Response.json({ error: "İlerleme sıfırlama servisi yapılandırılmamış." }, { status: 503 });

  let payload: { confirmation?: string };
  try {
    payload = await request.json() as { confirmation?: string };
  } catch {
    return Response.json({ error: "Sıfırlama onayı okunamadı." }, { status: 400 });
  }
  if (payload.confirmation !== "RESET_PROGRESS") return Response.json({ error: "Sıfırlama onayı eşleşmiyor." }, { status: 400 });

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // workout_schedule.completed_session_id, workout_sessions'a "on delete cascade"
  // ile bağlıdır (bkz. db/supabase-schema.sql). Seanslar önce silinirse tamamlanmış
  // güne ait TAKVİM SATIRI da silinir; oysa sıfırlama takvimi korumalı. Bu yüzden
  // seansları silmeden önce bağı çözüp günü yeniden "planlandı" durumuna alıyoruz.
  const { error: scheduleError } = await admin
    .from("workout_schedule")
    .update({ completed_session_id: null, status: "planned" })
    .eq("user_id", auth.user.id)
    .not("completed_session_id", "is", null);
  if (scheduleError) {
    console.error("[progress-reset] schedule release failed", { userId: auth.user.id, code: scheduleError.code });
    return Response.json({ error: "İlerleme verileri sıfırlanamadı. Lütfen tekrar dene." }, { status: 500 });
  }

  for (const table of PROGRESS_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", auth.user.id);
    if (error) {
      console.error("[progress-reset] deletion failed", { table, userId: auth.user.id, code: error.code });
      return Response.json({ error: "İlerleme verileri sıfırlanamadı. Lütfen tekrar dene." }, { status: 500 });
    }
  }

  return Response.json({ reset: true });
}
