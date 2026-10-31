-- ============================================================
-- 003_rpc.sql — 库存变化的唯一入口
--
-- 客户端不再直接写 items。四个函数里，只有 confirm_purchase 和
-- complete_meal 会改 qty；reserve/cancel 只动 reserved_qty。
--
-- 防重复扣减靠两件事，都不依赖前端：
--   1. rpc_calls.key 唯一 → 同一个 key 第二次调用直接返回上次结果
--   2. 状态迁移带 WHERE status='...' → 第二次进来影响 0 行，抛错回滚
-- ============================================================

-- 幂等登记：插入成功说明是第一次；失败说明这个 key 已经处理过
create or replace function claim_once(p_key text, p_fn text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if p_key is null or length(p_key) < 8 then
    raise exception 'missing idempotency_key';
  end if;
  insert into rpc_calls (key, fn) values (p_key, p_fn)
  on conflict (key) do nothing
  returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function idem_payload(p_key text)
returns jsonb language sql security definer set search_path = public as $$
  select payload from rpc_calls where key = p_key
$$;

-- 成员校验
create or replace function assert_member(p_hh uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_hh is null then raise exception 'household is null'; end if;
  if not exists (select 1 from household_members
                 where household_id = p_hh and user_id = auth.uid()) then
    raise exception 'not a member of this household';
  end if;
end $$;

-- ============================================================
-- 1) 确认采购：唯一会「增加」库存的函数
--    p_rows: [{action:'add'|'adjust'|'keep'|'ignore', cat, name, tag,
--              qty, unit, life, item_id?}]
-- ============================================================
create or replace function confirm_purchase(p_session uuid, p_rows jsonb, p_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hh uuid; v_status text; v_code text; v_prev jsonb;
  v_added int := 0; v_adj int := 0; v_skip int := 0;
  r jsonb; v_id text; v_qty numeric;
begin
  if not claim_once(p_key, 'confirm_purchase') then
    -- 重复调用：把上次结果原样返回，并显式标注 duplicate，免得看起来像又写了一次
    return coalesce(idem_payload(p_key), '{}'::jsonb) || jsonb_build_object('duplicate', true);
  end if;

  select cs.household_id, cs.status,
         coalesce((select h.code from households h where h.id = cs.household_id), '')
    into v_hh, v_status, v_code
    from capture_sessions cs where cs.id = p_session for update;
  if v_hh is null then raise exception 'capture session not found'; end if;
  perform assert_member(v_hh);
  if v_status not in ('draft','capturing','open') then
    raise exception 'session is %, cannot confirm', v_status;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_qty := coalesce((r->>'qty')::numeric, 1);
    if v_qty <= 0 then v_qty := 1; end if;

    if (r->>'action') = 'add' then
      v_id := coalesce(nullif(r->>'item_id',''),
                       'i' || substr(replace(gen_random_uuid()::text,'-',''), 1, 12));
      insert into items (id, household, household_id, cat, name, tag, qty, unit, life,
                         days_left, added_at, created_by, date_source, estimated, version)
      values (v_id, v_code, v_hh, r->>'cat', r->>'name', r->>'tag', v_qty, r->>'unit',
              coalesce((r->>'life')::int, 3), coalesce((r->>'life')::int, 3),
              current_date, auth.uid(),
              coalesce(r->>'date_source','manual'), coalesce((r->>'estimated')::boolean, true), 1);
      insert into inventory_events (household_id, item_id, delta, reason, idempotency_key, created_by)
      values (v_hh, v_id, v_qty, 'purchase_confirm', p_key || ':' || v_id, auth.uid());
      v_added := v_added + 1;

    elsif (r->>'action') = 'adjust' and nullif(r->>'item_id','') is not null then
      update items
         set qty = qty + v_qty, version = version + 1, updated_at = now()
       where id = r->>'item_id' and household_id = v_hh and deleted_at is null;
      if found then
        insert into inventory_events (household_id, item_id, delta, reason, idempotency_key, created_by)
        values (v_hh, r->>'item_id', v_qty, 'purchase_confirm',
                p_key || ':' || (r->>'item_id'), auth.uid());
        v_adj := v_adj + 1;
      else
        v_skip := v_skip + 1;
      end if;

    else
      v_skip := v_skip + 1;
    end if;
  end loop;

  update capture_sessions set status = 'confirmed', closed_at = now() where id = p_session;

  v_prev := jsonb_build_object('added', v_added, 'adjusted', v_adj, 'skipped', v_skip);
  update rpc_calls set payload = v_prev where key = p_key;
  return v_prev;
end $$;

-- ============================================================
-- 2) 开始烹饪：只预留，不动 qty
--    p_session 是 meal_sessions 里已经是 'selected' 的那条，
--    plan 已写入（[{item_id, qty}]）
-- ============================================================
create or replace function reserve_meal(p_session uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hh uuid; v_status text; v_plan jsonb; r jsonb; v_need numeric; v_short text[] := '{}';
begin
  select household_id, status, plan into v_hh, v_status, v_plan
    from meal_sessions where id = p_session for update;
  if v_hh is null then raise exception 'meal session not found'; end if;
  perform assert_member(v_hh);
  if v_status = 'reserved' then
    return jsonb_build_object('ok', true, 'already', true);     -- 幂等
  end if;
  if v_status <> 'selected' then
    raise exception 'meal session is %, cannot reserve', v_status;
  end if;

  for r in select * from jsonb_array_elements(coalesce(v_plan,'[]'::jsonb)) loop
    v_need := coalesce((r->>'qty')::numeric, 1);
    update items
       set reserved_qty = reserved_qty + v_need, version = version + 1, updated_at = now()
     where id = r->>'item_id'
       and household_id = v_hh
       and deleted_at is null
       and (qty - reserved_qty) >= v_need;
    if not found then
      v_short := v_short || coalesce(r->>'cat', r->>'item_id');
    end if;
  end loop;

  if array_length(v_short, 1) > 0 then
    raise exception 'not enough stock: %', array_to_string(v_short, ',');
  end if;

  update meal_sessions set status = 'reserved', started_at = now() where id = p_session;
  return jsonb_build_object('ok', true, 'reserved', jsonb_array_length(coalesce(v_plan,'[]'::jsonb)));
end $$;

-- ============================================================
-- 3) 完成烹饪：按实际用量扣减，release 掉预留
--    p_actual: [{item_id, qty}]  不传就用 plan
-- ============================================================
create or replace function complete_meal(p_session uuid, p_actual jsonb, p_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hh uuid; v_status text; v_plan jsonb; r jsonb; v_use numeric; v_plan_qty numeric;
  v_total numeric := 0; v_done int := 0;
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
       and qty >= v_use;                    -- 不允许负库存
    if not found then
      raise exception 'not enough stock to deduct item %', r->>'item_id';
    end if;

    insert into inventory_events (household_id, item_id, delta, reason,
                                  meal_session_id, idempotency_key, created_by)
    values (v_hh, r->>'item_id', -v_use, 'cook_deduct',
            p_session, p_key || ':' || (r->>'item_id'), auth.uid());

    v_total := v_total + v_use;
    v_done := v_done + 1;
  end loop;

  update meal_sessions set status = 'completed', completed_at = now() where id = p_session;

  update rpc_calls set payload = jsonb_build_object('ok', true, 'items', v_done, 'used', v_total)
   where key = p_key;
  return jsonb_build_object('ok', true, 'items', v_done, 'used', v_total);
end $$;

-- ============================================================
-- 4) 取消烹饪：只释放预留
-- ============================================================
create or replace function cancel_meal(p_session uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hh uuid; v_status text; v_plan jsonb; r jsonb; v_plan_qty numeric;
begin
  select household_id, status, plan into v_hh, v_status, v_plan
    from meal_sessions where id = p_session for update;
  if v_hh is null then raise exception 'meal session not found'; end if;
  perform assert_member(v_hh);
  if v_status in ('cancelled','expired') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_status = 'completed' then
    raise exception 'already completed, use undo instead';
  end if;

  if v_status = 'reserved' then
    for r in select * from jsonb_array_elements(coalesce(v_plan,'[]'::jsonb)) loop
      v_plan_qty := coalesce((r->>'qty')::numeric, 1);
      update items
         set reserved_qty = greatest(0, reserved_qty - v_plan_qty), updated_at = now()
       where id = r->>'item_id' and household_id = v_hh;
    end loop;
  end if;

  update meal_sessions set status = 'cancelled', cancelled_at = now() where id = p_session;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- 5) 撤销：写一条反向事件（不改历史）
-- ============================================================
create or replace function undo_event(p_event uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hh uuid; v_item text; v_delta numeric; v_reason text; v_at timestamptz; v_key text;
begin
  select household_id, item_id, delta, reason, created_at, idempotency_key
    into v_hh, v_item, v_delta, v_reason, v_at, v_key
    from inventory_events where id = p_event;
  if v_hh is null then raise exception 'event not found'; end if;
  perform assert_member(v_hh);
  if v_reason = 'undo' then raise exception 'cannot undo an undo'; end if;
  if v_at < now() - interval '24 hours' then raise exception 'too old to undo'; end if;

  if not claim_once(v_key || ':undo', 'undo_event') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update items
     set qty = greatest(0, qty + (-v_delta)), version = version + 1, updated_at = now()
   where id = v_item and household_id = v_hh;

  insert into inventory_events (household_id, item_id, delta, reason, idempotency_key, created_by)
  values (v_hh, v_item, -v_delta, 'undo', v_key || ':undo:' || extract(epoch from now())::text, auth.uid());

  update rpc_calls set payload = jsonb_build_object('ok', true) where key = v_key || ':undo';
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 权限：只有登录用户可以调用 ----------
revoke all on function confirm_purchase(uuid, jsonb, text) from public;
revoke all on function reserve_meal(uuid) from public;
revoke all on function complete_meal(uuid, jsonb, text) from public;
revoke all on function cancel_meal(uuid) from public;
revoke all on function undo_event(uuid) from public;

grant execute on function confirm_purchase(uuid, jsonb, text) to authenticated;
grant execute on function reserve_meal(uuid) to authenticated;
grant execute on function complete_meal(uuid, jsonb, text) to authenticated;
grant execute on function cancel_meal(uuid) to authenticated;
grant execute on function undo_event(uuid) to authenticated;
