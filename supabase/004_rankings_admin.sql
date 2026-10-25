-- Migração 004: o administrador pode tirar um participante de uma partida (e dos rankings)
-- e zerar o ranking permanente. Rode DEPOIS da 003.

-- marca se a linha do histórico ainda conta no ranking permanente
-- (ao zerar o ranking, as partidas antigas deixam de contar, mas continuam no histórico)
alter table public.match_history add column if not exists in_ranking boolean not null default true;

-- recompute_session passa a respeitar in_ranking (não "ressuscita" pontos de um ranking zerado)
create or replace function public.recompute_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s game_sessions; v_limit int; r record; cur uuid; sc int; cc int;
begin
  select * into v_s from game_sessions where id = p_session for update;
  if not found then return; end if;
  v_limit := v_s.time_limit_s * 1000;

  update answers a set
    is_correct = k.is_correct,
    points = case when k.is_correct
                  then round(1000 * (1 - 0.5 * a.elapsed_ms::numeric / v_limit))::int
                  else -v_s.wrong_penalty end
  from option_keys k
  where a.session_id = p_session and k.option_id = a.option_id;

  update participants set score = 0, correct_count = 0 where session_id = p_session;

  cur := null;
  for r in select participant_id, points, is_correct from answers
           where session_id = p_session order by participant_id, position loop
    if cur is distinct from r.participant_id then
      if cur is not null then
        update participants set score = sc, correct_count = cc where id = cur;
      end if;
      cur := r.participant_id; sc := 0; cc := 0;
    end if;
    sc := greatest(0, sc + r.points);
    cc := cc + (case when r.is_correct then 1 else 0 end);
  end loop;
  if cur is not null then
    update participants set score = sc, correct_count = cc where id = cur;
  end if;

  if v_s.status = 'finished' then
    with old as (
      select user_id, score, correct_count, final_rank, in_ranking
        from match_history where session_id = p_session
    ), new as (
      select p.user_id, p.score, p.correct_count, (rank() over (order by p.score desc))::int as rk
      from participants p where p.session_id = p_session
    ), upd as (
      update match_history h
         set score = n.score, correct_count = n.correct_count, final_rank = n.rk
        from new n
       where h.session_id = p_session and h.user_id = n.user_id
      returning h.user_id
    )
    update global_ranking g
       set total_score   = g.total_score + (n.score - o.score),
           correct_total = g.correct_total + (n.correct_count - o.correct_count),
           wins          = g.wins + ((n.rk = 1)::int - (o.final_rank = 1)::int),
           updated_at    = now()
      from new n join old o on o.user_id = n.user_id
     where g.user_id = n.user_id and o.in_ranking;
  end if;
end $$;
revoke all on function public.recompute_session(uuid) from public, anon, authenticated;

-- ---------- tirar um participante de uma partida ----------
-- Partida em andamento: ele sai da sala e do placar (as respostas dele são apagadas).
-- Partida encerrada: sai também do histórico e seus pontos são descontados do ranking
-- permanente; a posição final dos demais é recalculada. Só o host da partida pode.
create or replace function public.remove_from_match(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; h match_history;
begin
  select * into v_s from game_sessions where id = p_session and host_id = auth.uid() for update;
  if not found then raise exception 'not allowed'; end if;

  if v_s.status = 'finished' then
    select * into h from match_history where session_id = p_session and user_id = p_user;
    if found and h.in_ranking then
      update global_ranking
         set total_score = total_score - h.score,
             games_played = games_played - 1,
             wins = wins - (h.final_rank = 1)::int,
             correct_total = correct_total - h.correct_count,
             answered_total = answered_total - h.total_questions,
             updated_at = now()
       where user_id = p_user;
      delete from global_ranking where user_id = p_user and games_played <= 0;
    end if;
    delete from match_history where session_id = p_session and user_id = p_user;
  end if;

  delete from participants where session_id = p_session and user_id = p_user;

  if v_s.status = 'finished' then perform recompute_session(p_session); end if;
  update game_sessions set edit_version = edit_version + 1 where id = p_session;
end $$;

-- ---------- ranking permanente ----------
create or replace function public.admin_remove_from_ranking(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  delete from global_ranking where user_id = p_user;
  update match_history set in_ranking = false where user_id = p_user;
end $$;

-- zera o ranking permanente; opcionalmente apaga também o histórico de partidas
create or replace function public.admin_reset_ranking(p_clear_history boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  delete from global_ranking where true;
  if p_clear_history then
    delete from match_history where true;
  else
    update match_history set in_ranking = false where in_ranking;
  end if;
end $$;

grant execute on function public.remove_from_match(uuid, uuid) to authenticated;
grant execute on function public.admin_remove_from_ranking(uuid) to authenticated;
grant execute on function public.admin_reset_ranking(boolean) to authenticated;
revoke execute on function public.remove_from_match(uuid, uuid) from anon;
revoke execute on function public.admin_remove_from_ranking(uuid) from anon;
revoke execute on function public.admin_reset_ranking(boolean) from anon;
