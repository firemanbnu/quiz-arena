-- =====================================================================
-- 005 — Acesso somente para autorizados pelo administrador geral
--
-- Papéis:  player (joga) · organizer (cria competições, banco de questões) · admin (geral: libera/bloqueia)
-- Fluxo:   a pessoa cria conta (e-mail/senha) -> fica "pending" -> o administrador geral aprova como
--          jogador ou organizador em /admin/acessos. Contas anônimas nunca são aprovadas.
-- Execute DEPOIS de 001..004. Troque o e-mail do administrador geral na última seção, se for outro.
-- =====================================================================

create table if not exists public.app_access (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text,
  role         text not null default 'player' check (role in ('player', 'organizer', 'admin')),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid
);
alter table public.app_access enable row level security;   -- sem policies: só as funções abaixo acessam
revoke all on public.app_access from anon, authenticated;

-- ---------- identidade e papel ----------
create or replace function public.access_role() returns text
language sql stable security definer set search_path = public as $$
  select a.role from public.app_access a
   where a.user_id = auth.uid() and a.status = 'approved'
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select public.access_role() is not null
$$;

-- is_admin() passa a significar "organizador aprovado" (host): todas as funções antigas continuam valendo
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.access_role() in ('organizer', 'admin'), false)
$$;

create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.access_role() = 'admin', false)
$$;

-- ---------- pedido de acesso e painel do administrador ----------
create or replace function public.request_access() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.app_access;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return jsonb_build_object('status', 'anon');
  end if;
  insert into public.app_access(user_id, email) values (auth.uid(), auth.jwt() ->> 'email')
    on conflict (user_id) do update set email = excluded.email
    returning * into v;
  return jsonb_build_object('status', v.status, 'role', case when v.status = 'approved' then v.role end);
end $$;

