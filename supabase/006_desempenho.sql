-- =====================================================================
-- 006 — Desempenho: erros por participante e assuntos a melhorar
--
-- Só considera partidas FINALIZADAS. "Errou" = resposta errada; "sem resposta" = não respondeu a tempo
-- (conta como não acertou no aproveitamento). Quem vê: o administrador geral vê todas as partidas;
-- um organizador vê só as partidas que ele mesmo criou. Jogadores não têm acesso.
-- Execute DEPOIS de 001..005.
-- =====================================================================

-- base interna: uma linha por participante × pergunta apresentada (resposta ausente = is_correct nulo)
create or replace function public.perf_base(p_user uuid, p_session uuid)
returns table(session_id uuid, played_at timestamptz, pos int, question_id uuid,
              topic_id uuid, topic_name text, user_id uuid, nickname text,
              option_id uuid, is_correct boolean)
language sql stable security definer set search_path = public as $$
  select g.id, coalesce(g.finished_at, g.created_at), sq.position, sq.question_id,
         q.topic_id, coalesce(t.name, 'Sem assunto'), p.user_id, p.nickname,
         a.option_id, a.is_correct
    from game_sessions g
    join session_questions sq on sq.session_id = g.id
    join participants p on p.session_id = g.id
    left join questions q on q.id = sq.question_id
    left join topics t on t.id = q.topic_id
    left join answers a on a.session_id = g.id and a.position = sq.position and a.participant_id = p.id
   where public.is_admin()
     and g.status = 'finished'
     and (g.host_id = auth.uid() or public.is_super())
     and (p_session is null or g.id = p_session)
     and (p_user is null or p.user_id = p_user)
$$;
revoke execute on function public.perf_base(uuid, uuid) from public, anon, authenticated;

-- partidas finalizadas visíveis (para o filtro)
create or replace function public.perf_sessions()
returns table(id uuid, topic_label text, finished_at timestamptz, players int)
language sql stable security definer set search_path = public as $$
  select g.id, g.topic_label, coalesce(g.finished_at, g.created_at),
         (select count(*)::int from participants p where p.session_id = g.id)
    from game_sessions g
   where public.is_admin() and g.status = 'finished' and (g.host_id = auth.uid() or public.is_super())
   order by 3 desc
$$;

-- desempenho por assunto (geral, ou de um participante, ou de uma partida)
create or replace function public.perf_by_topic(p_user uuid default null, p_session uuid default null)
returns table(topic_id uuid, topic_name text, asked int, correct int, wrong int, unanswered int, pct numeric)
language sql stable security definer set search_path = public as $$
  select b.topic_id, b.topic_name,
         count(*)::int,
         (count(*) filter (where b.is_correct))::int,
         (count(*) filter (where b.is_correct is false))::int,
         (count(*) filter (where b.is_correct is null))::int,
         round(100.0 * count(*) filter (where b.is_correct) / count(*), 1)
    from public.perf_base(p_user, p_session) b
   group by b.topic_id, b.topic_name
   order by 7 asc, 3 desc
$$;

-- um resumo por participante, com os assuntos mais fracos
create or replace function public.perf_participants(p_session uuid default null)
returns table(user_id uuid, nickname text, email text, games int, asked int, correct int,
              wrong int, unanswered int, pct numeric, weak_topics text[])
language sql stable security definer set search_path = public as $$
  with b as (select * from public.perf_base(null, p_session)),
  per_topic as (
    select b.user_id, b.topic_name,
           round(100.0 * count(*) filter (where b.is_correct) / count(*), 1) as pct
      from b group by b.user_id, b.topic_name
  ),
  weak as (
    select w.user_id, array_agg(w.topic_name order by w.pct, w.topic_name) as topics
      from (select pt.*, row_number() over (partition by pt.user_id order by pt.pct, pt.topic_name) as rn
              from per_topic pt where pt.pct < 70) w
     where w.rn <= 3
     group by w.user_id
  )
  select b.user_id,
         (array_agg(b.nickname order by b.played_at desc))[1],
         case when public.is_super() then (select a.email from app_access a where a.user_id = b.user_id) end,
         count(distinct b.session_id)::int,
         count(*)::int,
         (count(*) filter (where b.is_correct))::int,
         (count(*) filter (where b.is_correct is false))::int,
         (count(*) filter (where b.is_correct is null))::int,
         round(100.0 * count(*) filter (where b.is_correct) / count(*), 1),
         coalesce((select w.topics from weak w where w.user_id = b.user_id), '{}')
    from b
   group by b.user_id
   order by 9 asc, 5 desc
$$;

-- questões que um participante errou (ou deixou sem resposta), com a resposta certa e a explicação
create or replace function public.perf_wrong_answers(p_user uuid, p_session uuid default null)
returns table(session_id uuid, played_at timestamptz, pos int, topic_name text, question_id uuid,
              question_text text, chosen_text text, correct_text text, explanation text, status text)
language sql stable security definer set search_path = public as $$
  select b.session_id, b.played_at, b.pos, b.topic_name, b.question_id,
         coalesce(q.text, sq.payload ->> 'text'),
         (select o.text from options o where o.id = b.option_id),
         (select o.text from option_keys k join options o on o.id = k.option_id
           where k.question_id = b.question_id and k.is_correct limit 1),
         q.explanation,
         case when b.is_correct is null then 'unanswered' else 'wrong' end
    from public.perf_base(p_user, p_session) b
    join session_questions sq on sq.session_id = b.session_id and sq.position = b.pos
    left join questions q on q.id = b.question_id
   where b.is_correct is not true
   order by b.played_at desc, b.pos
   limit 500
$$;

-- questões mais erradas pelo grupo
create or replace function public.perf_hard_questions(p_session uuid default null)
returns table(question_id uuid, question_text text, topic_name text, asked int, missed int, pct_missed numeric)
language sql stable security definer set search_path = public as $$
  select b.question_id, coalesce(q.text, '(pergunta removida)'), b.topic_name,
         count(*)::int,
         (count(*) filter (where b.is_correct is not true))::int,
         round(100.0 * count(*) filter (where b.is_correct is not true) / count(*), 1)
    from public.perf_base(null, p_session) b
    left join questions q on q.id = b.question_id
   group by b.question_id, q.text, b.topic_name
  having count(*) filter (where b.is_correct is not true) > 0
   order by 6 desc, 5 desc
   limit 20
$$;

revoke execute on function public.perf_sessions() from anon;
revoke execute on function public.perf_by_topic(uuid, uuid) from anon;
revoke execute on function public.perf_participants(uuid) from anon;
revoke execute on function public.perf_wrong_answers(uuid, uuid) from anon;
revoke execute on function public.perf_hard_questions(uuid) from anon;
