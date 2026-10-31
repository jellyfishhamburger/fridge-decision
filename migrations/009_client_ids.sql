-- ============================================================
-- 009_client_ids.sql — 让客户端自己决定条目 id，并让扣减返回事件 id
--
-- 两个小改动，都是为了前端能「先本地、后云端」而不产生重复行：
--   1. add_item 收 p_id：客户端生成的 id 直接落库，pull 回来时能对上，不会多出一条
--   2. complete_meal 返回 event_ids：撤销按钮拿得到事件 id（events 表在 002 之后才可读）
-- ============================================================

create or replace function add_item(
  p_cat       text,
  p_name      text,
  p_tag       text,
  p_qty       numeric,
  p_unit      text,
  p_life      int,
  p_days_left int default null,
  p_date_source text default 'manual',
  p_key       text default null,
  p_id        text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_hh uuid; v_code text; v_id text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'qty must be > 0'; end if;

  select m.household_id, coalesce(h.code, '') into v_hh, v_code
    from household_members m join households h on h.id = m.household_id
   where m.user_id = auth.uid()
   order by (m.role = 'owner') desc
   limit 1;

  if v_hh is null then raise exception 'no household'; end if;

  v_id := coalesce(nullif(p_id, ''), 'i' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  -- 同一个 id 重复推（离线重试）时不要插两条
  if exists (select 1 from items where id = v_id) then
    return v_id;
  end if;

  insert into items (id, household, household_id, cat, name, tag, qty, unit, life,
                     days_left, added_at, created_by, date_source, estimated, version)
  values (v_id, v_code, v_hh, p_cat, p_name, p_tag, p_qty, p_unit,
          coalesce(p_life, 3), coalesce(p_days_left, p_life, 3), current_date,
          auth.uid(), coalesce(p_date_source, 'manual'), true, 1);

  insert into inventory_events (household_id, item_id, delta, reason, idempotency_key, created_by)
  values (v_hh, v_id, p_qty, 'manual',
          coalesce(p_key, 'manual:' || v_id), auth.uid());

  return v_id;
end $$;

create or replace function complete_meal(p_session uuid, p_actual jsonb, p_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hh uuid; v_status text; v_plan jsonb; r jsonb; v_use numeric; v_plan_qty numeric;
  v_total numeric := 0; v_done int := 0; v_ev uuid; v_ids uuid[] := '{}';
begin
  if not claim_once(p_key, 'complete_meal') then
    return coalesce(idem_payload(p_key), '{}'::jsonb) || jsonb_build_object('duplicate', true);
  end if;

  select household_id, status, plan into v_hh, v_status, v_plan
    from meal_sessions where id = p_session for update;
  if v_hh is null then raise exception 'meal session not found'; end if;
  perform assert_member(v_hh);
  if v_status <> 'reserved' then
    raise exception 'meal session is %, cannot complete', v_status;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_actual, v_plan, '[]'::jsonb)) loop
    v_use := coalesce((r->>'qty')::numeric, 1);

    select coalesce((x->>'qty')::numeric, 1) into v_plan_qty
      from jsonb_array_elements(coalesce(v_plan,'[]'::jsonb)) x
     where x->>'item_id' = r->>'item_id' limit 1;
    v_plan_qty := coalesce(v_plan_qty, 0);

    update items
       set qty = qty - v_use,
           reserved_qty = greatest(0, reserved_qty - v_plan_qty),
           version = version + 1,
           updated_at = now()
     where id = r->>'item_id' and household_id = v_hh and deleted_at is null
       and qty >= v_use;
    if not found then
      raise exception 'not enough stock to deduct item %', r->>'item_id';
    end if;

    insert into inventory_events (household_id, item_id, delta, reason,
                                  meal_session_id, idempotency_key, created_by)
    values (v_hh, r->>'item_id', -v_use, 'cook_deduct',
            p_session, p_key || ':' || (r->>'item_id'), auth.uid())
    returning id into v_ev;

    v_ids := v_ids || v_ev;
    v_total := v_total + v_use;
    v_done := v_done + 1;
  end loop;

  update meal_sessions set status = 'completed', completed_at = now() where id = p_session;

  update rpc_calls set payload = jsonb_build_object('ok', true, 'items', v_done, 'used', v_total,
                                                    'event_ids', to_jsonb(v_ids))
   where key = p_key;

  return jsonb_build_object('ok', true, 'items', v_done, 'used', v_total, 'event_ids', to_jsonb(v_ids));
end $$;

revoke all on function add_item(text,text,text,numeric,text,int,int,text,text,text) from anon, public;
revoke all on function complete_meal(uuid,jsonb,text) from anon, public;
grant execute on function add_item(text,text,text,numeric,text,int,int,text,text,text) to authenticated;
grant execute on function complete_meal(uuid,jsonb,text) to authenticated;
