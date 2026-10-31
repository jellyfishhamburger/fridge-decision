-- ============================================================
-- 010_realtime.sql — 打开 Realtime 广播（多端秒级同步）
--
-- 做完这一步，另一台手机改了库存，这台手机 1 秒内自己更新，
-- 不用等 20 秒轮询。连不上也不影响使用（轮询还在兜底）。
-- ============================================================

-- 1. 确保有 supabase_realtime 这个 publication（Supabase 默认就有）
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- 2. 把要广播的表加进去（重复加会报 duplicate_object，这里直接吞掉）
do $$
declare t text; n int := 0;
begin
  foreach t in array array['items','meal_sessions','capture_sessions','inventory_events'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
      n := n + 1;
    exception when duplicate_object then null;
    end;
  end loop;
  raise notice '新加入 % 张表', n;
end $$;

-- 3. 自查：这几张表应该都在列表里
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and schemaname = 'public'
 order by 1;
