-- ONLY for a new, empty Supabase test project. No real household/inventory data.
-- Included by build-pebble-test-sql.cjs inside a single transaction.
do $$
begin
  if to_regclass('public.items') is not null
    or to_regclass('public.households') is not null
    or to_regclass('public.devices') is not null then
    raise exception 'Refusing bootstrap: target must be an empty test project';
  end if;
end $$;
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Cooking Pebble test'
);
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in ('owner','member')),
  primary key(household_id,user_id)
);
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text,
  secret_hash text not null,
  last_seen timestamptz,
  firmware text,
  created_at timestamptz not null default now()
);
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.devices enable row level security;
revoke all on public.households,public.household_members,public.devices from anon,authenticated;
grant all on public.households,public.household_members,public.devices to service_role;
-- No user data is inserted here. Test users/families are added after initialization.
