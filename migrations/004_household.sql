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
