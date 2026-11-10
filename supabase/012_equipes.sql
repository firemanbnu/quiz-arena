-- =====================================================================
-- 012 - Competição por equipes (soma de pontos, só vencedor/perdedor, sem ranking)
-- Execute DEPOIS de 001..011.
-- =====================================================================
alter table public.game_sessions add column if not exists mode text not null default 'individual';
do $$ begin
  alter table public.game_sessions add constraint game_sessions_mode_chk check (mode in ('individual','team'));
exception when duplicate_object then null; end $$;

create table if not exists public.session_teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  position int not null,
  name text not null,
  unique (session_id, position)
);
alter table public.session_teams enable row level security;
drop policy if exists session_teams_read on public.session_teams;
create policy session_teams_read on public.session_teams for select
  using (public.is_host(session_id) or public.is_member(session_id) or public.is_super());

alter table public.participants add column if not exists team_id uuid references public.session_teams(id) on delete set null;

-- ---------- o apresentador define as duas equipes (ou volta ao modo individual) ----------
create or replace function public.set_session_teams(p_session uuid, p_names text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; n1 text; n2 text;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select * into v_s from game_sessions where id = p_session and host_id = auth.uid() for update;
  if not found then raise exception 'not allowed'; end if;
  if v_s.status <> 'lobby' then raise exception 'As equipes só podem ser alteradas antes de iniciar'; end if;

  if p_names is null or cardinality(p_names) = 0 then
    update participants set team_id = null where session_id = p_session;
    delete from session_teams where session_id = p_session;
    update game_sessions set mode = 'individual' where id = p_session;
    return;
  end if;
  if cardinality(p_names) <> 2 then raise exception 'A competição por equipes tem exatamente 2 equipes'; end if;
  n1 := left(trim(p_names[1]), 30); n2 := left(trim(p_names[2]), 30);
  if n1 = '' or n2 = '' then raise exception 'Dê um nome para cada equipe'; end if;
  if lower(n1) = lower(n2) then raise exception 'As equipes precisam ter nomes diferentes'; end if;

  insert into session_teams(session_id, position, name) values (p_session, 0, n1), (p_session, 1, n2)
    on conflict (session_id, position) do update set name = excluded.name;
  update game_sessions set mode = 'team' where id = p_session;
end $$;

-- ---------- equipes de uma sala, pelo código (tela de entrada) ----------
create or replace function public.session_teams_by_code(p_code text)
returns table(id uuid, name text, "position" int, members bigint)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.position, (select count(*) from participants p where p.team_id = t.id)
    from game_sessions s join session_teams t on t.session_id = s.id
   where public.is_approved() and s.code = upper(trim(p_code)) and s.mode = 'team' and s.status = 'lobby'
   order by t.position;
$$;

-- ---------- entrar na sala (agora com escolha de equipe) ----------
drop function if exists public.join_session(text, text);
create or replace function public.join_session(p_code text, p_nickname text, p_team uuid default null)
returns participants language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; v_p participants;
begin
  if not public.is_approved() then raise exception 'Acesso não autorizado pelo administrador'; end if;
  select * into v_s from game_sessions where code = upper(trim(p_code));
  if not found then raise exception 'Código inválido'; end if;
  if v_s.status <> 'lobby' then
    select * into v_p from participants where session_id = v_s.id and user_id = auth.uid();
    if found then return v_p; end if;
    raise exception 'A partida já começou';
  end if;
  if not exists (select 1 from participants where session_id = v_s.id and user_id = auth.uid())
     and (select count(*) from participants where session_id = v_s.id) >= 150 then
    raise exception 'Sala cheia (limite de 150 jogadores)';
  end if;
  if v_s.mode = 'team' then
    if p_team is null or not exists (select 1 from session_teams where id = p_team and session_id = v_s.id) then
      raise exception 'Escolha a sua equipe';
    end if;
  else
    p_team := null;
  end if;
  insert into participants(session_id, user_id, nickname, team_id)
    values (v_s.id, auth.uid(), left(trim(p_nickname), 24), p_team)
    on conflict (session_id, user_id) do update set nickname = excluded.nickname, team_id = excluded.team_id
    returning * into v_p;
  return v_p;
end $$;

-- ---------- o apresentador move um jogador de equipe (antes de iniciar) ----------
create or replace function public.set_participant_team(p_participant uuid, p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_sid uuid;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select p.session_id into v_sid from participants p join game_sessions s on s.id = p.session_id
   where p.id = p_participant and s.host_id = auth.uid() and s.status = 'lobby' and s.mode = 'team';
  if v_sid is null then raise exception 'not allowed'; end if;
  if not exists (select 1 from session_teams where id = p_team and session_id = v_sid) then raise exception 'Equipe inválida'; end if;
  update participants set team_id = p_team where id = p_participant;
end $$;

-- ---------- total das equipes (soma dos pontos dos integrantes) ----------
create or replace function public.team_scores(p_session uuid)
returns table(team_id uuid, name text, "position" int, members bigint, score bigint, correct bigint)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.position,
         (select count(*) from participants p where p.team_id = t.id),
         coalesce((select sum(p.score) from participants p where p.team_id = t.id), 0),
         coalesce((select sum(p.correct_count) from participants p where p.team_id = t.id), 0)
    from session_teams t
   where t.session_id = p_session
     and (public.is_host(p_session) or public.is_member(p_session) or public.is_super())
   order by t.position;
$$;

-- ---------- histórico das competições por equipes ----------
create or replace function public.team_history()
returns table(session_id uuid, topic_label text, finished_at timestamptz, question_count int, teams jsonb)
language sql stable security definer set search_path = public as $$
  select s.id, s.topic_label, s.finished_at, s.question_count,
         (select jsonb_agg(jsonb_build_object(
                   'name', t.name,
                   'members', (select count(*) from participants p where p.team_id = t.id),
                   'score', coalesce((select sum(p.score) from participants p where p.team_id = t.id), 0)) order by t.position)
            from session_teams t where t.session_id = s.id)
    from game_sessions s
   where s.mode = 'team' and s.status = 'finished' and public.is_approved()
     and (public.is_super() or s.host_id = auth.uid()
          or exists (select 1 from participants p where p.session_id = s.id and p.user_id = auth.uid()))
   order by s.finished_at desc
   limit 100;
$$;

-- ---------- avanço da partida: equipes completas para iniciar; equipes não entram no ranking ----------
create or replace function public.host_advance(p_session uuid, p_from_status text, p_from_index integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; v_topic text;
begin
  if not public.is_admin() then raise exception 'not host'; end if;
  select * into v_s from game_sessions where id = p_session and host_id = auth.uid() for update;
  if not found then raise exception 'not host'; end if;
  if v_s.status <> p_from_status or v_s.current_index <> p_from_index then return; end if;

  if v_s.status = 'lobby' then
    if v_s.mode = 'team' then
      if exists (select 1 from participants where session_id = p_session and team_id is null) then
        raise exception 'Há jogadores sem equipe. Distribua todos antes de iniciar.';
      end if;
      if (select count(distinct team_id) from participants where session_id = p_session) < 2 then
        raise exception 'Cada equipe precisa ter ao menos um jogador.';
      end if;
    end if;
    update game_sessions set status = 'question', current_index = 0, question_started_at = now()
      where id = p_session;
  elsif v_s.status = 'question' then
    update game_sessions set status = 'reveal' where id = p_session;
  elsif v_s.status = 'reveal' then
    if v_s.current_index + 1 >= v_s.question_count then
      update game_sessions set status = 'finished', finished_at = now() where id = p_session;
      v_topic := v_s.topic_label;

      if v_s.mode = 'individual' then
        insert into match_history(session_id, user_id, nickname, topic_name, final_rank,
                                  score, correct_count, total_questions)
        select p_session, p.user_id, p.nickname, v_topic,
               (rank() over (order by p.score desc))::int, p.score, p.correct_count, v_s.question_count
        from participants p where p.session_id = p_session
        on conflict do nothing;

        insert into global_ranking(user_id, nickname, total_score, games_played, wins,
                                   correct_total, answered_total)
        select h.user_id, h.nickname, h.score, 1, (h.final_rank = 1)::int,
               h.correct_count, h.total_questions
        from match_history h where h.session_id = p_session
        on conflict (user_id) do update set
          nickname = excluded.nickname,
          total_score = global_ranking.total_score + excluded.total_score,
          games_played = global_ranking.games_played + 1,
          wins = global_ranking.wins + excluded.wins,
          correct_total = global_ranking.correct_total + excluded.correct_total,
          answered_total = global_ranking.answered_total + excluded.answered_total,
          updated_at = now();
      end if;
    else
      update game_sessions
         set status = 'question', current_index = current_index + 1, question_started_at = now()
       where id = p_session;
    end if;
  end if;
end $$;

-- ---------- auditoria: competição por equipes não tem histórico individual ----------
create or replace function public.audit_participants(p_session uuid)
returns table(user_id uuid, nickname text, stored_score integer, recomputed_score integer, stored_correct integer, recomputed_correct integer,
              history_score integer, history_rank integer, recomputed_rank integer, ok boolean, note text)
language plpgsql stable security definer set search_path = public as $$
declare v_s game_sessions;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into v_s from game_sessions g where g.id = p_session and (g.host_id = auth.uid() or public.is_super());
  if not found then raise exception 'Partida não encontrada'; end if;

  return query
    with recursive ans as (
      select a.participant_id pid, a.points pts, a.is_correct okc,
             row_number() over (partition by a.participant_id order by a.position) rn
        from answers a where a.session_id = p_session
    ), run as (
      select ans.pid, ans.rn, greatest(0, ans.pts) sc, (case when ans.okc then 1 else 0 end) cc from ans where ans.rn = 1
      union all
      select a2.pid, a2.rn, greatest(0, r.sc + a2.pts), r.cc + (case when a2.okc then 1 else 0 end)
        from run r join ans a2 on a2.pid = r.pid and a2.rn = r.rn + 1
    ), fin as (
      select distinct on (run.pid) run.pid, run.sc, run.cc from run order by run.pid, run.rn desc
    ), x as (
      select p.user_id, p.nickname, p.score, p.correct_count,
             coalesce(f.sc, 0) sc, coalesce(f.cc, 0) cc, h.score hs, h.final_rank hr,
             (rank() over (order by coalesce(f.sc, 0) desc))::int rr
        from participants p
        left join fin f on f.pid = p.id
        left join match_history h on h.session_id = p_session and h.user_id = p.user_id
       where p.session_id = p_session
    )
    select x.user_id, x.nickname, x.score, x.sc, x.correct_count, x.cc, x.hs, x.hr, x.rr,
           (x.score = x.sc and x.correct_count = x.cc
             and (v_s.status <> 'finished' or v_s.mode = 'team' or (x.hs is not distinct from x.sc and x.hr is not distinct from x.rr))),
           case when x.score <> x.sc then 'pontuação gravada difere da soma das respostas'
                when x.correct_count <> x.cc then 'acertos gravados diferem das respostas'
                when v_s.status = 'finished' and v_s.mode = 'individual' and x.hs is distinct from x.sc then 'histórico difere da soma das respostas'
                when v_s.status = 'finished' and v_s.mode = 'individual' and x.hr is distinct from x.rr then 'posição no histórico difere do recálculo'
           end
      from x
     order by x.sc desc, x.nickname;
end $$;

revoke execute on function public.set_session_teams(uuid, text[]), public.session_teams_by_code(text), public.set_participant_team(uuid, uuid),
  public.team_scores(uuid), public.team_history() from anon;
