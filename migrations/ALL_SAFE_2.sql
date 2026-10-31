-- ============================================================
-- ALL_SAFE_2.sql —— 第二轮（可重复执行，全部 create or replace）
--
-- 内容：003（事务函数 v2，重复调用会返回 duplicate 标记）
--       + 007（开做饭会话）
--       + 008（手动加/改/删库存）
--       + 收回 anon 权限
--
-- 执行：SQL Editor → 新建查询 → 清空 → 粘贴 → Run
-- 预期：Success. No rows returned
-- ============================================================

-- ============================================================
-- 003 · 事务函数（v2）
-- ============================================================

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


-- ============================================================
-- 007 · 开做饭会话
-- ============================================================

-- ============================================================
-- 007_meal_session.sql — 开一次「做饭会话」（预留/扣减的那条主键）
--
-- 为什么需要：meal_sessions 这张表已经开了 RLS，客户端不能直接 INSERT
-- （实测报 42501 new row violates row-level security policy）。
-- 所以给它一个 SECURITY DEFINER 的函数，按当前登录用户所在家庭建会话。
-- ============================================================

create or replace function start_meal_session(p_recipe text, p_plan jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_hh uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select household_id into v_hh
    from household_members where user_id = auth.uid()
   order by (role = 'owner') desc
   limit 1;

  if v_hh is null then raise exception 'no household'; end if;

  insert into meal_sessions (household_id, user_id, recipe_id, status, plan)
  values (v_hh, auth.uid(), p_recipe, 'selected', coalesce(p_plan, '[]'::jsonb))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function start_meal_session(text, jsonb) from anon;
revoke all on function start_meal_session(text, jsonb) from public;
grant execute on function start_meal_session(text, jsonb) to authenticated;


-- ============================================================
-- 008 · 手动增删改
-- ============================================================

-- ============================================================
-- 008_item_ops.sql — 手动增删改库存（走事务，不直接写表）
--
-- 决策表里「用户手动修改库存 → 是」，但它同样必须只写一次、并留下流水。
-- RLS 开了以后客户端不能直接 PATCH items，所以收成三个函数。
-- ============================================================

-- 加一样（手动 / 迁移本机库存都走这里）
create or replace function add_item(
  p_cat       text,
  p_name      text,
  p_tag       text,
  p_qty       numeric,
  p_unit      text,
  p_life      int,
  p_days_left int default null,
  p_date_source text default 'manual',
  p_key       text default null
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

  v_id := 'i' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

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

-- 改数量（绝对值，不是增量 —— 避免并发下越改越多）
create or replace function set_item_qty(p_item text, p_qty numeric)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_hh uuid; v_old numeric; v_delta numeric;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(p_qty, -1) < 0 then raise exception 'qty must be >= 0'; end if;

  select household_id, qty into v_hh, v_old
    from items where id = p_item and deleted_at is null for update;
  if v_hh is null then raise exception 'item not found'; end if;
  perform assert_member(v_hh);

  v_delta := coalesce(p_qty, 0) - coalesce(v_old, 0);
  if v_delta = 0 then return coalesce(p_qty, 0); end if;

  update items set qty = p_qty, version = version + 1, updated_at = now() where id = p_item;

  insert into inventory_events (household_id, item_id, delta, reason, idempotency_key, created_by)
  values (v_hh, p_item, v_delta, 'manual',
          'setqty:' || p_item || ':' || extract(epoch from clock_timestamp())::text, auth.uid());

  return p_qty;
end $$;

-- 删掉一样（软删，保留流水）
create or replace function remove_item(p_item text, p_reason text default 'discard')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hh uuid; v_qty numeric; v_cat text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select household_id, qty, cat into v_hh, v_qty, v_cat
    from items where id = p_item and deleted_at is null for update;
  if v_hh is null then return jsonb_build_object('ok', true, 'already', true); end if;
  perform assert_member(v_hh);

  update items set deleted_at = now(), version = version + 1,
                   qty = 0, reserved_qty = 0, updated_at = now()
   where id = p_item;

  insert into inventory_events (household_id, item_id, delta, reason, idempotency_key, created_by)
  values (v_hh, p_item, -coalesce(v_qty, 0),
          case when p_reason in ('discard','expire','manual') then p_reason else 'discard' end,
          'del:' || p_item || ':' || extract(epoch from clock_timestamp())::text, auth.uid());

  return jsonb_build_object('ok', true, 'qty', coalesce(v_qty, 0), 'cat', v_cat);
end $$;

revoke all on function add_item(text,text,text,numeric,text,int,int,text,text) from anon, public;
revoke all on function set_item_qty(text,numeric) from anon, public;
revoke all on function remove_item(text,text) from anon, public;
grant execute on function add_item(text,text,text,numeric,text,int,int,text,text) to authenticated;
grant execute on function set_item_qty(text,numeric) to authenticated;
grant execute on function remove_item(text,text) to authenticated;

-- ============================================================
-- 收回 anon 执行权（Supabase 默认把新函数授给 anon）
-- ============================================================
do $$
declare
  sigs text[] := array[
    'confirm_purchase(uuid,jsonb,text)','reserve_meal(uuid)','complete_meal(uuid,jsonb,text)',
    'cancel_meal(uuid)','undo_event(uuid)','claim_once(text,text)','idem_payload(text)',
    'assert_member(uuid)','start_capture_session(uuid)','save_capture_candidates(uuid,jsonb)',
    'start_meal_session(text,jsonb)','add_item(text,text,text,numeric,text,int,int,text,text)',
    'set_item_qty(text,numeric)','remove_item(text,text)',
    'create_household(text)','join_household(text)','my_household()'
  ];
  s text;
begin
  foreach s in array sigs loop
    if to_regprocedure(s) is not null then
      execute format('revoke all on function %s from anon', s);
      execute format('revoke all on function %s from public', s);
      execute format('grant execute on function %s to authenticated', s);
    end if;
  end loop;
end $$;
