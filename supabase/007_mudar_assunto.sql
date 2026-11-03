-- =====================================================================
-- 007 — Mudar o assunto (categoria) de uma pergunta
-- Mover para um assunto existente ou criar um novo na hora. As telas de Desempenho passam a contar a
-- pergunta no novo assunto (inclusive em partidas já jogadas). Execute DEPOIS de 001..006.
-- =====================================================================
create or replace function public.set_question_topic(p_question uuid, p_topic uuid, p_new_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_topic uuid;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from questions where id = p_question and owner_id = auth.uid()) then
    raise exception 'Pergunta não encontrada';
  end if;

  if nullif(trim(coalesce(p_new_name, '')), '') is not null then
    insert into topics(name, owner_id) values (trim(p_new_name), auth.uid())
      on conflict (owner_id, name) do update set name = excluded.name
      returning id into v_topic;
  else
    select id into v_topic from topics where id = p_topic and owner_id = auth.uid();
    if not found then raise exception 'Assunto inválido'; end if;
  end if;

  update questions set topic_id = v_topic where id = p_question;
  return v_topic;
end $$;

revoke execute on function public.set_question_topic(uuid, uuid, text) from anon;
