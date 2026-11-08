-- =====================================================================
-- 011 — Revisão da competição, auditoria de pontos, sem perguntas repetidas e resultado imediato
-- * submit_answer passa a devolver {correct, points}: o jogador vê na hora se acertou ou errou.
-- * create_session não repete perguntas (nem as de texto igual, mesmo em assuntos diferentes).
-- * review_session / review_answers: revisão das perguntas (jogador: a própria; host/administrador: todas).
-- * audit_participants / audit_answers: conferência dos pontos pelo administrador.
-- Execute DEPOIS de 001..010.
-- =====================================================================
create unique index if not exists session_questions_unique_question on public.session_questions(session_id, question_id);

-- ---------- sem perguntas repetidas na mesma competição ----------
create or replace function public.create_session(p_topics uuid[], p_count integer, p_time integer, p_penalty integer default 0, p_balanced boolean default false)
returns game_sessions language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; v_code text; v_total int; v_label text;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  if p_topics is null or cardinality(p_topics) = 0 then raise exception 'escolha ao menos um assunto'; end if;

  -- perguntas distintas: o mesmo texto (ignorando maiúsculas, pontuação e espaços) conta uma vez só
  select count(distinct lower(regexp_replace(q.text, '[^[:alnum:]]+', '', 'g'))) into v_total
    from questions q where q.topic_id = any(p_topics) and q.owner_id = auth.uid();
  if v_total = 0 then raise exception 'assuntos sem perguntas'; end if;
  select string_agg(name, ' + ' order by name) into v_label
    from topics where id = any(p_topics) and owner_id = auth.uid();

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from game_sessions where code = v_code);
  end loop;

  insert into game_sessions(code, host_id, topic_id, topic_ids, topic_label, time_limit_s, question_count, wrong_penalty)
    values (v_code, auth.uid(), p_topics[1], p_topics, v_label, p_time, least(p_count, v_total), p_penalty)
    returning * into v_s;

  insert into session_questions(session_id, position, question_id, payload)
  with pool as (
    select distinct on (lower(regexp_replace(q.text, '[^[:alnum:]]+', '', 'g')))
           q.id, q.text, q.topic_id
      from questions q
     where q.topic_id = any(p_topics) and q.owner_id = auth.uid()
     order by lower(regexp_replace(q.text, '[^[:alnum:]]+', '', 'g')), random()
  ), ranked as (
    select id, text, row_number() over (partition by topic_id order by random()) as rn_topic from pool
  ), picked as (
    select id, text from ranked
    order by case when p_balanced then rn_topic else 0 end, random()
    limit v_s.question_count
  ), numbered as (
    select id, text, (row_number() over (order by random()) - 1)::int as pos from picked
  )
  select v_s.id, n.pos, n.id,
         jsonb_build_object('text', n.text, 'options', (
           select jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text) order by random())
           from options o where o.question_id = n.id))
  from numbered n;

  return v_s;
end $$;

-- ---------- resultado imediato para o jogador ----------
drop function if exists public.submit_answer(uuid, uuid, integer);
create function public.submit_answer(p_session uuid, p_option uuid, p_elapsed_ms integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s game_sessions; v_p participants; v_q uuid; v_ok boolean; v_limit int;
  v_server_ms int; v_since int; v_floor int; v_ack timestamptz;
  v_elapsed int; v_pts int; v_ins int; v_old answers;
begin
  if not public.is_approved() then raise exception 'Acesso não autorizado pelo administrador'; end if;
  select * into v_s from game_sessions where id = p_session;
  if not found or v_s.status <> 'question' then return jsonb_build_object('late', true); end if;
  select * into v_p from participants where session_id = p_session and user_id = auth.uid();
  if not found then raise exception 'not a participant'; end if;

  -- já respondeu esta pergunta: devolve o resultado que já valeu
  select * into v_old from answers where session_id = p_session and position = v_s.current_index and participant_id = v_p.id;
  if found then return jsonb_build_object('correct', v_old.is_correct, 'points', v_old.points); end if;

  v_limit := v_s.time_limit_s * 1000;
  v_server_ms := (extract(epoch from (now() - v_s.question_started_at)) * 1000)::int;

  select acked_at into v_ack from question_acks
   where session_id = p_session and position = v_s.current_index and participant_id = v_p.id;

  if v_ack is not null then
    v_since := (extract(epoch from (now() - v_ack)) * 1000)::int;
    if v_since > v_limit + 3000 then return jsonb_build_object('late', true); end if;
    v_floor := v_since - 2000;
  else
    if v_server_ms > v_limit + 10000 then return jsonb_build_object('late', true); end if;
    v_floor := v_server_ms - 10000;
  end if;

  select question_id into v_q from session_questions
    where session_id = p_session and position = v_s.current_index;
  select k.is_correct into v_ok from option_keys k
    join options o on o.id = k.option_id
    where k.option_id = p_option and o.question_id = v_q;
  if v_ok is null then raise exception 'opção inválida'; end if;

  v_elapsed := least(greatest(p_elapsed_ms, v_floor, 0), v_limit);
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
  return jsonb_build_object('correct', v_ok, 'points', v_pts);
end $$;
revoke execute on function public.submit_answer(uuid, uuid, integer) from anon;

-- ---------- revisão das perguntas ----------
-- Quem pode ver a revisão de uma competição encerrada: quem jogou, o host e o administrador geral.
create or replace function public.can_review(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_approved()
     and exists (select 1 from game_sessions g where g.id = p_session and g.status = 'finished')
     and (public.is_super()
          or exists (select 1 from game_sessions g where g.id = p_session and g.host_id = auth.uid())
          or exists (select 1 from participants p where p.session_id = p_session and p.user_id = auth.uid()))
$$;
revoke execute on function public.can_review(uuid) from public, anon;

create or replace function public.review_session(p_session uuid)
returns table(pos integer, question_id uuid, question_text text, topic_name text, explanation text, options jsonb,
              correct_option_id uuid, my_option_id uuid, my_status text, my_points integer, my_elapsed_ms integer,
              answered integer, hits integer, total integer)
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid;
begin
  if not public.can_review(p_session) then raise exception 'Revisão indisponível para você'; end if;
  select p.id into v_me from participants p where p.session_id = p_session and p.user_id = auth.uid();
  return query
    select sq.position, sq.question_id, coalesce(q.text, sq.payload ->> 'text'), coalesce(t.name, 'Sem assunto'), q.explanation,
           (select jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text, 'correct', coalesce(k.is_correct, false)) order by o.position)
              from options o left join option_keys k on k.option_id = o.id where o.question_id = sq.question_id),
           (select k.option_id from option_keys k where k.question_id = sq.question_id and k.is_correct limit 1),
           ma.option_id,
           case when v_me is null then null when ma.id is null then 'unanswered' when ma.is_correct then 'correct' else 'wrong' end,
           ma.points, ma.elapsed_ms,
           (select count(*)::int from answers a where a.session_id = p_session and a.position = sq.position),
           (select count(*)::int from answers a where a.session_id = p_session and a.position = sq.position and a.is_correct),
           (select count(*)::int from participants pp where pp.session_id = p_session)
      from session_questions sq
      left join questions q on q.id = sq.question_id
      left join topics t on t.id = q.topic_id
      left join answers ma on ma.session_id = p_session and ma.position = sq.position and ma.participant_id = v_me
     where sq.session_id = p_session
     order by sq.position;
