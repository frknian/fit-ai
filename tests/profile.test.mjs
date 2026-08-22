import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { birthdayPremiumAccess, calculateAge, isBirthday, isValidBirthDate, profileHistoryLabel } from "../lib/profile.ts";

test("yaşı doğum tarihinden ve kontrol tarihinden doğru hesaplar", () => {
  assert.equal(calculateAge("2000-07-22", new Date("2026-07-21T12:00:00Z")), 25);
  assert.equal(calculateAge("2000-07-22", new Date("2026-07-22T12:00:00Z")), 26);
  assert.equal(calculateAge("2000-02-30", new Date("2026-07-22T12:00:00Z")), null);
  assert.equal(isValidBirthDate("2030-01-01", new Date("2026-07-22T12:00:00Z")), false);
});

test("doğum günü premium bayrağı varsayılan olarak kapalı kalır", () => {
  const birthday = new Date("2026-07-22T12:00:00Z");
  assert.equal(isBirthday("2000-07-22", birthday), true);
  assert.equal(birthdayPremiumAccess("2000-07-22", { key: "birthday_premium_day", enabled: false, config: {} }, birthday), false);
  assert.equal(birthdayPremiumAccess("2000-07-22", { key: "birthday_premium_day", enabled: true, config: {} }, birthday), true);
});

test("profil tarihçesi alanları Türkçe ve anlaşılır etiketlenir", () => {
  assert.equal(profileHistoryLabel("weight_kg"), "Kilo");
  assert.equal(profileHistoryLabel("birth_date"), "Doğum tarihi");
  assert.equal(profileHistoryLabel("requested_exercises"), "İstenen hareketler");
});

test("profil yaşam döngüsü özel depolama, RLS ve güçlü silme doğrulaması içerir", async () => {
  const [component, route, progressResetRoute, migration, auth, schema] = await Promise.all([
    // Hesap işlemleri (dondurma, silme, ilerleme sıfırlama) profil ekranından
    // ayarlar alt sayfasına taşındı; profil yalnız kimlik ve ölçü tutuyor.
    readFile(new URL("../components/SettingsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/delete/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/reset-progress/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/20260723_profile_lifecycle.sql", import.meta.url), "utf8"),
    readFile(new URL("../components/AuthScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/supabase-schema.sql", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /birth_date/);
  assert.match(component, /deleteConfirmPhrase/);
  assert.match(component, /progressResetConfirmPhrase/);
  assert.match(component, /onProgressReset/);
  assert.match(component, /t\.profileManager\.freezeAccount/);
  assert.doesNotMatch(component, /DEĞİŞİKLİK GEÇMİŞİ|her doğum gününde otomatik güncellenir/);
  // Avatar yüklemesi profil ekranında kaldı (kimlik bilgisi orada düzenlenir).
  const profileScreen = await readFile(new URL("../components/ProfileManager.tsx", import.meta.url), "utf8");
  assert.match(profileScreen, /profile-avatars/);
  assert.match(route, /auth\.admin\.deleteUser/);
  assert.match(route, /SUPABASE_SECRET_KEY/);
  // Bu iki geri alınamaz uç nokta, sunucu tarafı jeton doğrulamasını (e-posta
  // onayı ve hız sınırı dahil) tekrar yazmak yerine paylaşılan
  // authenticateRequest()'i kullanmalı (bkz. lib/api-auth.ts).
  assert.match(route, /authenticateRequest\(request\)/);
  assert.match(progressResetRoute, /authenticateRequest\(request\)/);
  assert.match(progressResetRoute, /payload\.confirmation !== "RESET_PROGRESS"/);
  for (const table of ["food_entries", "sport_activity_entries", "activity_logs", "user_streaks", "workout_sessions"]) {
    assert.match(progressResetRoute, new RegExp(table));
  }
  // Takvim satırı workout_sessions'a "on delete cascade" ile bağlı olduğu için,
  // seanslar önce silinseydi tamamlanmış günün takvim kaydı da yok olurdu; oysa
  // sıfırlamanın sözü takvimi korumak. Bağın çözülmesi silme döngüsünden ÖNCE olmalı.
  const scheduleRelease = progressResetRoute.indexOf('.from("workout_schedule")');
  const deletionLoop = progressResetRoute.indexOf("for (const table of PROGRESS_TABLES)");
  assert.ok(scheduleRelease !== -1, "takvim bağı çözülmeden ilerleme sıfırlanamaz");
  assert.ok(scheduleRelease < deletionLoop, "takvim bağı silme döngüsünden önce çözülmeli");
  assert.match(progressResetRoute, /completed_session_id: null/);
  assert.match(schema, /completed_session_id, user_id\) references public\.workout_sessions\(id, user_id\) on delete cascade/);

  assert.match(migration, /birthday_premium_day', false/);
  assert.match(migration, /profile_history/);
  assert.match(migration, /account_is_active/);
  assert.doesNotMatch(migration, /public\.user_streaks/);
  assert.doesNotMatch(migration, /public\.activity_logs/);
  assert.match(migration, /public = false/);
});
