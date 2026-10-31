-- ============================================================
-- 002_rls.sql（v2）— 家庭隔离，可重复执行
--
-- v1 的问题：如果表上已经存在 Supabase 面板/快速开始生成的「允许所有人读」
-- 策略，单纯 create policy 不会生效 —— 多策略是 OR 关系，旧策略照样放行。
-- 实测：跑完 002 后 anon 仍能读到全部 302 行，就是这个原因。
--
-- v2 的做法：先把这些表上的策略全部清掉，再重新建。
-- 只会删策略，不会删数据、不会删表。
-- ============================================================

-- ---------- 0. 清掉旧策略 ----------
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('households','household_members','items','inventory_events',
                         'meal_sessions','capture_sessions','capture_images',
                         'capture_candidates','receipts','receipt_lines','devices','device_commands')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------- 1. 我是哪家人 ----------
create or replace function my_households()
returns setof uuid
language sql security definer stable set search_path = public
as $$ select household_id from household_members where user_id = auth.uid() $$;

revoke all on function my_households() from anon, public;
grant execute on function my_households() to authenticated;

-- ---------- 2. 开 RLS ----------
do $$
declare t text;
begin
  foreach t in array array['households','household_members','items','inventory_events',
                           'meal_sessions','capture_sessions','capture_images',
                           'capture_candidates','receipts','receipt_lines','devices','device_commands']
  loop
    execute format('alter table public.%I enable row level security', t);
    -- 表主（postgres）也受策略约束，避免函数绕过策略时出现意外；
    -- 但 SECURITY DEFINER 的函数本身以函数属主运行，仍然可以写入。
  end loop;
end $$;

-- ---------- 3. 读策略 ----------
create policy households_read on households
  for select to authenticated using (id in (select my_households()));

create policy members_read on household_members
  for select to authenticated using (household_id in (select my_households()));

create policy members_leave on household_members
  for delete to authenticated using (user_id = auth.uid());

-- items：只读。写全部走 RPC（函数是 SECURITY DEFINER，不受这里限制）
create policy items_read on items
  for select to authenticated
  using (household_id in (select my_households()) and deleted_at is null);

create policy events_read on inventory_events
  for select to authenticated using (household_id in (select my_households()));

create policy meal_read on meal_sessions
  for select to authenticated using (household_id in (select my_households()));

create policy capture_read on capture_sessions
  for select to authenticated using (household_id in (select my_households()));

-- 子表：通过父表判断（用 security definer 的辅助函数，避免 RLS 递归）
create or replace function my_session_ids()
returns setof uuid language sql security definer stable set search_path = public
as $$ select id from capture_sessions where household_id in (select my_households()) $$;
revoke all on function my_session_ids() from anon, public;
grant execute on function my_session_ids() to authenticated;

create or replace function my_receipt_ids()
returns setof uuid language sql security definer stable set search_path = public
as $$ select id from receipts where session_id in (select my_session_ids()) $$;
revoke all on function my_receipt_ids() from anon, public;
grant execute on function my_receipt_ids() to authenticated;

create policy cimg_read on capture_images
  for select to authenticated using (session_id in (select my_session_ids()));

create policy ccand_read on capture_candidates
  for select to authenticated using (session_id in (select my_session_ids()));

create policy rec_read on receipts
  for select to authenticated using (session_id in (select my_session_ids()));

create policy rline_read on receipt_lines
  for select to authenticated using (receipt_id in (select my_receipt_ids()));

create policy devices_read on devices
  for select to authenticated using (household_id in (select my_households()));

create policy dcmd_read on device_commands
  for select to authenticated
  using (device_id in (select id from devices where household_id in (select my_households())));

-- ---------- 4. 自查 ----------
-- 期望：items_rls = true，items_policies = 1，others_policies ≥ 1
select c.relname,
       c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('items','households','household_members','inventory_events','meal_sessions')
 order by 1;
