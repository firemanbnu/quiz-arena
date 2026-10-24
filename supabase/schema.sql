-- =====================================================================
-- Quiz Arena — schema Supabase
-- Pré-requisitos no painel do Supabase:
--   Authentication > Providers > habilitar "Anonymous sign-ins" (participantes)
--   Authentication > Providers > Email (administradores)
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- helpers de identidade ----------
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- ---------- banco de questões ----------
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index on public.questions (topic_id);

create table public.options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  text text not null,
  position int not null default 0
);
create index on public.options (question_id);

-- gabarito separado: jogadores nunca leem esta tabela
create table public.option_keys (
  option_id uuid primary key references public.options(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  is_correct boolean not null
);
create index on public.option_keys (question_id);

-- ---------- partidas ----------
create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null default auth.uid() references auth.users(id),
  topic_id uuid references public.topics(id) on delete set null,
  topic_ids uuid[] not null default '{}',
  topic_label text,
  status text not null default 'lobby' check (status in ('lobby','question','reveal','finished')),
  time_limit_s int not null default 20 check (time_limit_s between 5 and 300),
  question_count int not null default 10,
  wrong_penalty int not null default 0 check (wrong_penalty >= 0),
  current_index int not null default -1,
  question_started_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- snapshot das perguntas da partida (opções já embaralhadas, SEM gabarito)
create table public.session_questions (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  position int not null,
  question_id uuid references public.questions(id) on delete set null,
  payload jsonb not null,  -- {text, options:[{id,text}]}
  primary key (session_id, position)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  score int not null default 0,
  correct_count int not null default 0,
  joined_at timestamptz not null default now(),
  unique (session_id, user_id)
);
create index on public.participants (session_id, score desc);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  position int not null,
  participant_id uuid not null references public.participants(id) on delete cascade,
  option_id uuid not null,
  is_correct boolean not null,
  elapsed_ms int not null,
  points int not null,
  created_at timestamptz not null default now(),
  unique (session_id, position, participant_id)
);

