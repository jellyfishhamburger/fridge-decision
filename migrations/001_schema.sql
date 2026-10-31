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

-- households 建表时大概率已经用 code 当主键了 —— 表里已有 PRIMARY KEY 就不能再加 id 主键
-- （加会静默失败），但外键只要求「被引用列上有唯一约束」。所以给 id 补一个唯一索引：
-- 这不是主键，却足够让 items.household_id / household_members.household_id 的
-- 外键引用成立。之前报的 42830 就是这一步缺失导致的。
create unique index if not exists households_id_ux on households (id);

do $$
begin
  begin
    alter table households alter column id set not null;
  exception when others then null;
  end;
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
