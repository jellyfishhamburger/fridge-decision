-- ============================================================
-- 011_cleanup_demo.sql — 清掉早期演示数据（会删除，跑之前看说明）
--
-- 删什么：household_id IS NULL 的 items —— 也就是那 291 行
--         「每台设备点载入示例」留下的孤儿数据。它们不属于任何家庭，
--         开了 RLS 之后任何人都看不见，只是占着表。
-- 不删什么：属于某个家庭的行（有 household_id）、你自己家的东西、表结构、函数。
--
-- 建议顺序：先单独跑第 1 段看数字，确认是那批演示数据；再跑第 2 段删。
-- ============================================================

-- ---------- 1. 先看看 ----------
select count(*) as orphan_items,
       min(added_at) as earliest,
       max(added_at) as latest,
       count(distinct household) as old_household_codes
  from items
 where household_id is null;

-- ---------- 2. 再删（确认上面数字是你预期的，再执行这一段） ----------
-- delete from items where household_id is null;

-- 早期的 households 记录（没有成员、也不属于任何人）也可以清：
-- delete from households h
--  where not exists (select 1 from household_members m where m.household_id = h.id);

-- ---------- 3. 删完再确认 ----------
-- select count(*) as remaining from items;