create or replace function public.admin_list_access()
returns table(user_id uuid, email text, role text, status text, requested_at timestamptz, decided_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'not allowed'; end if;
  return query
    select a.user_id, a.email, a.role, a.status, a.requested_at, a.decided_at
      from public.app_access a
     order by (a.status = 'pending') desc, (a.role = 'admin') desc, a.requested_at desc;
end $$;

create or replace function public.admin_set_access(p_user uuid, p_role text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.app_access;
begin
  if not public.is_super() then raise exception 'not allowed'; end if;
  if p_role not in ('player', 'organizer') then raise exception 'papel inválido'; end if;
  if p_status not in ('pending', 'approved', 'blocked') then raise exception 'status inválido'; end if;
  select * into v from public.app_access where user_id = p_user for update;
  if not found then raise exception 'usuário não encontrado'; end if;
  if v.role = 'admin' or p_user = auth.uid() then raise exception 'o administrador geral não pode ser alterado'; end if;
  update public.app_access
     set role = p_role, status = p_status, decided_at = now(), decided_by = auth.uid()
   where user_id = p_user;
end $$;

-- ---------- tudo que lê ou escreve exige conta aprovada ----------
create or replace function public.is_host(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved()
     and exists (select 1 from game_sessions where id = p_session and host_id = auth.uid())
$$;

create or replace function public.is_member(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved()
     and exists (select 1 from participants where session_id = p_session and user_id = auth.uid())
$$;

create or replace function public.can_see_question(p_session uuid, p_pos int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved() and exists (
    select 1 from game_sessions g
    where g.id = p_session
      and (g.host_id = auth.uid()
           or (exists (select 1 from participants p where p.session_id = g.id and p.user_id = auth.uid())
               and g.status in ('question','reveal')
               and g.current_index = p_pos))
  )
$$;

create or replace function public.can_see_result(p_session uuid, p_pos int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved() and exists (
    select 1 from game_sessions g
    where g.id = p_session
      and (g.status in ('reveal','finished') or p_pos < g.current_index)
  )
$$;

drop policy if exists sessions_read on public.game_sessions;
create policy sessions_read on public.game_sessions for select
  using (public.is_approved() and (host_id = auth.uid() or public.is_member(id)));

drop policy if exists history_read on public.match_history;
create policy history_read on public.match_history for select using (public.is_approved());
drop policy if exists ranking_read on public.global_ranking;
create policy ranking_read on public.global_ranking for select using (public.is_approved());

-- entrar na sala, responder, avançar a partida, remover participante
create or replace function public.join_session(p_code text, p_nickname text)
returns public.participants language plpgsql security definer set search_path = public as $$
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
  insert into participants(session_id, user_id, nickname)
    values (v_s.id, auth.uid(), left(trim(p_nickname), 24))
    on conflict (session_id, user_id) do update set nickname = excluded.nickname
    returning * into v_p;
  return v_p;
end $$;

create or replace function public.submit_answer(p_session uuid, p_option uuid, p_elapsed_ms int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s game_sessions; v_p participants; v_q uuid; v_ok boolean; v_limit int;
  v_server_ms int; v_elapsed int; v_pts int; v_ins int;
begin
  if not public.is_approved() then raise exception 'Acesso não autorizado pelo administrador'; end if;
  select * into v_s from game_sessions where id = p_session;
  if not found or v_s.status <> 'question' then return; end if;
  select * into v_p from participants where session_id = p_session and user_id = auth.uid();
  if not found then raise exception 'not a participant'; end if;

  v_limit := v_s.time_limit_s * 1000;
  v_server_ms := (extract(epoch from (now() - v_s.question_started_at)) * 1000)::int;
  if v_server_ms > v_limit + 3000 then return; end if;

  select question_id into v_q from session_questions
    where session_id = p_session and position = v_s.current_index;
  select k.is_correct into v_ok from option_keys k
    join options o on o.id = k.option_id
    where k.option_id = p_option and o.question_id = v_q;
  if v_ok is null then raise exception 'opção inválida'; end if;

  v_elapsed := least(greatest(p_elapsed_ms, v_server_ms - 2000, 0), v_limit);
  v_pts := case when v_ok
                then round(1000 * (1 - 0.5 * v_elapsed::numeric / v_limit))::int
                else -v_s.wrong_penalty end;

  insert into answers(session_id, position, participant_id, option_id, is_correct, elapsed_ms, points)
    values (p_session, v_s.current_index, v_p.id, p_option, v_ok, v_elapsed, v_pts)
    on conflict do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 1 then
    update participants
       set score = greatest(0, score + v_pts),
           correct_count = correct_count + (case when v_ok then 1 else 0 end)
     where id = v_p.id;
  end if;
end $$;

create or replace function public.host_advance(p_session uuid, p_from_status text, p_from_index int)
returns void language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; v_topic text;
begin
  if not public.is_admin() then raise exception 'not host'; end if;
  select * into v_s from game_sessions where id = p_session and host_id = auth.uid() for update;
  if not found then raise exception 'not host'; end if;
  if v_s.status <> p_from_status or v_s.current_index <> p_from_index then return; end if;

  if v_s.status = 'lobby' then
    update game_sessions set status = 'question', current_index = 0, question_started_at = now()
      where id = p_session;
  elsif v_s.status = 'question' then
    update game_sessions set status = 'reveal' where id = p_session;
  elsif v_s.status = 'reveal' then
    if v_s.current_index + 1 >= v_s.question_count then
      update game_sessions set status = 'finished', finished_at = now() where id = p_session;
      v_topic := v_s.topic_label;

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
    else
      update game_sessions
         set status = 'question', current_index = current_index + 1, question_started_at = now()
       where id = p_session;
    end if;
  end if;
end $$;

create or replace function public.remove_from_match(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; h match_history;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
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

-- treino individual também exige conta aprovada
create or replace function public.training_topics()
returns table(id uuid, name text, question_count bigint)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, count(q.id)
  from topics t join questions q on q.topic_id = t.id
  where t.training_enabled and public.is_approved()
  group by t.id, t.name
  order by t.name
$$;

create or replace function public.training_questions(p_topics uuid[], p_count int, p_balanced boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  with pool as (
    select q.id, q.text,
           row_number() over (partition by q.topic_id order by random()) as rn_topic
    from questions q join topics t on t.id = q.topic_id
    where t.training_enabled and q.topic_id = any(p_topics) and public.is_approved()
  ), picked as (
    select id, text from pool
    order by case when p_balanced then rn_topic else 0 end, random()
    limit least(greatest(p_count, 1), 50)
  ), numbered as (
    select id, text, row_number() over (order by random()) as pos from picked
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'text', n.text,
           'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text) order by random())
                       from options o where o.question_id = n.id)
         ) order by n.pos), '[]'::jsonb)
  from numbered n
$$;

create or replace function public.training_check(p_question uuid, p_option uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_correct uuid; v_expl text;
begin
  if not public.is_approved() then raise exception 'Acesso não autorizado pelo administrador'; end if;
  select k.option_id, q.explanation into v_correct, v_expl
  from questions q
  join topics t on t.id = q.topic_id and t.training_enabled
  join option_keys k on k.question_id = q.id and k.is_correct
  where q.id = p_question
  limit 1;
  if v_correct is null then raise exception 'pergunta indisponível para treino'; end if;
  return jsonb_build_object(
    'correct_option', v_correct,
    'is_correct', (p_option is not null and p_option = v_correct),
    'explanation', v_expl);
end $$;

-- funções internas/administrativas: só o que precisa ficar exposto
revoke execute on function public.admin_list_access() from anon;
revoke execute on function public.admin_set_access(uuid, text, text) from anon;
revoke execute on function public.request_access() from anon;

-- ---------- administrador geral (troque o e-mail se for outro) ----------
insert into public.app_access(user_id, email, role, status, decided_at)
select id, email, 'admin', 'approved', now() from auth.users where email = 'firemanbnu@gmail.com'
on conflict (user_id) do update set role = 'admin', status = 'approved', decided_at = now();
