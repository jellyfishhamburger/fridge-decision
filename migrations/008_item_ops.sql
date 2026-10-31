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
