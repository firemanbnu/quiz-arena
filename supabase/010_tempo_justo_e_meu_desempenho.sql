-- =====================================================================
-- 010 — Tempo justo (medido no aparelho de cada jogador) + Meu desempenho
-- 1) ack_question: o aparelho avisa quando a pergunta apareceu NELE. A janela de resposta de cada jogador
--    conta a partir desse momento, então conexão lenta (pergunta chegando depois) não tira tempo nem pontos.
-- 2) submit_answer: usa o tempo medido no aparelho; o servidor só impede valores impossíveis (menores que o
--    intervalo que ele mesmo viu entre o aviso e a resposta, com 2 s de tolerância). Não descarta mais
--    respostas de quem recebeu a pergunta atrasado.
-- 3) host_question_wait_ms: o host só encerra a pergunta quando a janela pessoal de todos terminou (ou limite
--    de segurança de 5 s depois do tempo).
-- 4) my_perf_*: jogadores veem apenas o próprio desempenho.
-- Execute DEPOIS de 001..009.
-- =====================================================================
create table if not exists public.question_acks (
  session_id     uuid not null references public.game_sessions(id) on delete cascade,
  position       integer not null,
  participant_id uuid not null references public.participants(id) on delete cascade,
  acked_at       timestamptz not null default now(),
  primary key (session_id, position, participant_id)
);
alter table public.question_acks enable row level security;   -- sem políticas: só pelas funções

