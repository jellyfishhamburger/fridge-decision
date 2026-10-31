-- ============================================================
-- 007_meal_session.sql — 开一次「做饭会话」（预留/扣减的那条主键）
--
-- 为什么需要：meal_sessions 这张表已经开了 RLS，客户端不能直接 INSERT
-- （实测报 42501 new row violates row-level security policy）。
-- 所以给它一个 SECURITY DEFINER 的函数，按当前登录用户所在家庭建会话。
-- ============================================================

create or replace function start_meal_session(p_recipe text, p_plan jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_hh uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select household_id into v_hh
    from household_members where user_id = auth.uid()
   order by (role = 'owner') desc
   limit 1;

  if v_hh is null then raise exception 'no household'; end if;

  insert into meal_sessions (household_id, user_id, recipe_id, status, plan)
  values (v_hh, auth.uid(), p_recipe, 'selected', coalesce(p_plan, '[]'::jsonb))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function start_meal_session(text, jsonb) from anon;
revoke all on function start_meal_session(text, jsonb) from public;
grant execute on function start_meal_session(text, jsonb) to authenticated;
