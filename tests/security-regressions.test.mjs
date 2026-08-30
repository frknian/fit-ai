import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../db/migrations/20260829010000_secure_usage_mutations.sql", import.meta.url);
const hardeningMigrationUrl = new URL("../db/migrations/20260830030000_security_hardening.sql", import.meta.url);

test("kota azaltma ve reklam bonusu RPC'leri son kullanıcı rollerinden kaldırılır", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /revoke all on function public\.refund_usage_counter\(text, integer\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.grant_usage_bonus\(text, integer, integer\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.refund_usage_counter_for_user\(uuid, text\) to service_role/i);
  assert.match(sql, /grant execute on function public\.grant_usage_bonus_for_user\(uuid, text\) to service_role/i);
});

test("sunucu reklam bonus miktarını ve günlük tavanı sabitler", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /bonus_count = least\(uc\.bonus_count \+ 1, 3\)/i);
  assert.doesNotMatch(sql, /grant execute on function public\.grant_usage_bonus_for_user\(uuid, text\) to authenticated/i);
});

test("doğrulanmamış reklam ödülü API'si kapalıdır", async () => {
  const { POST } = await import(`../app/api/ads/reward/route.ts?test=${Date.now()}`);
  const response = await POST();
  assert.equal(response.status, 501);
});

test("hesap durumu sorgusu normal kullanıcıyı kendi kimliğiyle sınırlar", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /auth\.role\(\) = 'service_role' or check_user_id = auth\.uid\(\)/i);
  assert.match(sql, /revoke all on function public\.hedefit_xp_chat_bonus\(uuid\) from public, anon, authenticated/i);
});

test("profil oluştururken ücretli plan ve premium alanları taklit edilemez", async () => {
  const sql = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(sql, /if tg_op = 'INSERT' then\s+new\.is_premium := false;\s+new\.plan_tier := 'free';/i);
  assert.match(sql, /before insert or update on public\.profiles/i);
});

test("AI hafıza çıkarımı günlük kotaya ve çıktı sınırına tabidir", async () => {
  const route = await readFile(new URL("../app/api/ai/memory/route.ts", import.meta.url), "utf8");
  const sql = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(route, /checkAndConsumeUsage\(request, "memory", auth\.user\.id\)/);
  assert.match(route, /outputTokenLimit\("memory", usage\.planTier\)/);
  assert.match(sql, /'plan', 'memory'/i);
});

test("öğün planları dondurulmuş hesaplara kapalıdır", async () => {
  const sql = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(sql, /using \(auth\.uid\(\) = user_id and public\.account_is_active\(\)\)/i);
  assert.match(sql, /with check \(auth\.uid\(\) = user_id and public\.account_is_active\(\)\)/i);
});

test("OpenAI sağlık kontrolünde sabit süreli sır doğrulama ve hız sınırı vardır", async () => {
  const route = await readFile(new URL("../app/api/health/openai/route.ts", import.meta.url), "utf8");
  assert.match(route, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(route, /rateLimit\(`deploy-health:\$\{clientKey\(request\)\}`, 5, 5 \* 60_000\)/);
});

test("Android uygulaması şifresiz HTTP trafiğini reddeder", async () => {
  const manifest = await readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});
