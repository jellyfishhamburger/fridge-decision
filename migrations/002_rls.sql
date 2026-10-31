-- ============================================================
-- 002_rls.sql — 家庭隔离
--
-- ⚠️ 顺序很重要：这一步会让「没有登录」的旧前端读不到任何数据。
--    请在前端接好 Supabase Auth（magic link）之后再来跑。
--    现在先跑 001 是安全的。
--
-- 策略：客户端只能读本家庭；所有写操作走 RPC（SECURITY DEFINER），
--       因此 items / *_sessions / inventory_events 上不建 insert/update 策略。
-- ============================================================

-- 当前用户属于哪些家庭
create or replace function my_households()
returns setof uuid
language sql security definer stable
set search_path = public
as $$
  select household_id from household_members where user_id = auth.uid()
$$;

revoke all on function my_households() from public;
grant execute on function my_households() to authenticated;

-- ---------- households ----------
alter table households enable row level security;

drop policy if exists households_read on households;
create policy households_read on households
  for select to authenticated
  using (id in (select my_households()));

-- ---------- household_members ----------
alter table household_members enable row level security;

drop policy if exists members_read on household_members;
create policy members_read on household_members
  for select to authenticated
  using (household_id in (select my_households()));

-- 自己可以退出家庭
drop policy if exists members_leave on household_members;
create policy members_leave on household_members
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------- items ----------
alter table items enable row level security;

drop policy if exists items_read on items;
create policy items_read on items
  for select to authenticated
  using (household_id in (select my_households()) and deleted_at is null);

-- 写：不建策略。唯一写入口是 003 里的 RPC。

-- ---------- 会话 / 流水 / 候选 ----------
do $$
declare t text;
begin
  foreach t in array array['inventory_events','meal_sessions','capture_sessions',
                           'capture_images','capture_candidates','receipts','receipt_lines']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

drop policy if exists events_read on inventory_events;
create policy events_read on inventory_events
  for select to authenticated using (household_id in (select my_households()));

drop policy if exists meal_read on meal_sessions;
create policy meal_read on meal_sessions
  for select to authenticated using (household_id in (select my_households()));

drop policy if exists capture_read on capture_sessions;
create policy capture_read on capture_sessions
  for select to authenticated using (household_id in (select my_households()));

-- 子表通过父表判断（注意：策略里不能直接子查询被 RLS 保护的表而不加 security definer，
-- 这里用 security definer 的辅助函数绕开递归）
create or replace function my_session_ids()
returns setof uuid language sql security definer stable set search_path = public
as $$ select id from capture_sessions where household_id in (select my_households()) $$;
revoke all on function my_session_ids() from public;
grant execute on function my_session_ids() to authenticated;

create or replace function my_receipt_ids()
returns setof uuid language sql security definer stable set search_path = public
as $$ select id from receipts where session_id in (select my_session_ids()) $$;
revoke all on function my_receipt_ids() from public;
grant execute on function my_receipt_ids() to authenticated;

drop policy if exists cimg_read on capture_images;
create policy cimg_read on capture_images
  for select to authenticated using (session_id in (select my_session_ids()));

drop policy if exists ccand_read on capture_candidates;
create policy ccand_read on capture_candidates
  for select to authenticated using (session_id in (select my_session_ids()));

drop policy if exists rec_read on receipts;
create policy rec_read on receipts
  for select to authenticated using (session_id in (select my_session_ids()));

drop policy if exists rline_read on receipt_lines;
create policy rline_read on receipt_lines
  for select to authenticated using (receipt_id in (select my_receipt_ids()));

-- ---------- 设备 ----------
alter table devices enable row level security;
alter table device_commands enable row level security;

drop policy if exists devices_read on devices;
create policy devices_read on devices
  for select to authenticated using (household_id in (select my_households()));

drop policy if exists dcmd_read on device_commands;
create policy dcmd_read on device_commands
  for select to authenticated
  using (device_id in (select id from devices where household_id in (select my_households())));

-- 设备本身不直连数据库（走 Edge Function + service_role），所以这里不给 anon 任何权限。

-- ---------- 旧表 ----------
-- logs / pending 含演示数据、且不属于任何家庭：先保持关闭 RLS 的现状不动，
-- 等前端不再依赖它们时再一起收口。
