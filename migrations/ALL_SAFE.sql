-- ============================================================
-- ALL_SAFE.sql —— 一次粘完就能跑（001 + 004 + 003）
--
-- 内容：建表补列 + 建家/加入函数 + 5 个事务函数
-- 不含：002_rls.sql（开 RLS 会挡住现在没登录的旧前端，等接好登录再单独跑）
--
-- 执行：Supabase → SQL Editor → 新建查询 → 全选本文件 → 粘贴 → Run
-- 预期：最后一行显示 "Success. No rows returned"
-- 若中途报错：把红色报错整段复制发我，不要重跑整份。
-- ============================================================

-- ============================================================
-- 001 · 建表补列
-- ============================================================

-- ============================================================
-- 001_schema.sql — 采购整理 / 预留扣减 所需的增量结构
--
-- 原则：只加不删。现有 items(266 行)、logs、pending 一行都不动。
-- 48 个 household 码已确认全部是演示数据 → 不回填 household_id，
-- 它们的 household_id 保持 NULL，开 RLS 后自然对客户端不可见。
--
-- 执行方式：Supabase Dashboard → SQL Editor → 整段粘贴 → Run
-- 执行前建议 Database → Backups 手动快照一次（虽然本脚本不删除任何东西）
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 家庭 ----------
-- households 现在是 0 行、只有 code 一列；补 id 作为真正主键
alter table households add column if not exists id uuid default gen_random_uuid();
alter table households add column if not exists name text;
alter table households add column if not exists created_by uuid;
alter table households add column if not exists created_at timestamptz default now();
alter table households add column if not exists join_code text;

-- 只有表里为空时才能加主键；已有数据时跳过，改用唯一索引
do $$
begin
  if not exists (select 1 from households limit 1) then
    begin
      alter table households add primary key (id);
    exception when others then null;
    end;
    begin
      alter table households alter column code drop not null;
    exception when others then null;
    end;
  end if;
end $$;

create unique index if not exists households_join_code_ux on households (join_code);
create unique index if not exists households_code_ux on households (code) where code is not null;

-- ---------- 成员 ----------
create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists household_members_user_ix on household_members (user_id);

-- ---------- 库存：补列 ----------
alter table items add column if not exists household_id uuid references households(id) on delete cascade;
alter table items add column if not exists created_by   uuid;
alter table items add column if not exists reserved_qty numeric not null default 0;
alter table items add column if not exists date_source  text default 'manual';   -- packaging/receipt/rule/manual
alter table items add column if not exists estimated    boolean default true;
alter table items add column if not exists version      int not null default 1;
alter table items add column if not exists deleted_at   timestamptz;

create index if not exists items_hh_ix on items (household_id) where deleted_at is null;

-- 负库存与非负预留：数据库层面兜底
do $$
begin
  begin
    alter table items add constraint items_qty_pos check (qty >= 0);
  exception when others then null;
  end;
  begin
    alter table items add constraint items_res_nonneg check (reserved_qty >= 0);
  exception when others then null;
  end;
  begin
    alter table items add constraint items_res_le_qty check (reserved_qty <= qty);
  exception when others then null;
  end;
end $$;

-- ---------- 库存流水 ----------
create table if not exists inventory_events (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households(id) on delete cascade,
  item_id          text,
  delta            numeric not null,
  reason           text not null check (reason in
                     ('purchase_confirm','cook_deduct','manual','discard','expire','undo')),
  meal_session_id  uuid,
  idempotency_key  text not null unique,
  created_by       uuid,
  created_at       timestamptz not null default now()
);
create index if not exists inv_events_hh_ix on inventory_events (household_id, created_at desc);

-- ---------- 烹饪会话（预留 / 扣减 / 释放） ----------
create table if not exists meal_sessions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  user_id         uuid,
  recipe_id       text,
  status          text not null default 'selected'
                    check (status in ('selected','reserved','completed','cancelled','expired')),
  plan            jsonb not null default '[]'::jsonb,   -- [{item_id, cat, qty}]
  started_at      timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz
);
create index if not exists meal_sessions_hh_ix on meal_sessions (household_id, status);

-- ---------- 采购整理 ----------
create table if not exists capture_sessions (
  id          uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id     uuid,
  device_id   uuid,
  status      text not null default 'open'
                check (status in ('open','capturing','recognizing','draft','confirmed','cancelled')),
  started_at  timestamptz not null default now(),
  closed_at   timestamptz,
  receipt_id  uuid
);
create index if not exists capture_sessions_hh_ix on capture_sessions (household_id, started_at desc);

create table if not exists capture_images (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references capture_sessions(id) on delete cascade,
  storage_path text,
  taken_at     timestamptz not null default now(),
  width        int,
  height       int,
  blur_score   numeric,
  sha256       text
);
create unique index if not exists capture_images_sha_ux on capture_images (session_id, sha256);

