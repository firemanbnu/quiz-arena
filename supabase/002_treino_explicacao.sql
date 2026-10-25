-- Migração 002: explicação por pergunta, modo Treino e explicação na revelação.
-- Rode DEPOIS do schema.sql.

alter table public.questions add column if not exists explanation text;
alter table public.topics add column if not exists training_enabled boolean not null default true;

-- importar perguntas (agora com explicação opcional)
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
    insert into questions(topic_id, owner_id, text, explanation)
      values (v_topic, auth.uid(), item ->> 'text', nullif(trim(item ->> 'explanation'), ''))
      returning id into v_q;
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

-- explicação da pergunta, liberada só depois que ela fecha (host e jogadores da sala)
create or replace function public.get_question_explanation(p_session uuid, p_pos int)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_q uuid; v_e text;
begin
  if not (is_host(p_session) or is_member(p_session)) then return null; end if;
  if not can_see_result(p_session, p_pos) then return null; end if;
  select question_id into v_q from session_questions where session_id = p_session and position = p_pos;
  select explanation into v_e from questions where id = v_q;
  return v_e;
end $$;

-- ---------- TREINO INDIVIDUAL (não grava nada; não precisa de login) ----------
-- Só entram assuntos com training_enabled = true.
create or replace function public.training_topics()
returns table (id uuid, name text, question_count bigint)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, count(q.id)
  from topics t join questions q on q.topic_id = t.id
  where t.training_enabled
  group by t.id, t.name
  order by t.name
$$;

create or replace function public.training_questions(
  p_topics uuid[], p_count int, p_balanced boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  with pool as (
    select q.id, q.text,
           row_number() over (partition by q.topic_id order by random()) as rn_topic
    from questions q join topics t on t.id = q.topic_id
    where t.training_enabled and q.topic_id = any(p_topics)
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

grant execute on function public.training_topics() to anon, authenticated;
grant execute on function public.training_questions(uuid[], int, boolean) to anon, authenticated;
grant execute on function public.training_check(uuid, uuid) to anon, authenticated;