create or replace function public.ack_question(p_session uuid, p_pos integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_s game_sessions; v_p participants;
begin
  if not public.is_approved() then return; end if;
  select * into v_s from game_sessions where id = p_session;
  if not found or v_s.status <> 'question' or v_s.current_index <> p_pos then return; end if;
  select * into v_p from participants where session_id = p_session and user_id = auth.uid();
  if not found then return; end if;
  insert into question_acks(session_id, position, participant_id) values (p_session, p_pos, v_p.id)
    on conflict do nothing;
end $$;
revoke execute on function public.ack_question(uuid, integer) from anon;

create or replace function public.submit_answer(p_session uuid, p_option uuid, p_elapsed_ms integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_s game_sessions; v_p participants; v_q uuid; v_ok boolean; v_limit int;
  v_server_ms int; v_since int; v_floor int; v_ack timestamptz;
  v_elapsed int; v_pts int; v_ins int;
begin
  if not public.is_approved() then raise exception 'Acesso não autorizado pelo administrador'; end if;
  select * into v_s from game_sessions where id = p_session;
  if not found or v_s.status <> 'question' then return; end if;
  select * into v_p from participants where session_id = p_session and user_id = auth.uid();
  if not found then raise exception 'not a participant'; end if;

  v_limit := v_s.time_limit_s * 1000;
  v_server_ms := (extract(epoch from (now() - v_s.question_started_at)) * 1000)::int;

  select acked_at into v_ack from question_acks
   where session_id = p_session and position = v_s.current_index and participant_id = v_p.id;

  if v_ack is not null then
    -- janela pessoal: começa quando a pergunta apareceu neste aparelho
    v_since := (extract(epoch from (now() - v_ack)) * 1000)::int;
    if v_since > v_limit + 3000 then return; end if;
    v_floor := v_since - 2000;
  else
    -- sem aviso (falha de rede no aviso): confia no aparelho, com limite de segurança
    if v_server_ms > v_limit + 10000 then return; end if;
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
end $$;

-- Quanto falta (ms) para a janela pessoal de TODOS os que ainda não responderam terminar.
create or replace function public.host_question_wait_ms(p_session uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare v_s game_sessions; v_limit int; v_cap numeric; v_wait numeric;
begin
  if not public.is_admin() then raise exception 'not host'; end if;
  select * into v_s from game_sessions where id = p_session and host_id = auth.uid();
  if not found or v_s.status <> 'question' then return 0; end if;
  v_limit := v_s.time_limit_s * 1000;
  -- limite de segurança: 5 s depois do tempo, contado do início no servidor
  v_cap := v_limit + 5000 - extract(epoch from (now() - v_s.question_started_at)) * 1000;
  select coalesce(max(
           case when k.acked_at is not null
                then v_limit + 1500 - extract(epoch from (now() - k.acked_at)) * 1000
                else v_cap end), 0)
    into v_wait
    from participants p
    left join question_acks k on k.session_id = p_session and k.position = v_s.current_index and k.participant_id = p.id
   where p.session_id = p_session
     and not exists (select 1 from answers a where a.session_id = p_session and a.position = v_s.current_index and a.participant_id = p.id);
  return greatest(0, least(v_wait, v_cap))::int;
end $$;
revoke execute on function public.host_question_wait_ms(uuid) from anon;

-- ---------------- Meu desempenho (cada jogador vê só o seu) ----------------
create or replace function public.my_perf_base()
returns table(session_id uuid, played_at timestamptz, pos integer, question_id uuid, topic_id uuid, topic_name text, option_id uuid, is_correct boolean)
language sql stable security definer set search_path = public as $$
  select g.id, coalesce(g.finished_at, g.created_at), sq.position, sq.question_id,
         q.topic_id, coalesce(t.name, 'Sem assunto'), a.option_id, a.is_correct
    from game_sessions g
    join session_questions sq on sq.session_id = g.id
    join participants p on p.session_id = g.id and p.user_id = auth.uid()
    left join questions q on q.id = sq.question_id
    left join topics t on t.id = q.topic_id
    left join answers a on a.session_id = g.id and a.position = sq.position and a.participant_id = p.id
   where public.is_approved() and g.status = 'finished'
$$;
revoke execute on function public.my_perf_base() from public, anon, authenticated;

create or replace function public.my_perf_summary()
returns table(games integer, asked integer, correct integer, wrong integer, unanswered integer, pct numeric)
language sql stable security definer set search_path = public as $$
  select count(distinct b.session_id)::int, count(*)::int,
         (count(*) filter (where b.is_correct))::int,
         (count(*) filter (where b.is_correct is false))::int,
         (count(*) filter (where b.is_correct is null))::int,
         coalesce(round(100.0 * count(*) filter (where b.is_correct) / nullif(count(*), 0), 1), 0)
    from public.my_perf_base() b
$$;

create or replace function public.my_perf_by_topic()
returns table(topic_id uuid, topic_name text, asked integer, correct integer, wrong integer, unanswered integer, pct numeric)
language sql stable security definer set search_path = public as $$
  select b.topic_id, b.topic_name, count(*)::int,
         (count(*) filter (where b.is_correct))::int,
         (count(*) filter (where b.is_correct is false))::int,
         (count(*) filter (where b.is_correct is null))::int,
         round(100.0 * count(*) filter (where b.is_correct) / count(*), 1)
    from public.my_perf_base() b
   group by b.topic_id, b.topic_name
   order by 7 asc, 3 desc
$$;

create or replace function public.my_perf_wrong()
returns table(session_id uuid, played_at timestamptz, pos integer, topic_name text, question_id uuid, question_text text, chosen_text text, correct_text text, explanation text, status text)
language sql stable security definer set search_path = public as $$
  select b.session_id, b.played_at, b.pos, b.topic_name, b.question_id,
         coalesce(q.text, sq.payload ->> 'text'),
         (select o.text from options o where o.id = b.option_id),
         (select o.text from option_keys k join options o on o.id = k.option_id
           where k.question_id = b.question_id and k.is_correct limit 1),
         q.explanation,
         case when b.is_correct is null then 'unanswered' else 'wrong' end
    from public.my_perf_base() b
    join session_questions sq on sq.session_id = b.session_id and sq.position = b.pos
    left join questions q on q.id = b.question_id
   where b.is_correct is not true
   order by b.played_at desc, b.pos
   limit 500
$$;

revoke execute on function public.my_perf_summary(), public.my_perf_by_topic(), public.my_perf_wrong() from anon;