end $$;

-- Quem respondeu o quê. Jogadores veem só quem ACERTOU e a própria resposta; host/administrador veem todos.
create or replace function public.review_answers(p_session uuid)
returns table(pos integer, user_id uuid, nickname text, status text, option_text text, points integer, elapsed_ms integer)
language plpgsql stable security definer set search_path = public as $$
declare v_full boolean;
begin
  if not public.can_review(p_session) then raise exception 'Revisão indisponível para você'; end if;
  v_full := public.is_super() or exists (select 1 from game_sessions g where g.id = p_session and g.host_id = auth.uid());
  return query
    select sq.position, p.user_id, p.nickname,
           case when a.id is null then 'unanswered' when a.is_correct then 'correct' else 'wrong' end,
           (select o.text from options o where o.id = a.option_id),
           a.points, a.elapsed_ms
      from session_questions sq
      join participants p on p.session_id = p_session
      left join answers a on a.session_id = p_session and a.position = sq.position and a.participant_id = p.id
     where sq.session_id = p_session
       and (v_full or p.user_id = auth.uid() or a.is_correct)
     order by sq.position, (a.is_correct is true) desc, a.elapsed_ms nulls last, p.nickname;
end $$;

-- ---------- auditoria dos pontos (host da partida e administrador geral) ----------
create or replace function public.audit_answers(p_session uuid)
returns table(pos integer, user_id uuid, nickname text, status text, elapsed_ms integer, points integer, expected_points integer, device_notice boolean, issue text)
language plpgsql stable security definer set search_path = public as $$
declare v_s game_sessions; v_limit int;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into v_s from game_sessions g where g.id = p_session and (g.host_id = auth.uid() or public.is_super());
  if not found then raise exception 'Partida não encontrada'; end if;
  v_limit := v_s.time_limit_s * 1000;
  return query
    select sq.position, p.user_id, p.nickname,
           case when a.id is null then 'unanswered' when a.is_correct then 'correct' else 'wrong' end,
           a.elapsed_ms, a.points,
           case when a.id is null then null
                when a.is_correct then round(1000 * (1 - 0.5 * a.elapsed_ms::numeric / v_limit))::int
                else -v_s.wrong_penalty end,
           (k.participant_id is not null),
           case when a.id is null then null
                when a.elapsed_ms > v_limit then 'tempo acima do limite'
                when a.points is distinct from (case when a.is_correct then round(1000 * (1 - 0.5 * a.elapsed_ms::numeric / v_limit))::int else -v_s.wrong_penalty end)
                  then 'pontos diferentes do esperado'
                when k.participant_id is null then 'sem confirmação do aparelho'
           end
      from session_questions sq
      join participants p on p.session_id = p_session
      left join answers a on a.session_id = p_session and a.position = sq.position and a.participant_id = p.id
      left join question_acks k on k.session_id = p_session and k.position = sq.position and k.participant_id = p.id
     where sq.session_id = p_session
     order by p.nickname, sq.position;
end $$;

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
             and (v_s.status <> 'finished' or (x.hs is not distinct from x.sc and x.hr is not distinct from x.rr))),
           case when x.score <> x.sc then 'pontuação gravada difere da soma das respostas'
                when x.correct_count <> x.cc then 'acertos gravados diferem das respostas'
                when v_s.status = 'finished' and x.hs is distinct from x.sc then 'histórico difere da soma das respostas'
                when v_s.status = 'finished' and x.hr is distinct from x.rr then 'posição no histórico difere do recálculo'
           end
      from x
     order by x.sc desc, x.nickname;
end $$;

revoke execute on function public.review_session(uuid), public.review_answers(uuid), public.audit_answers(uuid), public.audit_participants(uuid) from anon;
