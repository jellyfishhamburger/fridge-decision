-- ============================================================
-- 006_capture_session.sql — 让客户端开一次采购整理任务
--
-- 客户端不直接 INSERT 表（RLS 开了以后会被拦）。
-- 只给一个函数：以当前登录用户所在家庭开一条 capture_sessions(draft)，
-- 返回它的 id；随后的确认走 confirm_purchase。
-- ============================================================

create or replace function start_capture_session(p_device uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_hh uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select household_id into v_hh
    from household_members
   where user_id = auth.uid()
   order by (role = 'owner') desc
   limit 1;

  if v_hh is null then raise exception 'no household'; end if;

  insert into capture_sessions (household_id, user_id, device_id, status)
  values (v_hh, auth.uid(), p_device, 'draft')
  returning id into v_id;

  return v_id;
end $$;

-- 收尾：把这次拍到的候选也留档（可选，不写库存）
create or replace function save_capture_candidates(p_session uuid, p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare v_hh uuid; n int := 0; r jsonb;
begin
  select household_id into v_hh from capture_sessions where id = p_session;
  if v_hh is null then raise exception 'capture session not found'; end if;
  perform assert_member(v_hh);

  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    insert into capture_candidates
      (session_id, food_id, raw_name, category, confidence, needs_review, review_reason, decision,
       qty_suggested, unit_suggested)
    values (p_session,
            nullif(r->>'cat',''), r->>'label', r->>'category',
            coalesce((r->>'conf')::numeric, 0),
            coalesce((r->>'needs_review')::boolean, true),
            nullif(r->>'reason',''),
            coalesce(nullif(r->>'action',''), 'pending'),
            coalesce((r->>'qty')::numeric, 1),
            nullif(r->>'unit',''));
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function start_capture_session(uuid) from anon;
revoke all on function save_capture_candidates(uuid, jsonb) from anon;
grant execute on function start_capture_session(uuid) to authenticated;
grant execute on function save_capture_candidates(uuid, jsonb) to authenticated;