create table if not exists capture_candidates (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references capture_sessions(id) on delete cascade,
  image_id      uuid references capture_images(id) on delete set null,
  food_id       text,
  raw_name      text,
  category      text,
  confidence    numeric,
  needs_review  boolean not null default true,
  review_reason text,
  decision      text not null default 'pending'
                  check (decision in ('pending','add','adjust','keep','ignore')),
  qty_suggested numeric default 1,
  unit_suggested text,
  created_at    timestamptz not null default now()
);
create index if not exists capture_candidates_s_ix on capture_candidates (session_id);

-- ---------- 小票 ----------
create table if not exists receipts (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references capture_sessions(id) on delete cascade,
  storage_path text,
  ocr         jsonb,
  status      text not null default 'pending' check (status in ('pending','done','failed')),
  created_at  timestamptz not null default now()
);

create table if not exists receipt_lines (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references receipts(id) on delete cascade,
  raw_name     text,
  qty          numeric,
  unit         text,
  price        numeric,
  matched_candidate_id uuid references capture_candidates(id) on delete set null,
  match_confidence numeric
);

-- ---------- 设备 ----------
create table if not exists devices (
  id          uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name        text,
  secret_hash text not null,
  last_seen   timestamptz,
  firmware    text,
  created_at  timestamptz not null default now()
);

create table if not exists device_commands (
  id         uuid primary key default gen_random_uuid(),
  device_id  uuid not null references devices(id) on delete cascade,
  type       text not null check (type in ('capture_start','capture_stop')),
  payload    jsonb,
  status     text not null default 'pending' check (status in ('pending','acked','done','failed')),
  created_at timestamptz not null default now(),
  acked_at   timestamptz
);
create index if not exists device_commands_ix on device_commands (device_id, status);

-- ---------- 幂等登记（函数级） ----------
create table if not exists rpc_calls (
  key        text primary key,
  fn         text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);


-- ============================================================
-- 004 · 建家 / 加入
-- ============================================================

-- ============================================================
-- 004_household.sql — 建家庭 / 用邀请码加入（配合 magic link 登录）
--
-- 前端登录成功、拿到 auth.uid() 之后，只需要调这两个函数之一：
--   还没有家 → create_household('我们仨')
--   已有邀请码 → join_household('ABC123')
-- 两个函数都会顺便把当前用户写成 household_members 的一员，
-- 这样 002 的 RLS 才认得出「你是这家人」。
-- ============================================================

-- 随机 6 位邀请码，避开容易看错的字符
create or replace function gen_join_code()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end $$;

-- 建一个新家庭，创建者是 owner
create or replace function create_household(p_name text default '我的家')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; v_try int := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  -- 一个人先只允许有一个家（后面要做多家庭再放开）
  if exists (select 1 from household_members where user_id = auth.uid() and role = 'owner') then
    raise exception 'you already own a household';
  end if;

  loop
    v_try := v_try + 1;
    v_code := gen_join_code();
    exit when not exists (select 1 from households where join_code = v_code);
    if v_try > 20 then raise exception 'could not allocate a code'; end if;
  end loop;

  insert into households (name, created_by, code, join_code)
  values (p_name, auth.uid(), v_code, v_code)
  returning id into v_id;

  insert into household_members (household_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  return jsonb_build_object('household_id', v_id, 'join_code', v_code);
end $$;

-- 用邀请码加入
create or replace function join_household(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select id, name into v_id, v_name
    from households
   where join_code = upper(trim(p_code)) or code = upper(trim(p_code))
   limit 1;

  if v_id is null then raise exception 'code not found'; end if;

  insert into household_members (household_id, user_id, role)
  values (v_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  return jsonb_build_object('household_id', v_id, 'name', v_name);
end $$;

-- 我属于哪个家（前端登录后先问这个，决定显示「建家」还是「已在家」）
create or replace function my_household()
returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object('household_id', h.id, 'name', h.name,
                            'join_code', h.join_code, 'role', m.role)
    from household_members m join households h on h.id = m.household_id
   where m.user_id = auth.uid()
   order by (m.role = 'owner') desc
   limit 1
$$;

revoke all on function create_household(text) from public;
revoke all on function join_household(text) from public;
revoke all on function my_household() from public;
grant execute on function create_household(text) to authenticated;
grant execute on function join_household(text) to authenticated;
grant execute on function my_household() to authenticated;


-- ============================================================
-- 003 · 事务函数
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
    return coalesce(idem_payload(p_key), '{"duplicate":true}'::jsonb);
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
                         added_at, created_by, date_source, estimated, version)
      values (v_id, v_code, v_hh, r->>'cat', r->>'name', r->>'tag', v_qty, r->>'unit',
              coalesce((r->>'life')::int, 3), current_date, auth.uid(),
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
    return coalesce(idem_payload(p_key), '{"duplicate":true}'::jsonb);
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

