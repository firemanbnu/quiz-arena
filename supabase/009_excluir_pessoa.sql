-- =====================================================================
-- 009 — Excluir pessoa + lista de participantes antigos (convidados sem conta)
-- * admin_list_guests(): quem jogou competições antigas sem criar conta (acesso anônimo da versão anterior).
-- * admin_delete_user(p_user): exclui a conta e tudo dela (partidas, histórico e ranking). Só o administrador geral.
--   Não exclui o administrador geral, nem quem criou competições ou perguntas (nesses casos, bloqueie).
-- Execute DEPOIS de 001..008.
-- =====================================================================
create or replace function public.admin_list_guests()
returns table(user_id uuid, nickname text, games bigint, in_ranking boolean, last_played timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'not allowed'; end if;
  return query
    select p.user_id,
           (array_agg(p.nickname order by s.created_at desc))[1] as nickname,
           count(distinct p.session_id) as games,
           exists (select 1 from public.global_ranking g where g.user_id = p.user_id) as in_ranking,
           max(s.created_at) as last_played
      from public.participants p
      join public.game_sessions s on s.id = p.session_id
     where not exists (select 1 from public.app_access a where a.user_id = p.user_id)
     group by p.user_id
     order by max(s.created_at) desc;
end $$;
revoke execute on function public.admin_list_guests() from anon;

create or replace function public.admin_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'not allowed'; end if;
  if p_user = auth.uid() or exists (select 1 from public.app_access where user_id = p_user and role = 'admin') then
    raise exception 'O administrador geral não pode ser excluído';
  end if;
  if exists (select 1 from public.game_sessions where host_id = p_user)
     or exists (select 1 from public.questions where owner_id = p_user) then
    raise exception 'Esta pessoa criou competições ou perguntas. Para não apagá-las, use Bloquear em vez de excluir.';
  end if;
  delete from auth.users where id = p_user;
  if not found then raise exception 'Usuário não encontrado'; end if;
end $$;
revoke execute on function public.admin_delete_user(uuid) from anon;
