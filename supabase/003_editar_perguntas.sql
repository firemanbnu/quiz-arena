-- Migração 003: editar perguntas (inclusive durante uma competição) e recalcular
-- pontuação da partida, histórico e ranking permanente.
-- Rode DEPOIS do schema.sql e da 002.

-- contador de edições: muda a cada correção e faz host/jogadores relerem pergunta, gabarito e placar
alter table public.game_sessions add column if not exists edit_version int not null default 0;

-- ---------- recálculo de uma partida ----------
-- Reaplica o gabarito vigente a cada resposta, refaz a pontuação na mesma regra do submit_answer
-- (acerto = 1000 × (1 − 0,5 × tempo/limite); erro = −penalidade; placar nunca abaixo de 0)
-- e, se a partida já terminou, corrige o histórico e ajusta o ranking permanente pela diferença.
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
      select user_id, score, correct_count, final_rank from match_history where session_id = p_session
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
     where g.user_id = n.user_id;
  end if;
end $$;

-- uso interno (chamada por edit_question): ninguém chama direto pela API
revoke all on function public.recompute_session(uuid) from public, anon, authenticated;

-- ---------- editar uma pergunta ----------
-- p_options: [{ "id": "<uuid ou ausente p/ nova>", "text": "...", "correct": true|false }, ...]
-- Exatamente 1 correta, mínimo 2 opções. Opção já escolhida por alguém não pode ser removida
-- (só ter o texto alterado). Se a resposta correta mudar, recalcula todas as partidas que usaram
-- a pergunta (em andamento e encerradas), o histórico e o ranking permanente.
create or replace function public.edit_question(
  p_question uuid, p_text text, p_explanation text, p_options jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  q questions; item jsonb; o_id uuid; pos int := 0; v_keep uuid[] := '{}';
  v_old uuid; v_new uuid; s record;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select * into q from questions where id = p_question and owner_id = auth.uid() for update;
  if not found then raise exception 'Pergunta não encontrada'; end if;
  if trim(coalesce(p_text, '')) = '' then raise exception 'O texto da pergunta está vazio'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 then
    raise exception 'A pergunta precisa de pelo menos 2 opções';
  end if;
  if (select count(*) from jsonb_array_elements(p_options) e
       where coalesce((e ->> 'correct')::boolean, false)) <> 1 then
    raise exception 'Marque exatamente 1 opção como correta';
  end if;
  if exists (select 1 from jsonb_array_elements(p_options) e where trim(coalesce(e ->> 'text', '')) = '') then
    raise exception 'Há uma opção sem texto';
  end if;

  select option_id into v_old from option_keys where question_id = p_question and is_correct limit 1;

  for item in select * from jsonb_array_elements(p_options) loop
    if nullif(item ->> 'id', '') is not null then
      o_id := (item ->> 'id')::uuid;
      if not exists (select 1 from options where id = o_id and question_id = p_question) then
        raise exception 'Opção inválida';
      end if;
      v_keep := v_keep || o_id;
    end if;
  end loop;

  if exists (select 1 from options o
              where o.question_id = p_question and o.id <> all (v_keep)
                and exists (select 1 from answers a where a.option_id = o.id)) then
    raise exception 'Uma opção que já foi escolhida em alguma partida não pode ser removida. Altere o texto dela.';
  end if;
  delete from options where question_id = p_question and id <> all (v_keep);

  update questions
     set text = trim(p_text), explanation = nullif(trim(coalesce(p_explanation, '')), '')
   where id = p_question;

  for item in select * from jsonb_array_elements(p_options) loop
    if nullif(item ->> 'id', '') is not null then
      o_id := (item ->> 'id')::uuid;
      update options set text = trim(item ->> 'text'), position = pos where id = o_id;
    else
      insert into options(question_id, text, position)
        values (p_question, trim(item ->> 'text'), pos) returning id into o_id;
    end if;
    insert into option_keys(option_id, question_id, is_correct)
      values (o_id, p_question, coalesce((item ->> 'correct')::boolean, false))
      on conflict (option_id) do update set is_correct = excluded.is_correct;
    if coalesce((item ->> 'correct')::boolean, false) then v_new := o_id; end if;
    pos := pos + 1;
  end loop;

  -- atualiza a cópia da pergunta nas partidas (mantém a ordem embaralhada; novas opções vão ao fim)
  update session_questions sq
     set payload = jsonb_build_object('text', trim(p_text), 'options', coalesce((
           select jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text)
                            order by coalesce(ord.n, 1000 + o.position))
             from options o
             left join (select (e.value ->> 'id')::uuid as id, e.ordinality as n
                          from jsonb_array_elements(sq.payload -> 'options') with ordinality as e(value, ordinality)) ord
                    on ord.id = o.id
            where o.question_id = p_question), '[]'::jsonb))
   where sq.question_id = p_question;

  if v_old is distinct from v_new then
    for s in select distinct session_id from session_questions where question_id = p_question loop
      perform recompute_session(s.session_id);
    end loop;
  end if;

  update game_sessions set edit_version = edit_version + 1
   where id in (select session_id from session_questions where question_id = p_question);
end $$;

-- quantas partidas usaram a pergunta (para avisar antes de mudar a resposta correta)
create or replace function public.question_usage(p_question uuid)
returns table (sessions int, finished int, answers int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from questions where id = p_question and owner_id = auth.uid()) then
    return query select 0, 0, 0; return;
  end if;
  return query
    select count(distinct sq.session_id)::int,
           count(distinct sq.session_id) filter (where g.status = 'finished')::int,
           (select count(*) from answers a
             where a.option_id in (select id from options where question_id = p_question))::int
      from session_questions sq join game_sessions g on g.id = sq.session_id
     where sq.question_id = p_question;
end $$;

grant execute on function public.edit_question(uuid, text, text, jsonb) to authenticated;
grant execute on function public.question_usage(uuid) to authenticated;
revoke execute on function public.edit_question(uuid, text, text, jsonb) from anon;
revoke execute on function public.question_usage(uuid) from anon;
