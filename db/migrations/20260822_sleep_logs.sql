-- Manuel uyku kaydı.
--
-- Uygulama uykuyu yalnızca profil testinde bir SORU olarak biliyordu; günlük
-- bir kayıt yoktu. Uyku, yükü artırıp artırmama kararında antrenman geçmişi
-- kadar belirleyicidir (bkz. lib/ai/knowledge.ts → "Toparlanma ve uyku"), bu
-- yüzden diğer günlükler gibi kalıcı ve cihazdan bağımsız tutulur.
--
-- Bir gün için TEK kayıt (unique user_id + local_date): "dün gece kaç saat
-- uyudun" sorusunun günde birden çok cevabı olmaz; yeniden girilirse üzerine
-- yazılır (upsert).
create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Uykunun BİTTİĞİ (uyanılan) gün. Gece yarısını aşan uyku tek bir güne
  -- yazılsın diye uyanma günü seçildi.
  local_date date not null,
  -- 15 dk çözünürlük yeterli; 24 saatten uzun "uyku" veri hatasıdır.
  minutes integer not null check (minutes > 0 and minutes <= 1440),
  -- Kullanıcının kendi değerlendirmesi. Süre tek başına toparlanmayı
  -- anlatmıyor: 8 saat kötü uyku ile 7 saat iyi uyku aynı şey değil.
  quality text not null default 'orta' check (quality in ('kotu', 'orta', 'iyi')),
  bed_time time,
  wake_time time,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index if not exists sleep_logs_user_date_idx
  on public.sleep_logs (user_id, local_date desc);

alter table public.sleep_logs enable row level security;
drop policy if exists "Users can read own sleep logs" on public.sleep_logs;
drop policy if exists "Users can insert own sleep logs" on public.sleep_logs;
drop policy if exists "Users can update own sleep logs" on public.sleep_logs;
drop policy if exists "Users can delete own sleep logs" on public.sleep_logs;
create policy "Users can read own sleep logs" on public.sleep_logs for select using (auth.uid() = user_id);
create policy "Users can insert own sleep logs" on public.sleep_logs for insert with check (auth.uid() = user_id);
create policy "Users can update own sleep logs" on public.sleep_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own sleep logs" on public.sleep_logs for delete using (auth.uid() = user_id);
