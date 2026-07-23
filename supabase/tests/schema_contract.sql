-- Run after 20260722000100_mentimeter_dashboard.sql in a disposable Supabase database.
-- This is intentionally read-only and checks the structural security contract.

do $$
declare
  required_table text;
  operational_table text;
  service_mutated_table text;
  required_column text;
  required_tables text[] := array[
    'mentimeter_presentations', 'mentimeter_sessions', 'mentimeter_questions',
    'mentimeter_responses', 'source_files', 'feedback_reviews', 'dashboard_snapshots',
    'pipeline_runs', 'manual_imports', 'admin_users', 'admin_audit_log'
  ];
begin
  foreach required_table in array required_tables loop
    if not exists (
      select 1 from pg_tables
      where schemaname = 'public' and tablename = required_table and rowsecurity
    ) then
      raise exception 'missing RLS-protected table: %', required_table;
    end if;
  end loop;

  if not exists (
    select 1 from storage.buckets where id = 'mentimeter-results' and public = false
  ) then
    raise exception 'mentimeter-results must be private';
  end if;
  if not exists (
    select 1 from storage.buckets where id = 'dashboard-exports' and public = true
  ) then
    raise exception 'dashboard-exports must be public';
  end if;
  if not exists (
    select 1
    from storage.buckets
    where id = 'dashboard-exports'
      and 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = any(allowed_mime_types)
  ) then
    raise exception 'dashboard-exports must accept XLSX';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_users'
      and column_name = 'email' and data_type = 'text'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_users'
      and column_name = 'active' and data_type = 'boolean'
  ) then
    raise exception 'admin_users must use normalized email and active allowlist fields';
  end if;

  foreach required_column in array array[
    'analysis_role', 'primary_topic', 'subtopic', 'cognitive_task', 'bloom_level',
    'predicted_difficulty', 'ai_confidence', 'ai_rationale', 'ai_status',
    'taxonomy_version', 'needs_review', 'reviewed_by', 'reviewed_at', 'review_notes'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'mentimeter_questions'
        and column_name = required_column
    ) then
      raise exception 'missing mentimeter_questions classification column: %', required_column;
    end if;
  end loop;

  foreach required_column in array array[
    'presentation_external_id', 'presentation_title', 'event_date'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'manual_imports'
        and column_name = required_column and is_nullable = 'NO'
    ) then
      raise exception 'missing required manual_imports queue column: %', required_column;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pipeline_runs'
      and column_name = 'cached_input_tokens' and is_nullable = 'NO'
  ) then
    raise exception 'pipeline_runs must track cached input tokens';
  end if;
  foreach required_column in array array['presentation_external_id', 'parser_version'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'source_files' and column_name = required_column
    ) then
      raise exception 'missing source_files provenance column: %', required_column;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.admin_users', 'SELECT')
    or has_table_privilege('authenticated', 'public.admin_users', 'INSERT')
    or has_table_privilege('authenticated', 'public.admin_users', 'UPDATE')
    or has_table_privilege('authenticated', 'public.admin_users', 'DELETE') then
    raise exception 'admin_users must be service-role-only';
  end if;

  foreach operational_table in array array[
    'mentimeter_presentations', 'mentimeter_sessions', 'mentimeter_questions',
    'mentimeter_responses', 'source_files', 'feedback_reviews', 'pipeline_runs',
    'dashboard_snapshots', 'manual_imports', 'admin_audit_log'
  ] loop
    if not has_table_privilege('authenticated', format('public.%I', operational_table), 'SELECT') then
      raise exception 'authenticated admin read surface missing for: %', operational_table;
    end if;
  end loop;

  foreach service_mutated_table in array array[
    'mentimeter_presentations', 'mentimeter_sessions', 'mentimeter_questions',
    'mentimeter_responses', 'pipeline_runs', 'dashboard_snapshots'
  ] loop
    if has_table_privilege('authenticated', format('public.%I', service_mutated_table), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', service_mutated_table), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', service_mutated_table), 'DELETE') then
      raise exception 'pipeline table must be service-role-write-only: %', service_mutated_table;
    end if;
  end loop;

  if not has_table_privilege('authenticated', 'public.source_files', 'INSERT')
    or not has_table_privilege('authenticated', 'public.manual_imports', 'INSERT') then
    raise exception 'authenticated admins need insert access to their own import queue records';
  end if;
  if not has_table_privilege('authenticated', 'public.source_files', 'DELETE') then
    raise exception 'authenticated source-file owner cleanup grant missing';
  end if;
  if has_table_privilege('authenticated', 'public.source_files', 'UPDATE')
    or has_table_privilege('authenticated', 'public.manual_imports', 'UPDATE')
    or has_table_privilege('authenticated', 'public.manual_imports', 'DELETE') then
    raise exception 'authenticated import queue records must not be mutable';
  end if;
  if has_table_privilege('authenticated', 'public.feedback_reviews', 'INSERT')
    or has_table_privilege('authenticated', 'public.feedback_reviews', 'UPDATE')
    or has_table_privilege('authenticated', 'public.feedback_reviews', 'DELETE') then
    raise exception 'authenticated must review feedback only through RPC';
  end if;
  if has_table_privilege('authenticated', 'public.admin_audit_log', 'INSERT')
    or has_table_privilege('authenticated', 'public.admin_audit_log', 'UPDATE')
    or has_table_privilege('authenticated', 'public.admin_audit_log', 'DELETE') then
    raise exception 'authenticated audit access must be read-only';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.admin_audit_log'::regclass
      and tgname = 'prevent_admin_audit_mutation'
      and not tgisinternal
  ) then
    raise exception 'admin audit log must have its immutable trigger';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_public_dashboard_snapshot'
  ) then
    raise exception 'missing public dashboard RPC';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.review_question(uuid,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must be able to execute review_question';
  end if;
  if has_function_privilege('anon', 'public.is_admin()', 'EXECUTE')
    or has_function_privilege(
      'anon',
      'public.review_feedback(uuid,public.feedback_review_status,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.review_question(uuid,text,text,text,text,text,text,text,text)',
      'EXECUTE'
    ) then
    raise exception 'anonymous callers must not execute administrative RPCs';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.publish_dashboard_snapshot(uuid,text,jsonb,integer,text,jsonb,jsonb,bigint,bigint,bigint,numeric)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.publish_dashboard_snapshot(uuid,text,jsonb,integer,text,jsonb,jsonb,bigint,bigint,bigint,numeric)',
    'EXECUTE'
  ) then
    raise exception 'publish_dashboard_snapshot must be service-role-only';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.replace_mentimeter_presentation(jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.replace_mentimeter_presentation(jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'replace_mentimeter_presentation must be service-role-only';
  end if;
end $$;

-- The result is zero or one aggregate row. It must never expose raw source tables.
select * from public.get_public_dashboard_snapshot();
