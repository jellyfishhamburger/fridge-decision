-- ============================================================
-- 012_fix_add_item.sql — 修掉 add_item 的两个重载（300 Multiple Choices）
--
-- 原因：008 建的是 9 个参数（p_cat…p_key），009 又建了 10 个参数（多 p_id）。
-- 带默认值的重载共存时，PostgREST 用具名参数调用会分不清该走哪个，
-- 直接回 300 —— 前端「加一样」「把本机库存搬进来」全都是这个错。
-- 做法：删掉旧的 9 参数版本，只留 10 参数那个（p_id 有默认值，老调用照样能用）。
-- ============================================================

-- 1. 先看看现在有几个
select oid::regprocedure as signature, pronargs
  from pg_proc
 where proname = 'add_item'
 order by pronargs;

-- 2. 删掉旧的（9 个参数、没有 p_id）
drop function if exists public.add_item(text, text, text, numeric, text, int, int, text, text);

-- 3. 确认只剩一个
select oid::regprocedure as signature, pronargs
  from pg_proc
 where proname = 'add_item';

-- 4. 顺手收回 anon（重建函数后 Supabase 会再授一次）
do $$
declare s text := 'add_item(text,text,text,numeric,text,int,int,text,text,text)';
begin
  if to_regprocedure(s) is not null then
    execute format('revoke all on function %s from anon', s);
    execute format('revoke all on function %s from public', s);
    execute format('grant execute on function %s to authenticated', s);
  end if;
end $$;
