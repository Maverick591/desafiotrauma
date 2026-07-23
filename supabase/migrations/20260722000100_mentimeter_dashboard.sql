-- DesafioTrauma: isolated ingestion, review and public-dashboard subsystem.
-- This migration is intentionally repeatable: objects are created conditionally and
-- policies/functions are replaced to converge on the definitions below.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mentimeter_presentation_status') then
    create type public.mentimeter_presentation_status as enum ('draft', 'active', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'mentimeter_session_status') then
    create type public.mentimeter_session_status as enum ('scheduled', 'live', 'closed', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'mentimeter_question_kind') then
    create type public.mentimeter_question_kind as enum ('multiple_choice', 'open_text', 'word_cloud', 'ranking', 'scale');
  end if;
  if not exists (select 1 from pg_type where typname = 'feedback_review_status') then
    create type public.feedback_review_status as enum ('pending', 'in_review', 'approved', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'dashboard_snapshot_status') then
    create type public.dashboard_snapshot_status as enum ('draft', 'published', 'superseded');
  end if;
  if not exists (select 1 from pg_type where typname = 'pipeline_run_status') then
    create type public.pipeline_run_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'manual_import_status') then
    create type public.manual_import_status as enum ('pending', 'validating', 'imported', 'rejected', 'failed');
  end if;
end $$;

create or replace function public.set_audit_timestamps()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by, case when tg_op = 'UPDATE' then old.updated_by else null end);
  return new;
end;
$$;

