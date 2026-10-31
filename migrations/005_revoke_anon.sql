-- ============================================================
-- 005_revoke_anon.sql — 收回匿名角色对事务函数的执行权
--
-- 为什么需要：Supabase 默认会把 public 下新函数的 EXECUTE 授给 anon。
-- 我实测过：用网页里那把公开的 publishable key 能直接调到
-- confirm_purchase（返回 "capture session not found"，说明函数真的跑进去了）。
-- 现在因为 assert_member 用 auth.uid() 兜住了，匿名调用写不进数据，
-- 但这属于「只剩一道锁」——不该让匿名用户碰到函数本身。
--
-- 跑法：SQL Editor → 新建查询 → 粘贴 → Run。幂等，跑几次都行。
-- ============================================================

revoke all on function confirm_purchase(uuid, jsonb, text) from anon;
revoke all on function reserve_meal(uuid)                   from anon;
revoke all on function complete_meal(uuid, jsonb, text)     from anon;
revoke all on function cancel_meal(uuid)                    from anon;
revoke all on function undo_event(uuid)                     from anon;
revoke all on function claim_once(text, text)               from anon;
revoke all on function idem_payload(text)                   from anon;
revoke all on function assert_member(uuid)                  from anon;

revoke all on function create_household(text)               from anon;
revoke all on function join_household(text)                 from anon;
revoke all on function my_household()                       from anon;
revoke all on function my_households()                      from anon;

-- 登录用户仍然可以调用
grant execute on function confirm_purchase(uuid, jsonb, text) to authenticated;
grant execute on function reserve_meal(uuid)                   to authenticated;
grant execute on function complete_meal(uuid, jsonb, text)     to authenticated;
grant execute on function cancel_meal(uuid)                    to authenticated;
grant execute on function undo_event(uuid)                     to authenticated;
grant execute on function create_household(text)               to authenticated;
grant execute on function join_household(text)                 to authenticated;
grant execute on function my_household()                       to authenticated;

-- 验证：下面这条应该返回 t（anon 没有 EXECUTE）
select not has_function_privilege('anon', 'confirm_purchase(uuid,jsonb,text)', 'execute') as anon_blocked;
