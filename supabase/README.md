# Supabase subsystem — DesafioTrauma

This directory contains the isolated database, Storage and Edge Function contract for Mentimeter ingestion and the public dashboard. It does **not** alter or drop the existing `public.desafio_trauma_feedback` table; `feedback_reviews` is a separate, audited review-state ledger.

## Apply order

1. Link the correct Supabase project and run `migrations/20260722000100_mentimeter_dashboard.sql` (`supabase db push` in CI or the Supabase SQL migration workflow).
2. Create or invite the administrator in Supabase Auth first (`shouldCreateUser=false` is enforced by the browser), then bootstrap the same email through a trusted service-role/database-owner session: `insert into public.admin_users (email, active) values (lower(trim('<admin-email>')), true);`. `user_id` is optional audit metadata and is not the authorization key.
3. Set the Edge Function secrets below.
4. Deploy with JWT verification enabled: `supabase functions deploy dispatch-ingestion`.

## Edge Function secrets and request

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — server-side function secrets. Never expose the service-role key in browser code.
- `GITHUB_REPOSITORY` — exact `owner/repo` identifier.
- `GITHUB_WORKFLOW_FILE` — workflow filename or workflow ID, for example `mentimeter-sync.yml`.
- `GITHUB_WORKFLOW_REF` — Git ref containing the workflow, for example `main`.
- `GITHUB_WORKFLOW_TOKEN` — repository-scoped token with only the Actions permission needed to dispatch the workflow.

`dispatch-ingestion` accepts CORS preflight (`OPTIONS`) and authenticated `POST`. It validates the caller with Supabase Auth, normalizes the verified Auth email, checks the active email allowlist, and invokes only GitHub `workflow_dispatch`. The request and GitHub inputs have exactly these keys:

```json
{
  "mode": "incremental",
  "presentation_id": "",
  "force_reclassify": false,
  "dry_run": false
}
```

`mode` is `incremental`, `backfill`, or `manual`. `presentation_id` is optional in every mode; a manual dispatch with an empty value tells the workflow to poll pending `manual_imports`. GitHub credentials are never returned or included in workflow inputs. Each dispatch result is appended to `admin_audit_log`.

## Access model

- Raw Mentimeter inputs, responses and source-file records remain private. `anon` has no raw-table privileges and ordinary authenticated users fail RLS. Active allowlisted administrators have read-only access to operational tables.
- `admin_users` stores normalized lowercase email as its authorization key and an optional `user_id` for audit correlation. The table is service-role-only; authenticated callers only receive the boolean result of `is_admin()`, which matches the signed JWT's verified top-level email claim against `email` and `active`.
- `mentimeter_presentations`, `mentimeter_sessions`, `mentimeter_questions`, `mentimeter_responses`, `pipeline_runs`, and `dashboard_snapshots` are mutable only by `service_role`. Admins update question classification only through the audited `review_question(...)` RPC.
- Authenticated admins may insert their own `source_files` and `manual_imports` records but cannot update queue state. They may delete only a source row they created, solely to roll back a failed upload. Workers using `service_role` process queue state. Each manual import records `presentation_external_id`, `presentation_title`, and `event_date`.
- Direct authenticated writes to `feedback_reviews` are revoked. Admins call `review_feedback(...)`, which stores anonymized text and the approved excerpt and appends an audit event. Approval requires both text fields.
- `admin_audit_log` is append-only: authenticated admins have select-only access and an immutable trigger blocks update/delete. Trusted service-role processes may append events.
- `mentimeter-results` is private. An allowlisted administrator can create signed URLs, upload only below a path prefixed by their Auth user ID, and delete only their own upload during rollback; there is intentionally no SQL signed-URL function.
- `dashboard-exports` is public for download and accepts JSON, CSV, PDF, and XLSX. Only the backend service role writes or deletes published exports.
- `get_public_dashboard_snapshot()` is the sole public database read surface and returns at most the newest published aggregate snapshot.

Example reviewed approval (named RPC arguments are recommended):

```sql
select public.review_feedback(
  p_feedback_id := '<feedback-uuid>',
  p_status := 'approved',
  p_anonymized_text := 'Texto sem identificadores pessoais.',
  p_approved_excerpt := 'Trecho aprovado.',
  p_review_notes := 'Anonimização conferida.'
);
```

Question classification review is also RPC-only:

```sql
select public.review_question(
  p_question_id := '<question-uuid>',
  p_analysis_role := 'academic',
  p_primary_topic := 'Abdome e pelve',
  p_subtopic := 'Lesão esplênica',
  p_cognitive_task := 'Escolher a próxima conduta',
  p_bloom_level := 'apply',
  p_predicted_difficulty := 'medium',
  p_taxonomy_version := '1.0',
  p_review_notes := 'Classificação revisada.'
);
```

## Privacy contract

`dashboard_snapshots` only stores already-aggregated dashboard payloads. The pipeline must suppress every aggregate where `n < 5` before insertion. The database enforces `privacy_k >= 5` and requires a privacy verification timestamp before publication, but cannot infer cell counts inside arbitrary JSON. Never store raw responses in a snapshot.

## Pipeline integration note

`pipeline/persistence.py` maps pipeline model fields into the canonical `mentimeter_*` tables, stores source/private artifacts in `mentimeter-results`, and publishes aggregate XLSX artifacts in `dashboard-exports`. Its last successful persistence action must call service-role-only `publish_dashboard_snapshot(...)`. That single database transaction serializes publication, supersedes the prior published snapshot, inserts the new privacy-verified snapshot, records its audit event, and marks the associated `pipeline_runs` row `succeeded` with result/token/cost data. Failed runs can still be marked directly by the service-role worker. No parallel `pipeline_*` tables are required or created.

## Verification

Run `tests/schema_contract.sql` after the migration in a disposable Supabase database. It checks required RLS tables, restricted DML grants, queue/classification fields, bucket visibility/XLSX support, email allowlist isolation, audit immutability, and all RPC surfaces.