create table if not exists public.admin_users (
  email text primary key,
  active boolean not null default true,
  user_id uuid unique references auth.users(id) on delete set null,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (email::text = lower(btrim(email::text))),
  check (email::text ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  check (added_by is null or user_id is null or added_by <> user_id)
);

-- The first allowlisted user must be inserted by service_role/database owner.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select nullif(btrim(auth.jwt() ->> 'email'), '') is not null
     and exists (
       select 1
       from public.admin_users admin_user
       where admin_user.email = lower(btrim(auth.jwt() ->> 'email'))
         and admin_user.active
     );
$$;

create table if not exists public.mentimeter_presentations (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  title text not null check (char_length(trim(title)) between 1 and 500),
  status public.mentimeter_presentation_status not null default 'draft',
  source_url text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.mentimeter_sessions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.mentimeter_presentations(id) on delete cascade,
  external_id text not null unique,
  status public.mentimeter_session_status not null default 'scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create table if not exists public.mentimeter_questions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.mentimeter_presentations(id) on delete cascade,
  external_id text not null unique,
  question_order integer not null check (question_order >= 0),
  question_kind public.mentimeter_question_kind not null,
  prompt text not null check (char_length(trim(prompt)) between 1 and 5000),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  is_active boolean not null default true,
  analysis_role text check (analysis_role is null or analysis_role in ('academic', 'profile', 'evaluation', 'nps', 'other')),
  primary_topic text check (primary_topic is null or char_length(btrim(primary_topic)) between 1 and 200),
  subtopic text check (subtopic is null or char_length(btrim(subtopic)) between 1 and 200),
  cognitive_task text check (cognitive_task is null or char_length(btrim(cognitive_task)) between 1 and 200),
  bloom_level text check (bloom_level is null or char_length(btrim(bloom_level)) between 1 and 100),
  predicted_difficulty text check (predicted_difficulty is null or char_length(btrim(predicted_difficulty)) between 1 and 100),
  ai_confidence numeric(5, 4) check (ai_confidence is null or ai_confidence between 0 and 1),
  ai_rationale text check (ai_rationale is null or char_length(ai_rationale) <= 2000),
  ai_status text not null default 'unclassified' check (ai_status in ('unclassified', 'classified', 'pending_budget', 'needs_review', 'reviewed', 'failed')),
  taxonomy_version text check (taxonomy_version is null or char_length(btrim(taxonomy_version)) between 1 and 100),
  needs_review boolean not null default false,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text check (review_notes is null or char_length(review_notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (presentation_id, question_order),
  check (reviewed_by is null or reviewed_at is not null)
);

create table if not exists public.mentimeter_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mentimeter_sessions(id) on delete cascade,
  question_id uuid not null references public.mentimeter_questions(id) on delete cascade,
  external_id text unique,
  respondent_hash text,
  answer jsonb not null check (jsonb_typeof(answer) in ('array', 'boolean', 'number', 'object', 'string')),
  submitted_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (respondent_hash is null or respondent_hash ~ '^[A-Fa-f0-9]{32,128}$')
);

create table if not exists public.source_files (
  id uuid primary key default gen_random_uuid(),
  presentation_external_id text,
  parser_version text not null default '1.0' check (char_length(btrim(parser_version)) between 1 and 100),
  storage_bucket text not null default 'mentimeter-results' check (storage_bucket = 'mentimeter-results'),
  storage_path text not null unique check (storage_path !~ '(^/|/\\.\\.?(/|$))'),
  original_filename text not null check (char_length(trim(original_filename)) between 1 and 1024),
  mime_type text not null check (char_length(trim(mime_type)) between 3 and 255),
  byte_size bigint not null check (byte_size >= 0 and byte_size <= 1073741824),
  sha256 text not null check (sha256 ~ '^[A-Fa-f0-9]{64}$'),
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.source_files add column if not exists presentation_external_id text;
alter table public.source_files add column if not exists parser_version text not null default '1.0';

-- No FK to public.desafio_trauma_feedback: that legacy table is deliberately
-- untouched and may have a different identifier type.  This table only records review state.
create table if not exists public.feedback_reviews (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null unique,
  status public.feedback_review_status not null default 'pending',
  reviewer_id uuid references auth.users(id) on delete set null,
  anonymized_text text check (anonymized_text is null or char_length(btrim(anonymized_text)) between 1 and 20000),
  approved_excerpt text check (approved_excerpt is null or char_length(btrim(approved_excerpt)) between 1 and 5000),
  review_notes text check (review_notes is null or char_length(review_notes) <= 10000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check ((status in ('approved', 'rejected')) = (reviewed_at is not null)),
  check (status <> 'approved' or (anonymized_text is not null and approved_excerpt is not null))
);

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique check (char_length(trim(run_key)) between 1 and 255),
  pipeline_name text not null check (char_length(trim(pipeline_name)) between 1 and 255),
  status public.pipeline_run_status not null default 'queued',
  trigger_source text not null check (char_length(trim(trigger_source)) between 1 and 100),
  started_at timestamptz,
  finished_at timestamptz,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= input_tokens + output_tokens),
  estimated_cost_usd numeric(14, 6) not null default 0 check (estimated_cost_usd >= 0),
  model_name text,
  error_code text,
  error_detail text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

alter table public.pipeline_runs
  add column if not exists cached_input_tokens bigint not null default 0
  check (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens);

create table if not exists public.dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid references public.pipeline_runs(id) on delete set null,
  status public.dashboard_snapshot_status not null default 'draft',
  schema_version text not null check (char_length(trim(schema_version)) between 1 and 100),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  privacy_k integer not null default 5 check (privacy_k >= 5),
  privacy_verified_at timestamptz,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check ((status = 'draft') = (published_at is null)),
  check (status = 'draft' or privacy_verified_at is not null)
);

create table if not exists public.manual_imports (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references public.source_files(id) on delete restrict,
  status public.manual_import_status not null default 'pending',
  import_kind text not null check (char_length(trim(import_kind)) between 1 and 100),
  presentation_external_id text not null check (char_length(btrim(presentation_external_id)) between 1 and 255),
  presentation_title text not null check (char_length(btrim(presentation_title)) between 1 and 500),
  event_date date not null,
  row_count integer check (row_count is null or row_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  error_summary text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (row_count is null or accepted_count + rejected_count <= row_count)
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(trim(action)) between 1 and 255),
  entity_type text not null check (char_length(trim(entity_type)) between 1 and 100),
  entity_id text,
  request_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(request_metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create or replace function public.prevent_admin_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'admin_audit_log is append-only' using errcode = '55000';
  return old;
end;
$$;

create index if not exists mentimeter_sessions_presentation_status_idx on public.mentimeter_sessions (presentation_id, status, started_at desc);
create index if not exists mentimeter_questions_presentation_order_idx on public.mentimeter_questions (presentation_id, question_order);
create index if not exists mentimeter_responses_session_question_idx on public.mentimeter_responses (session_id, question_id, submitted_at desc);
create index if not exists mentimeter_responses_question_submitted_idx on public.mentimeter_responses (question_id, submitted_at desc);
create index if not exists source_files_uploaded_at_idx on public.source_files (uploaded_at desc);
create index if not exists feedback_reviews_status_reviewed_idx on public.feedback_reviews (status, reviewed_at desc nulls last);
create index if not exists pipeline_runs_status_created_idx on public.pipeline_runs (status, created_at desc);
create index if not exists dashboard_snapshots_latest_published_idx on public.dashboard_snapshots (published_at desc) where status = 'published';
create unique index if not exists dashboard_snapshots_pipeline_run_unique_idx on public.dashboard_snapshots (pipeline_run_id) where pipeline_run_id is not null;
create index if not exists manual_imports_status_created_idx on public.manual_imports (status, created_at desc);
create index if not exists manual_imports_pending_event_idx on public.manual_imports (status, event_date, created_at) where status = 'pending';
create index if not exists mentimeter_questions_needs_review_idx on public.mentimeter_questions (needs_review, updated_at desc) where needs_review;
create index if not exists admin_audit_log_actor_occurred_idx on public.admin_audit_log (actor_id, occurred_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'admin_users', 'mentimeter_presentations', 'mentimeter_sessions', 'mentimeter_questions',
    'mentimeter_responses', 'source_files', 'feedback_reviews', 'pipeline_runs',
    'dashboard_snapshots', 'manual_imports', 'admin_audit_log'
  ] loop
    execute format('drop trigger if exists set_audit_timestamps on public.%I', table_name);
    if table_name <> 'admin_audit_log' then
      execute format('create trigger set_audit_timestamps before insert or update on public.%I for each row execute function public.set_audit_timestamps()', table_name);
    end if;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format('drop policy if exists admin_all on public.%I', table_name);
    execute format('drop policy if exists admin_select on public.%I', table_name);
  end loop;
end $$;

-- Allowlisted admins have read-only visibility over operational data. All writes
-- to pipeline-owned tables remain service-role-only; review writes use audited RPCs.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'mentimeter_presentations', 'mentimeter_sessions', 'mentimeter_questions',
    'mentimeter_responses', 'source_files', 'feedback_reviews', 'pipeline_runs',
    'dashboard_snapshots', 'manual_imports', 'admin_audit_log'
  ] loop
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('create policy admin_select on public.%I for select to authenticated using ((select public.is_admin()))', table_name);
  end loop;
end $$;

-- Admin users are managed exclusively by service_role. is_admin() is the only
-- authenticated authorization surface over this allowlist.
drop policy if exists admin_all on public.admin_users;

-- Authenticated admins may enqueue their own source file/import records. A source
-- row may be deleted only by its owner to roll back a failed two-step upload;
-- workers alone advance queue state.
grant insert on table public.source_files, public.manual_imports to authenticated;
grant delete on table public.source_files to authenticated;
drop policy if exists source_files_admin_insert on public.source_files;
create policy source_files_admin_insert on public.source_files
  for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

drop policy if exists source_files_owner_delete on public.source_files;
create policy source_files_owner_delete on public.source_files
  for delete to authenticated
  using ((select public.is_admin()) and created_by = (select auth.uid()));

drop policy if exists manual_imports_admin_insert on public.manual_imports;
create policy manual_imports_admin_insert on public.manual_imports
  for insert to authenticated
  with check (
    (select public.is_admin())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.source_files source_file
      where source_file.id = source_file_id
        and source_file.created_by = (select auth.uid())
    )
  );

drop policy if exists feedback_reviews_admin_select on public.feedback_reviews;
drop policy if exists admin_audit_log_admin_select on public.admin_audit_log;

-- The audit stream is immutable. Authenticated admins may inspect it but only
-- trusted SECURITY DEFINER RPCs and service-role processes may append events.
drop trigger if exists prevent_admin_audit_mutation on public.admin_audit_log;
create trigger prevent_admin_audit_mutation
  before update or delete on public.admin_audit_log
  for each row execute function public.prevent_admin_audit_mutation();
revoke update, delete, truncate on table public.admin_audit_log from service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mentimeter-results', 'mentimeter-results', false, 1073741824, array['application/json', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dashboard-exports', 'dashboard-exports', true, 104857600, array['application/json', 'text/csv', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mentimeter_results_admin_access on storage.objects;
drop policy if exists mentimeter_results_admin_select on storage.objects;
drop policy if exists mentimeter_results_admin_insert on storage.objects;
drop policy if exists mentimeter_results_owner_delete on storage.objects;
create policy mentimeter_results_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'mentimeter-results' and (select public.is_admin()));
create policy mentimeter_results_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'mentimeter-results'
    and (select public.is_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy mentimeter_results_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'mentimeter-results'
    and (select public.is_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists dashboard_exports_admin_write on storage.objects;

create or replace function public.get_public_dashboard_snapshot()
returns table (snapshot_id uuid, published_at timestamptz, schema_version text, snapshot jsonb)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select ds.id, ds.published_at, ds.schema_version, ds.snapshot
  from public.dashboard_snapshots ds
  where ds.status = 'published'
    and ds.published_at is not null
  order by ds.published_at desc, ds.id desc
  limit 1;
$$;

drop function if exists public.review_feedback(uuid, public.feedback_review_status, text);
create or replace function public.review_feedback(
  p_feedback_id uuid,
  p_status public.feedback_review_status,
  p_anonymized_text text default null,
  p_approved_excerpt text default null,
  p_review_notes text default null
)
returns public.feedback_reviews
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare reviewed public.feedback_reviews;
begin
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_status = 'approved' and (
    nullif(btrim(p_anonymized_text), '') is null or
    nullif(btrim(p_approved_excerpt), '') is null
  ) then
    raise exception 'approved feedback requires anonymized text and approved excerpt' using errcode = '22023';
  end if;

  insert into public.feedback_reviews (
    feedback_id, status, reviewer_id, anonymized_text, approved_excerpt, review_notes, reviewed_at
  )
  values (
    p_feedback_id,
    p_status,
    auth.uid(),
    nullif(btrim(p_anonymized_text), ''),
    nullif(btrim(p_approved_excerpt), ''),
    p_review_notes,
    case when p_status in ('approved', 'rejected') then now() else null end
  )
  on conflict (feedback_id) do update
    set status = excluded.status,
        reviewer_id = excluded.reviewer_id,
        anonymized_text = excluded.anonymized_text,
        approved_excerpt = excluded.approved_excerpt,
        review_notes = excluded.review_notes,
        reviewed_at = excluded.reviewed_at
  returning * into reviewed;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, request_metadata)
  values (
    auth.uid(),
    'feedback.reviewed',
    'feedback',
    p_feedback_id::text,
    jsonb_build_object(
      'status', p_status::text,
      'has_anonymized_text', nullif(btrim(p_anonymized_text), '') is not null,
      'has_approved_excerpt', nullif(btrim(p_approved_excerpt), '') is not null
    )
  );

  return reviewed;
end;
$$;

create or replace function public.review_question(
  p_question_id uuid,
  p_primary_topic text,
  p_subtopic text default null,
  p_cognitive_task text default null,
  p_bloom_level text default null,
  p_predicted_difficulty text default null,
  p_review_notes text default null,
  p_analysis_role text default null,
  p_taxonomy_version text default null
)
returns public.mentimeter_questions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare reviewed public.mentimeter_questions;
begin
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if nullif(btrim(p_analysis_role), '') is not null
    and btrim(p_analysis_role) not in ('academic', 'profile', 'evaluation', 'nps', 'other') then
    raise exception 'invalid analysis role' using errcode = '22023';
  end if;
  if nullif(btrim(p_primary_topic), '') is null then
    raise exception 'primary topic is required' using errcode = '22023';
  end if;
  if btrim(p_primary_topic) not in (
    'Atendimento inicial/ABCDE', 'Choque e ressuscitação', 'TCE e coluna', 'Tórax',
    'Abdome e pelve', 'Vascular', 'Extremidades', 'Pediatria', 'Gestante', 'Idoso',
    'Queimaduras', 'Imagem e diagnóstico', 'Procedimentos e técnica operatória',
    'Complicações e UTI', 'Ética, sistemas e prevenção', 'Outros'
  ) then
    raise exception 'invalid primary topic' using errcode = '22023';
  end if;
  if nullif(btrim(p_cognitive_task), '') is not null
    and btrim(p_cognitive_task) not in ('diagnóstico', 'conduta', 'priorização', 'prognóstico', 'anatomia', 'mecanismo', 'outro') then
    raise exception 'invalid cognitive task' using errcode = '22023';
  end if;
  if nullif(btrim(p_bloom_level), '') is not null
    and btrim(p_bloom_level) not in ('lembrar', 'compreender', 'aplicar', 'analisar', 'avaliar', 'criar') then
    raise exception 'invalid Bloom level' using errcode = '22023';
  end if;
  if nullif(btrim(p_predicted_difficulty), '') is not null
    and btrim(p_predicted_difficulty) not in ('very_hard', 'hard', 'medium', 'easy', 'very_easy') then
    raise exception 'invalid predicted difficulty' using errcode = '22023';
  end if;

  update public.mentimeter_questions
  set analysis_role = coalesce(nullif(btrim(p_analysis_role), ''), analysis_role),
      primary_topic = btrim(p_primary_topic),
      subtopic = nullif(btrim(p_subtopic), ''),
      cognitive_task = nullif(btrim(p_cognitive_task), ''),
      bloom_level = nullif(btrim(p_bloom_level), ''),
      predicted_difficulty = nullif(btrim(p_predicted_difficulty), ''),
      taxonomy_version = nullif(btrim(p_taxonomy_version), ''),
      ai_status = 'reviewed',
      needs_review = false,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = nullif(btrim(p_review_notes), '')
  where id = p_question_id
  returning * into reviewed;

  if not found then
    raise exception 'question not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, request_metadata)
  values (
    auth.uid(),
    'question.reviewed',
    'mentimeter_question',
    p_question_id::text,
    jsonb_build_object(
      'analysis_role', reviewed.analysis_role,
      'primary_topic', btrim(p_primary_topic),
      'taxonomy_version', nullif(btrim(p_taxonomy_version), '')
    )
  );

  return reviewed;
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

  -- Vacating the unique order range and restoring it happens inside this transaction.
  update public.mentimeter_questions
  set question_order = question_order + 1000000
  where presentation_id = presentation_database_id;

  for item in select value from jsonb_array_elements(p_questions) as element(value) loop
    insert into public.mentimeter_questions (
      presentation_id, external_id, question_order, question_kind, prompt, options,
      is_active, analysis_role, primary_topic, subtopic, cognitive_task, bloom_level,
      predicted_difficulty, ai_confidence, ai_rationale, ai_status, taxonomy_version, needs_review
    )
    values (
      presentation_database_id, item ->> 'external_id', (item ->> 'question_order')::integer,
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

drop function if exists public.publish_dashboard_snapshot(uuid, text, jsonb, integer, text, jsonb, bigint, bigint, numeric);
drop function if exists public.publish_dashboard_snapshot(uuid, text, jsonb, integer, text, jsonb, bigint, bigint, bigint, numeric);
create or replace function public.publish_dashboard_snapshot(
  p_pipeline_run_id uuid,
  p_schema_version text,
  p_snapshot jsonb,
  p_privacy_k integer,
  p_checksum_sha256 text,
  p_result jsonb,
  p_manual_imports jsonb default '[]'::jsonb,
  p_input_tokens bigint default 0,
  p_cached_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_estimated_cost_usd numeric default 0
)
returns public.dashboard_snapshots
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  published public.dashboard_snapshots;
  manual_item jsonb;
begin
  if p_pipeline_run_id is null then
    raise exception 'pipeline run is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_schema_version), '') is null then
    raise exception 'schema version is required' using errcode = '22023';
  end if;
  if p_snapshot is null or p_result is null or p_manual_imports is null
    or jsonb_typeof(p_snapshot) <> 'object' or jsonb_typeof(p_result) <> 'object'
    or jsonb_typeof(p_manual_imports) <> 'array' then
    raise exception 'snapshot and result must be JSON objects' using errcode = '22023';
  end if;
  if p_privacy_k is null or p_privacy_k < 5 then
    raise exception 'privacy_k must be at least 5' using errcode = '22023';
  end if;
  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[A-Fa-f0-9]{64}$' then
    raise exception 'invalid SHA-256 checksum' using errcode = '22023';
  end if;
  if p_input_tokens is null or p_cached_input_tokens is null or p_output_tokens is null or p_estimated_cost_usd is null
    or p_input_tokens < 0 or p_cached_input_tokens < 0 or p_cached_input_tokens > p_input_tokens
    or p_output_tokens < 0 or p_estimated_cost_usd < 0 then
    raise exception 'usage and cost values cannot be negative' using errcode = '22023';
  end if;

  -- Serialize publication so two workers can never leave two current snapshots.
  perform pg_advisory_xact_lock(hashtextextended('desafio-trauma-dashboard-publication', 0));

  select snapshot_row.* into published
  from public.dashboard_snapshots snapshot_row
  where snapshot_row.pipeline_run_id = p_pipeline_run_id;

  if found then
    if published.checksum_sha256 <> lower(p_checksum_sha256) then
      raise exception 'pipeline run already published a different snapshot' using errcode = '23505';
    end if;
    return published;
  end if;

  if not exists (
    select 1 from public.pipeline_runs pipeline_run
    where pipeline_run.id = p_pipeline_run_id
      and pipeline_run.status in ('queued', 'running')
  ) then
    raise exception 'publishable pipeline run not found' using errcode = 'P0002';
  end if;

  update public.dashboard_snapshots
  set status = 'superseded'
  where status = 'published';

  insert into public.dashboard_snapshots (
    pipeline_run_id, status, schema_version, snapshot, privacy_k,
    privacy_verified_at, checksum_sha256, published_at
  )
  values (
    p_pipeline_run_id, 'published', btrim(p_schema_version), p_snapshot, p_privacy_k,
    now(), lower(p_checksum_sha256), now()
  )
  returning * into published;

  update public.pipeline_runs
  set status = 'succeeded',
      finished_at = now(),
      input_tokens = p_input_tokens,
      cached_input_tokens = p_cached_input_tokens,
      output_tokens = p_output_tokens,
      total_tokens = p_input_tokens + p_output_tokens,
      estimated_cost_usd = p_estimated_cost_usd,
      metadata = p_result,
      error_code = null,
      error_detail = null
  where id = p_pipeline_run_id;

  insert into public.admin_audit_log (action, entity_type, entity_id, request_metadata)
  values (
    'dashboard.snapshot_published',
    'dashboard_snapshot',
    published.id::text,
    jsonb_build_object('pipeline_run_id', p_pipeline_run_id, 'privacy_k', p_privacy_k)
  );

  for manual_item in select value from jsonb_array_elements(p_manual_imports) as element(value) loop
    update public.manual_imports
    set status = 'imported',
        row_count = (manual_item ->> 'row_count')::integer,
        accepted_count = (manual_item ->> 'row_count')::integer,
        rejected_count = 0,
        imported_at = now(),
        error_summary = null
    where id = (manual_item ->> 'id')::uuid
      and status in ('pending', 'validating');
    if not found then
      raise exception 'pending manual import not found' using errcode = 'P0002';
    end if;
  end loop;

  return published;
end;
$$;

revoke all on function public.is_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
revoke all on function public.prevent_admin_audit_mutation() from public;
revoke all on function public.get_public_dashboard_snapshot() from public, anon, authenticated, service_role;
grant execute on function public.get_public_dashboard_snapshot() to anon, authenticated, service_role;
revoke all on function public.review_feedback(uuid, public.feedback_review_status, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.review_feedback(uuid, public.feedback_review_status, text, text, text) to authenticated;
revoke all on function public.review_question(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.review_question(uuid, text, text, text, text, text, text, text, text) to authenticated;
revoke all on function public.replace_mentimeter_presentation(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_mentimeter_presentation(jsonb, jsonb, jsonb, jsonb) to service_role;
revoke all on function public.publish_dashboard_snapshot(uuid, text, jsonb, integer, text, jsonb, jsonb, bigint, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function public.publish_dashboard_snapshot(uuid, text, jsonb, integer, text, jsonb, jsonb, bigint, bigint, bigint, numeric) to service_role;

comment on table public.dashboard_snapshots is 'Only pipeline-produced, aggregate snapshots belong here. Pipeline contract: never include a cell with n < privacy_k (minimum 5).';
comment on function public.get_public_dashboard_snapshot() is 'Public RPC intentionally returns exactly one, latest published aggregate dashboard snapshot.';
comment on function public.review_feedback(uuid, public.feedback_review_status, text, text, text) is 'Admin-only audited review with anonymized and approved text. Does not alter the existing public.desafio_trauma_feedback table.';
comment on function public.review_question(uuid, text, text, text, text, text, text, text, text) is 'Admin-only audited review of question classification. Direct authenticated table updates are denied.';
comment on function public.replace_mentimeter_presentation(jsonb, jsonb, jsonb, jsonb) is 'Service-role-only atomic replacement of one authoritative Mentimeter presentation corpus.';
comment on function public.publish_dashboard_snapshot(uuid, text, jsonb, integer, text, jsonb, jsonb, bigint, bigint, bigint, numeric) is 'Service-role-only atomic publication boundary: supersedes the previous snapshot, completes manual imports and completes the pipeline run.';
