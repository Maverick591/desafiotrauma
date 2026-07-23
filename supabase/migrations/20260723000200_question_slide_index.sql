alter table public.mentimeter_questions
  add column if not exists slide_index integer;

update public.mentimeter_questions
set slide_index = question_order
where slide_index is null;

alter table public.mentimeter_questions
  alter column slide_index set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.mentimeter_questions'::regclass
      and conname = 'mentimeter_questions_slide_index_check'
  ) then
    alter table public.mentimeter_questions
      add constraint mentimeter_questions_slide_index_check check (slide_index >= 0);
  end if;
end;
$$;

create or replace function public.replace_mentimeter_presentation(
  p_presentation jsonb,
  p_sessions jsonb,
  p_questions jsonb,
  p_responses jsonb
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  item jsonb;
  presentation_database_id uuid;
  session_database_id uuid;
  question_database_id uuid;
  current_session_ids text[];
  current_question_ids text[];
  current_response_ids text[];
begin
  if jsonb_typeof(p_presentation) <> 'object'
    or jsonb_typeof(p_sessions) <> 'array'
    or jsonb_typeof(p_questions) <> 'array'
    or jsonb_typeof(p_responses) <> 'array' then
    raise exception 'invalid Mentimeter replacement payload' using errcode = '22023';
  end if;
  if nullif(btrim(p_presentation ->> 'external_id'), '') is null
    or nullif(btrim(p_presentation ->> 'title'), '') is null then
    raise exception 'presentation external ID and title are required' using errcode = '22023';
  end if;

  insert into public.mentimeter_presentations (external_id, title, status, source_url, metadata)
  values (
    p_presentation ->> 'external_id', p_presentation ->> 'title',
    coalesce(p_presentation ->> 'status', 'active')::public.mentimeter_presentation_status,
    p_presentation ->> 'source_url', coalesce(p_presentation -> 'metadata', '{}'::jsonb)
  )
  on conflict (external_id) do update
    set title = excluded.title,
        status = excluded.status,
        source_url = excluded.source_url,
        metadata = excluded.metadata
  returning id into presentation_database_id;

  select coalesce(array_agg(value ->> 'external_id'), array[]::text[])
  into current_session_ids from jsonb_array_elements(p_sessions) as element(value);
  select coalesce(array_agg(value ->> 'external_id'), array[]::text[])
  into current_question_ids from jsonb_array_elements(p_questions) as element(value);
  select coalesce(array_agg(value ->> 'external_id'), array[]::text[])
  into current_response_ids from jsonb_array_elements(p_responses) as element(value);

  for item in select value from jsonb_array_elements(p_sessions) as element(value) loop
    insert into public.mentimeter_sessions (presentation_id, external_id, status, started_at, metadata)
    values (
      presentation_database_id, item ->> 'external_id',
      coalesce(item ->> 'status', 'live')::public.mentimeter_session_status,
      nullif(item ->> 'started_at', '')::timestamptz,
      coalesce(item -> 'metadata', '{}'::jsonb)
    )
    on conflict (external_id) do update
      set presentation_id = excluded.presentation_id,
          status = excluded.status,
          started_at = excluded.started_at,
          metadata = excluded.metadata;
  end loop;

  update public.mentimeter_questions
  set question_order = question_order + 1000000
  where presentation_id = presentation_database_id;

  for item in select value from jsonb_array_elements(p_questions) as element(value) loop
    insert into public.mentimeter_questions (
      presentation_id, external_id, question_order, slide_index, question_kind, prompt, options,
      is_active, analysis_role, primary_topic, subtopic, cognitive_task, bloom_level,
      predicted_difficulty, ai_confidence, ai_rationale, ai_status, taxonomy_version, needs_review
    )
    values (
      presentation_database_id, item ->> 'external_id', (item ->> 'question_order')::integer,
      (item ->> 'slide_index')::integer,
      (item ->> 'question_kind')::public.mentimeter_question_kind, item ->> 'prompt',
      coalesce(item -> 'options', '[]'::jsonb), coalesce((item ->> 'is_active')::boolean, true),
      nullif(item ->> 'analysis_role', ''), nullif(item ->> 'primary_topic', ''),
      nullif(item ->> 'subtopic', ''), nullif(item ->> 'cognitive_task', ''),
      nullif(item ->> 'bloom_level', ''), nullif(item ->> 'predicted_difficulty', ''),
      nullif(item ->> 'ai_confidence', '')::numeric, nullif(item ->> 'ai_rationale', ''),
      coalesce(nullif(item ->> 'ai_status', ''), 'unclassified'),
      nullif(item ->> 'taxonomy_version', ''), coalesce((item ->> 'needs_review')::boolean, false)
    )
    on conflict (external_id) do update
      set presentation_id = excluded.presentation_id,
          question_order = excluded.question_order,
          slide_index = excluded.slide_index,
          question_kind = excluded.question_kind,
          prompt = excluded.prompt,
          options = excluded.options,
          is_active = excluded.is_active,
          analysis_role = excluded.analysis_role,
          primary_topic = excluded.primary_topic,
          subtopic = excluded.subtopic,
          cognitive_task = excluded.cognitive_task,
          bloom_level = excluded.bloom_level,
          predicted_difficulty = excluded.predicted_difficulty,
          ai_confidence = excluded.ai_confidence,
          ai_rationale = excluded.ai_rationale,
          ai_status = excluded.ai_status,
          taxonomy_version = excluded.taxonomy_version,
          needs_review = excluded.needs_review;
  end loop;

  for item in select value from jsonb_array_elements(p_responses) as element(value) loop
    select id into session_database_id
    from public.mentimeter_sessions
    where presentation_id = presentation_database_id
      and external_id = item ->> 'session_external_id';
    select id into question_database_id
    from public.mentimeter_questions
    where presentation_id = presentation_database_id
      and external_id = item ->> 'question_external_id';
    if session_database_id is null or question_database_id is null then
      raise exception 'response references an unknown session or question' using errcode = '23503';
    end if;
    insert into public.mentimeter_responses (
      external_id, session_id, question_id, respondent_hash, answer, submitted_at
    )
    values (
      item ->> 'external_id', session_database_id, question_database_id,
      item ->> 'respondent_hash', item -> 'answer', (item ->> 'submitted_at')::timestamptz
    )
    on conflict (external_id) do update
      set session_id = excluded.session_id,
          question_id = excluded.question_id,
          respondent_hash = excluded.respondent_hash,
          answer = excluded.answer,
          submitted_at = excluded.submitted_at;
  end loop;

  delete from public.mentimeter_responses response
  using public.mentimeter_sessions session
  where response.session_id = session.id
    and session.presentation_id = presentation_database_id
    and not (response.external_id = any(current_response_ids));
  delete from public.mentimeter_questions question
  where question.presentation_id = presentation_database_id
    and not (question.external_id = any(current_question_ids));
  delete from public.mentimeter_sessions session
  where session.presentation_id = presentation_database_id
    and not (session.external_id = any(current_session_ids));
end;
$$;
