-- Premium kullanıcılarda günlük AI kullanım sınırı kaldırılır.
--
-- GEREKÇE: AI maliyeti artık büyük ölçüde cihaz üstü çıkarımla (Android +
-- LiteRT-LM) karşılanıyor; uzak sağlayıcıya (Kimi) giden istek sayısı
-- belirgin biçimde azaldı. Bu sınırlar başlangıçta salt kötüye kullanım/
-- maliyet koruması amaçlıydı; premium plan için artık gerekçesi zayıfladı.
-- Ücretsiz plandaki sınırlar DEĞİŞMEDİ — kötüye kullanım koruması hâlâ
-- gerekli ve premium'a geçişi anlamlı kılan fark bu.
--
-- NOT: bu, TÜM AI çağrılarının ücretsiz olduğu anlamına gelmez — yalnız
-- Android'de ve yerel model kuruluyken çıkarım cihazda çalışır; iOS, web ve
-- yerel modeli olmayan/başarısız olan Android isteklerinde hâlâ uzak
-- sağlayıcıya (ücretli) gidilir. Sınırsızlık kararı bilinçli bir ürün
-- kararıdır, maliyetin sıfıra indiği anlamına gelmez.
--
-- UYGULAMA: integer parametre (p_premium_limit) hâlâ katıdır — Infinity gibi
-- bir "özel sayı" göndermek JSON üzerinden NULL'a döner ve isteklenmeyen SQL
-- üç değerli mantığına (NULL karşılaştırmaları) bağımlı kılardı. Bunun yerine
-- NULL AÇIKÇA "sınırsız" olarak ele alınır: sınır kontrolü tamamen atlanır,
-- sayaç yine de (gözlemlenebilirlik için) artırılır.

create or replace function public.check_and_consume_usage(p_feature text, p_free_limit integer, p_premium_limit integer)
returns table (allowed boolean, current_count integer, effective_limit integer, is_premium boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_is_premium boolean;
  v_limit integer;
  v_count integer;
  v_bonus integer;
  v_effective_limit integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_feature not in ('chat', 'photo', 'text_nutrition', 'weekly_review', 'nutrition_advice', 'plan') then
    raise exception 'invalid feature';
  end if;

  select coalesce(p.is_premium, false) into v_is_premium from public.profiles p where p.id = v_user;
  v_is_premium := coalesce(v_is_premium, false);
  v_limit := case when v_is_premium then p_premium_limit else p_free_limit end;

  insert into public.usage_counters (user_id, feature, usage_date, count)
  values (v_user, p_feature, current_date, 0)
  on conflict (user_id, feature, usage_date) do nothing;

  select uc.count, uc.bonus_count into v_count, v_bonus
  from public.usage_counters uc
  where uc.user_id = v_user
    and uc.feature = p_feature
    and uc.usage_date = current_date
  for update;

  -- v_limit NULL ise (premium + p_premium_limit NULL gönderildi) sınırsızdır:
  -- kontrol tamamen atlanır, sayaç yine artırılır, effective_limit NULL döner
  -- (istemci tarafı bunu Number.isFinite ile "sınır yok" olarak okur).
  if v_limit is null then
    update public.usage_counters uc
    set count = uc.count + 1, updated_at = now()
    where uc.user_id = v_user
      and uc.feature = p_feature
      and uc.usage_date = current_date;
    return query select true, v_count + 1, null::integer, v_is_premium;
    return;
  end if;

  v_effective_limit := v_limit + coalesce(v_bonus, 0);

  if v_count >= v_effective_limit then
    return query select false, v_count, v_effective_limit, v_is_premium;
    return;
  end if;

  update public.usage_counters uc
  set count = uc.count + 1, updated_at = now()
  where uc.user_id = v_user
    and uc.feature = p_feature
    and uc.usage_date = current_date;

  return query select true, v_count + 1, v_effective_limit, v_is_premium;
end;
$$;

grant execute on function public.check_and_consume_usage(text, integer, integer) to authenticated;
