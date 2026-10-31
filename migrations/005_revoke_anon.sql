-- ============================================================
-- 005_revoke_anon.sql（v2）— 收回匿名角色对「我们这些函数」的执行权
--
-- v1 直接在语句里写 my_households()，但那函数属于 002（还没跑），于是报
-- 42883 function does not exist。v2 改成动态：先查函数有没有，再决定要不要收回。
-- 幂等，跑几次都行，也不依赖 006 / 002 谁先谁后。
-- ============================================================

do $$
declare
  sigs text[] := array[
    'confirm_purchase(uuid,jsonb,text)',
    'reserve_meal(uuid)',
    'complete_meal(uuid,jsonb,text)',
    'cancel_meal(uuid)',
    'undo_event(uuid)',
    'claim_once(text,text)',
    'idem_payload(text)',
    'assert_member(uuid)',
    'start_capture_session(uuid)',
    'save_capture_candidates(uuid,jsonb)',
    'create_household(text)',
    'join_household(text)',
    'my_household()',
    'my_households()',
    'my_session_ids()',
    'my_receipt_ids()'
  ];
  s text;
  n int := 0;
begin
  foreach s in array sigs loop
    if to_regprocedure(s) is not null then
      execute format('revoke all on function %s from anon', s);
      execute format('revoke all on function %s from public', s);
      execute format('grant execute on function %s to authenticated', s);
      n := n + 1;
    end if;
  end loop;
  raise notice '处理了 % 个函数', n;
end $$;

-- 验证：下面这段应该返回 0 行（我们这批函数里，anon 一个都调不到）
select p.oid::regprocedure as anon_can_still_call
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('confirm_purchase','reserve_meal','complete_meal','cancel_meal','undo_event',
                     'claim_once','idem_payload','assert_member','start_capture_session',
                     'save_capture_candidates','create_household','join_household','my_household')
   and has_function_privilege('anon', p.oid, 'execute');
