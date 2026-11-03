-- =====================================================================
-- 008 — Lista de acessos completa
-- 1) Todo mundo que já criou conta passa a aparecer em Acessos (pendente, até o administrador decidir).
-- 2) Quem criar conta daqui para frente aparece na hora (gatilho em auth.users), mesmo sem ter logado.
-- 3) A lista mostra também o último acesso. Execute DEPOIS de 001..007.
-- =====================================================================
insert into public.app_access(user_id, email)
select u.id, u.email from auth.users u
 where not coalesce(u.is_anonymous, false)
on conflict (user_id) do nothing;

create or replace function public.handle_new_user_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(new.is_anonymous, false) then
    insert into public.app_access(user_id, email) values (new.id, new.email)
      on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_access on auth.users;
create trigger on_auth_user_created_access
  after insert on auth.users
  for each row execute function public.handle_new_user_access();

drop function if exists public.admin_list_access();
create function public.admin_list_access()
returns table(user_id uuid, email text, role text, status text, requested_at timestamptz, decided_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'not allowed'; end if;
  return query
    select a.user_id, a.email, a.role, a.status, a.requested_at, a.decided_at, u.last_sign_in_at
      from public.app_access a
      left join auth.users u on u.id = a.user_id
     order by (a.status = 'pending') desc, (a.role = 'admin') desc, a.requested_at desc;
end $$;
revoke execute on function public.admin_list_access() from anon;
