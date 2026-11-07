-- Authenticated family owner creates a revocable read-only display identity.
create or replace function public.register_fridge_display(p_id uuid,p_secret_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare home uuid;
begin
 if auth.uid() is null or p_id is null or p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid device registration'; end if;
 select household_id into home from household_members where user_id=auth.uid() and role='owner' order by household_id limit 1;
 if home is null then raise exception 'Household owner required'; end if;
 insert into devices(id,household_id,name,secret_hash) values(p_id,home,'Fridge display Z96',p_secret_hash);
 return p_id;
end $$;
revoke all on function public.register_fridge_display(uuid,text) from public,anon;
grant execute on function public.register_fridge_display(uuid,text) to authenticated;

