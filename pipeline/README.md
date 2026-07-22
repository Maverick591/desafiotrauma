# Desafio Trauma data pipeline

Python 3.11+ ETL for authenticated Mentimeter discovery, XLSX/slide-deck ingestion,
analytics, AI classification, Supabase persistence and public/private reports.

```bash
python3 -m pip install -r pipeline/requirements.txt
playwright install chromium
python3 -m pipeline sync --mode incremental
python3 -m pipeline sync --mode backfill
python3 -m pipeline sync --mode manual --presentation-id PRESENTATION_ID
python3 -m pipeline sync --mode manual  # consumes pending manual_imports
```

Required GitHub Actions/production variables: `MENTIMETER_EMAIL`, `MENTIMETER_PASSWORD`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. `OPENAI_API_KEY` enables classification.
For compatibility with the existing local tooling only, `LOGIN_EMAIL` and
`LOGIN_PASSWORD` are accepted when the corresponding `MENTIMETER_*` variable is absent.
The service-role key must be restricted to the backend runner and never exposed to
the dashboard. Optional: `PIPELINE_WORKDIR` and `OPENAI_MONTHLY_BUDGET_USD`
(default US$5). Monthly spend is initialized from `pipeline_runs`; Luna estimates
default to US$1/M input, US$0.10/M cached input and US$6/M output tokens, reserving
the configured maximum output before each classification.

Unknown XLSX schemas, missing credentials, missing `slide_deck` captures, storage
errors, and invalid manual IDs return a non-zero CLI exit code. Reports are immutable,
versioned local and Storage artifacts; the database snapshot pointer only changes
after parsing, report generation, persistence, validation and both uploads succeed.

Raw XLSX/JSON and the private workbook are written to the private
`mentimeter-results` bucket. The public workbook is written to
`dashboard-exports`. Database persistence follows the migration tables
`mentimeter_presentations`, `mentimeter_sessions`, `mentimeter_questions`,
`mentimeter_responses`, `source_files`, `pipeline_runs`, and
`dashboard_snapshots`. Exports use versioned object paths; only a final,
privacy-verified `dashboard_snapshots` row marks a run as published, preserving
the previous last-good snapshot if any earlier step fails.

Incremental ingestion persists only selected presentations, then reloads the full
historical corpus for both workbooks and the dashboard snapshot. Publication calls
the transactional `publish_dashboard_snapshot` RPC as the final operation. Pending
manual imports require the migration fields `presentation_external_id`,
`event_date`, and `presentation_title`.
