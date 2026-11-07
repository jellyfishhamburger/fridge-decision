begin;
create or replace function public.pebble_action(p_device uuid,p_session uuid,p_revision bigint,p_action text,p_step integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare row public.pebble_sessions; s jsonb; ms bigint; remain bigint; ends bigint;
begin
  select ps.* into row from public.pebble_sessions ps
    join public.devices d on d.id=ps.device_id and d.household_id=ps.household_id
    join public.household_members m on m.household_id=ps.household_id
    where ps.device_id=p_device and m.user_id=auth.uid() for update of ps;
  if row.id is null then raise exception 'not authorized'; end if;
  if p_session is null or p_revision is null or row.id <> p_session or row.revision <> p_revision then raise exception 'stale revision'; end if;
  s:=row.state;
  if s->>'status' <> 'cooking' then raise exception 'session ended'; end if;
  ms:=floor(extract(epoch from clock_timestamp())*1000);
  ends:=(s->>'timer_ends_at')::bigint;
  remain:=case when ends is null then (s->>'remaining_ms')::bigint else greatest(0,ends-ms) end;
  if p_action='set_step' then
    if p_step is null or p_step<0 or p_step>=jsonb_array_length(s->'steps') then raise exception 'invalid step'; end if;
    if p_step<>(s->>'step_index')::integer then
      remain:=(s->'steps'->p_step->>'seconds')::bigint*1000; ends:=null;
      s:=s||jsonb_build_object('step_index',p_step);
    end if;
  elsif p_action='toggle_timer' then
    ends:=case when ends is null and remain>0 then ms+remain else null end;
  elsif p_action='exit' then
    remain:=0; ends:=null; s:=s||jsonb_build_object('status','exited');
  else raise exception 'invalid action'; end if;
  s:=s||jsonb_build_object('remaining_ms',remain,'timer_ends_at',ends,'revision',row.revision+1,'updated_at',ms);
  update public.pebble_sessions set state=s,revision=row.revision+1,updated_at=now() where id=row.id;
  return s;
end $$;
revoke all on function public.pebble_action(uuid,uuid,bigint,text,integer) from public,anon;
grant execute on function public.pebble_action(uuid,uuid,bigint,text,integer) to authenticated;
commit;
