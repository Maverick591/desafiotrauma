from __future__ import annotations

import argparse
import json
import os
import sys
import traceback


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m pipeline")
    subcommands = parser.add_subparsers(dest="command", required=True)
    sync = subcommands.add_parser("sync", help="Synchronize Mentimeter presentations")
    sync.add_argument("--mode", choices=("incremental", "backfill", "manual"), required=True)
    sync.add_argument("--presentation-id")
    sync.add_argument("--force-reclassify", action="store_true")
    sync.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        from dotenv import load_dotenv
        load_dotenv(".env.local", override=False)
        load_dotenv(".env", override=False)
        from .ai import AIClassifier
        from .orchestrator import Pipeline
        from .persistence import SupabaseRepository

        repository = SupabaseRepository()
        classifier = AIClassifier(
            budget_usd=float(os.getenv("OPENAI_MONTHLY_BUDGET_USD", "5")),
            initial_spend_usd=repository.monthly_ai_spend(),
            usage_log=os.path.join(os.getenv("PIPELINE_WORKDIR", ".pipeline-data"), "ai_usage.jsonl"),
        ) if os.getenv("OPENAI_API_KEY") else None
        result = Pipeline(repository=repository, classifier=classifier).sync(
            mode=args.mode,
            presentation_id=args.presentation_id,
            force_reclassify=args.force_reclassify,
            dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(f"pipeline failed closed: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1
