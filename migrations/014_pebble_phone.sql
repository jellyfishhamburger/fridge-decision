-- Local draft. Run after 013 only with deployment approval.
begin;
create or replace function public.pebble_register(p_household uuid, p_name text, p_secret_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare device uuid;
begin
  if auth.uid() is null or not exists(select 1 from household_members where user_id=auth.uid() and household_id=p_household) then
    raise exception 'not authorized';
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid secret hash'; end if;
  if length(coalesce(p_name,'')) not between 1 and 80 then raise exception 'invalid name'; end if;
  insert into devices(household_id,name,secret_hash) values(p_household,p_name,p_secret_hash) returning id into device;
  return device;
end $$;

create or replace function public.pebble_start(p_device uuid, p_recipe text, p_steps jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare hh uuid; session uuid:=gen_random_uuid(); result jsonb; step jsonb; milliseconds bigint;
begin
  select d.household_id into hh from devices d join household_members m on m.household_id=d.household_id
    where d.id=p_device and m.user_id=auth.uid() limit 1;
  if hh is null then raise exception 'not authorized'; end if;
  if p_recipe is null or length(p_recipe) not between 1 and 200 or jsonb_typeof(p_steps) is distinct from 'array' then raise exception 'invalid recipe'; end if;
  if jsonb_array_length(p_steps) not between 1 and 100 then raise exception 'invalid steps'; end if;
  for step in select value from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(step->'text') is distinct from 'string' or length(step->>'text') not between 1 and 500
      or jsonb_typeof(step->'seconds') is distinct from 'number' then raise exception 'invalid step'; end if;
    if (step->>'seconds')::numeric not between 0 and 86400 or trunc((step->>'seconds')::numeric) <> (step->>'seconds')::numeric then raise exception 'invalid duration'; end if;
  end loop;
  milliseconds:=floor(extract(epoch from clock_timestamp())*1000);
  result:=jsonb_build_object('id',session,'recipe_id',p_recipe,'steps',p_steps,'step_index',0,'status','cooking',
    'remaining_ms',(p_steps->0->>'seconds')::bigint*1000,'timer_ends_at',null,'revision',0,'updated_at',milliseconds);
  insert into pebble_sessions(id,device_id,household_id,state) values(session,p_device,hh,result)
    on conflict(device_id) do update set id=excluded.id,household_id=excluded.household_id,state=excluded.state,revision=0,updated_at=now();
  return result;
end $$;

create or replace function public.pebble_read(p_device uuid)
returns jsonb language plpgsql security definer stable set search_path=public as $$
declare hh uuid; result jsonb;
begin
  select d.household_id into hh from devices d join household_members m on m.household_id=d.household_id
    where d.id=p_device and m.user_id=auth.uid() limit 1;
  if hh is null then raise exception 'not authorized'; end if;
  select state into result from pebble_sessions where device_id=p_device and household_id=hh;
  return result;
end $$;
revoke all on function public.pebble_register(uuid,text,text) from public,anon;
revoke all on function public.pebble_start(uuid,text,jsonb) from public,anon;
revoke all on function public.pebble_read(uuid) from public,anon;
grant execute on function public.pebble_register(uuid,text,text) to authenticated;
grant execute on function public.pebble_start(uuid,text,jsonb) to authenticated;
grant execute on function public.pebble_read(uuid) to authenticated;
commit;
