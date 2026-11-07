-- Draft: not applied. Device API alone writes; no inventory side effects.
begin;
create table public.pebble_sessions (
  id uuid primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  unique(device_id)
);
alter table public.pebble_sessions enable row level security;
revoke all on public.pebble_sessions from anon, authenticated;
grant select, insert, update, delete on public.pebble_sessions to service_role;
commit;