-- ---------- ranking permanente e histórico ----------
create table public.match_history (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  topic_name text,
  final_rank int not null,
  score int not null,
  correct_count int not null,
  total_questions int not null,
  played_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table public.global_ranking (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  total_score bigint not null default 0,
  games_played int not null default 0,
  wins int not null default 0,
  correct_total int not null default 0,
  answered_total int not null default 0,
  updated_at timestamptz not null default now()
);
create index on public.global_ranking (total_score desc);

-- ---------- funções auxiliares para RLS (evitam recursão) ----------
create or replace function public.is_host(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from game_sessions where id = p_session and host_id = auth.uid())
$$;

create or replace function public.is_member(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from participants where session_id = p_session and user_id = auth.uid())
$$;

create or replace function public.can_see_question(p_session uuid, p_pos int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
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
  select exists (
    select 1 from game_sessions g
    where g.id = p_session
      and (g.status in ('reveal','finished') or p_pos < g.current_index)
  )
$$;

-- ---------- RLS ----------
alter table public.topics            enable row level security;
alter table public.questions         enable row level security;
alter table public.options           enable row level security;
alter table public.option_keys       enable row level security;
alter table public.game_sessions     enable row level security;
alter table public.session_questions enable row level security;
alter table public.participants      enable row level security;
alter table public.answers           enable row level security;
alter table public.match_history     enable row level security;
alter table public.global_ranking    enable row level security;

create policy topics_owner on public.topics for all
  using (owner_id = auth.uid() and public.is_admin())
  with check (owner_id = auth.uid() and public.is_admin());

create policy questions_owner on public.questions for all
  using (owner_id = auth.uid() and public.is_admin())
  with check (owner_id = auth.uid() and public.is_admin());

create policy options_owner on public.options for all
  using (exists (select 1 from public.questions q where q.id = question_id and q.owner_id = auth.uid()))
  with check (exists (select 1 from public.questions q where q.id = question_id and q.owner_id = auth.uid()));

create policy keys_owner on public.option_keys for all
  using (exists (select 1 from public.questions q where q.id = question_id and q.owner_id = auth.uid()))
  with check (exists (select 1 from public.questions q where q.id = question_id and q.owner_id = auth.uid()));

create policy sessions_read on public.game_sessions for select
  using (host_id = auth.uid() or public.is_member(id));
-- escrita apenas via RPC (security definer)

create policy sq_read on public.session_questions for select
  using (public.can_see_question(session_id, position));

create policy participants_read on public.participants for select
  using (public.is_host(session_id) or public.is_member(session_id));

create policy answers_host_read on public.answers for select
  using (public.is_host(session_id));
create policy answers_own_read on public.answers for select
  using (
    exists (select 1 from public.participants p where p.id = participant_id and p.user_id = auth.uid())
    and public.can_see_result(session_id, position)
  );

create policy history_read on public.match_history for select using (true);
create policy ranking_read on public.global_ranking for select using (true);

-- ---------- RPC: importar perguntas (atômico) ----------
-- p_items: [{ "text": "...", "options": [{"text":"...","correct":true}, ...] }, ...]
create or replace function public.import_questions(p_topic_name text, p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_topic uuid; v_q uuid; v_o uuid; item jsonb; opt jsonb; i int; n int := 0;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  insert into topics(name, owner_id) values (trim(p_topic_name), auth.uid())
    on conflict (owner_id, name) do update set name = excluded.name
    returning id into v_topic;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into questions(topic_id, owner_id, text)
      values (v_topic, auth.uid(), item ->> 'text') returning id into v_q;
    i := 0;
    for opt in select * from jsonb_array_elements(item -> 'options') loop
      insert into options(question_id, text, position)
        values (v_q, opt ->> 'text', i) returning id into v_o;
      insert into option_keys(option_id, question_id, is_correct)
        values (v_o, v_q, coalesce((opt ->> 'correct')::boolean, false));
      i := i + 1;
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- RPC: criar partida (um ou vários assuntos; sorteia perguntas e embaralha opções) ----------
-- As opções de cada pergunta são embaralhadas aqui, UMA vez por partida (host e jogadores veem a mesma ordem),
-- e uma nova partida sorteia tudo de novo.
-- p_balanced = true: pega o mesmo número de perguntas de cada assunto, quando possível.
create or replace function public.create_session(
  p_topics uuid[], p_count int, p_time int, p_penalty int default 0, p_balanced boolean default false)
returns public.game_sessions language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; v_code text; v_total int; v_label text;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  if p_topics is null or cardinality(p_topics) = 0 then raise exception 'escolha ao menos um assunto'; end if;

  select count(*) into v_total from questions where topic_id = any(p_topics) and owner_id = auth.uid();
  if v_total = 0 then raise exception 'assuntos sem perguntas'; end if;
  select string_agg(name, ' + ' order by name) into v_label
    from topics where id = any(p_topics) and owner_id = auth.uid();

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from game_sessions where code = v_code);
  end loop;

  insert into game_sessions(code, host_id, topic_id, topic_ids, topic_label,
                            time_limit_s, question_count, wrong_penalty)
    values (v_code, auth.uid(), p_topics[1], p_topics, v_label,
            p_time, least(p_count, v_total), p_penalty)
    returning * into v_s;

  insert into session_questions(session_id, position, question_id, payload)
  with pool as (
    select q.id, q.text,
           row_number() over (partition by q.topic_id order by random()) as rn_topic
    from questions q
    where q.topic_id = any(p_topics) and q.owner_id = auth.uid()
  ), picked as (
    select id, text from pool
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

-- ---------- RPC: entrar na partida ----------
create or replace function public.join_session(p_code text, p_nickname text)
returns public.participants language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; v_p participants;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_s from game_sessions where code = upper(trim(p_code));
  if not found then raise exception 'Código inválido'; end if;
  if v_s.status <> 'lobby' then
    select * into v_p from participants where session_id = v_s.id and user_id = auth.uid();
    if found then return v_p; end if;
    raise exception 'A partida já começou';
  end if;
  -- plano gratuito do Supabase: 200 conexões Realtime no projeto todo; teto de 150 por sala
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

-- ---------- RPC: enviar resposta (tempo medido no cliente) ----------
-- Constantes: tolerância de rede para aceitar resposta tardia e limite anti-fraude
-- (ex.: recarregar a página reinicia o cronômetro local; o servidor impede ganho de mais de 2s).
create or replace function public.submit_answer(p_session uuid, p_option uuid, p_elapsed_ms int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s game_sessions; v_p participants; v_q uuid; v_ok boolean; v_limit int;
  v_server_ms int; v_elapsed int; v_pts int; v_ins int;
begin
  select * into v_s from game_sessions where id = p_session;
  if not found or v_s.status <> 'question' then return; end if;
  select * into v_p from participants where session_id = p_session and user_id = auth.uid();
  if not found then raise exception 'not a participant'; end if;

  v_limit := v_s.time_limit_s * 1000;
  v_server_ms := (extract(epoch from (now() - v_s.question_started_at)) * 1000)::int;
  if v_server_ms > v_limit + 3000 then return; end if;            -- tolerância de latência

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

-- ---------- RPC: opção correta (só após fechar a pergunta) ----------
create or replace function public.get_correct_option(p_session uuid, p_pos int)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_q uuid; v_o uuid;
begin
  if not (is_host(p_session) or is_member(p_session)) then return null; end if;
  if not can_see_result(p_session, p_pos) then return null; end if;
  select question_id into v_q from session_questions where session_id = p_session and position = p_pos;
  select k.option_id into v_o from option_keys k where k.question_id = v_q and k.is_correct limit 1;
  return v_o;
end $$;

-- ---------- RPC: máquina de estados do host ----------
-- lobby -> question -> reveal -> question ... -> finished
-- p_from_status / p_from_index evitam avanço duplo (host + timer simultâneos).
create or replace function public.host_advance(p_session uuid, p_from_status text, p_from_index int)
returns void language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; v_topic text;
begin
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

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.game_sessions, public.participants, public.answers;
