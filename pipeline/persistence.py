from __future__ import annotations

import hashlib
import json
import os
from urllib.parse import quote
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from .models import Presentation, Question, QuestionKind, Response, Session


class PersistenceError(RuntimeError):
    pass


@dataclass(slots=True)
class SyncState:
    presentation_id: str
    complete: bool
    source_hash: str | None = None


@dataclass(slots=True)
class ManualImport:
    import_id: str
    local_path: Path
    presentation_external_id: str
    event_date: date
    title: str


KIND_MAP = {
    QuestionKind.ACADEMIC: "multiple_choice",
    QuestionKind.PROFILE: "multiple_choice",
    QuestionKind.EVALUATION: "scale",
    QuestionKind.NPS: "scale",
    QuestionKind.OTHER: "open_text",
}


class SupabaseRepository:
    """Adapter for the exact schema in the dashboard Supabase migration."""

    PRIVATE_BUCKET = "mentimeter-results"
    PUBLIC_BUCKET = "dashboard-exports"

    def __init__(self, url: str | None = None, service_role_key: str | None = None):
        url = url or os.getenv("SUPABASE_URL")
        service_role_key = service_role_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not service_role_key:
            raise PersistenceError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        from supabase import create_client
        self.url = url.rstrip("/")
        self.client = create_client(url, service_role_key)
        self.run_id: str | None = None

    def states(self) -> dict[str, SyncState]:
        presentations = self._fetch_all("mentimeter_presentations", "id,external_id,metadata", ("id",))
        sessions = self._fetch_all("mentimeter_sessions", "id,presentation_id,status", ("presentation_id", "id"))
        statuses: dict[str, list[str]] = {}
        for row in sessions:
            statuses.setdefault(row["presentation_id"], []).append(row.get("status"))
        return {
            row["external_id"]: SyncState(
                row["external_id"], bool(statuses.get(row["id"])) and all(status == "closed" for status in statuses[row["id"]]),
                (row.get("metadata") or {}).get("source_hash"),
            )
            for row in presentations
        }

    def _fetch_all(self, table: str, columns: str, order: tuple[str, ...], page_size: int = 1000) -> list[dict[str, Any]]:
        """Read beyond PostgREST's default row cap with stable ordering."""
        rows: list[dict[str, Any]] = []
        start = 0
        while True:
            query = self.client.table(table).select(columns)
            for column in order:
                query = query.order(column)
            page = query.range(start, start + page_size - 1).execute().data or []
            rows.extend(page)
            if len(page) < page_size:
                return rows
            start += page_size

    def begin_run(self, mode: str) -> str:
        run_key = f"mentimeter-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}"
        data = self.client.table("pipeline_runs").insert({
            "run_key": run_key, "pipeline_name": "mentimeter-dashboard", "status": "running",
            "trigger_source": mode, "started_at": datetime.now(timezone.utc).isoformat(),
            "model_name": "gpt-5.6-luna",
        }).execute().data
        self.run_id = data[0]["id"]
        return self.run_id

    def monthly_ai_spend(self) -> float:
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        rows = self.client.table("pipeline_runs").select("estimated_cost_usd").gte("created_at", month_start).execute().data or []
        return sum(float(row.get("estimated_cost_usd") or 0) for row in rows)

    def finish_run(self, status: str, result: dict[str, Any], usage: dict[str, Any] | None = None) -> None:
        if not self.run_id:
            return
        usage = usage or {}
        self.client.table("pipeline_runs").update({
            "status": status, "finished_at": datetime.now(timezone.utc).isoformat(),
            "input_tokens": usage.get("input_tokens", 0), "output_tokens": usage.get("output_tokens", 0),
            "cached_input_tokens": usage.get("cached_input_tokens", 0),
            "total_tokens": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
            "estimated_cost_usd": usage.get("estimated_cost_usd", 0), "metadata": result,
            "error_detail": result.get("error") if status == "failed" else None,
        }).eq("id", self.run_id).in_("status", ["queued", "running"]).execute()

    def persist(self, presentations, sessions, questions, responses) -> None:
        try:
            for item in presentations:
                item_sessions = [value for value in sessions if value.presentation_id == item.presentation_id]
                item_questions = [value for value in questions if value.presentation_id == item.presentation_id]
                session_ids = {value.session_id for value in item_sessions}
                question_ids = {value.question_id for value in item_questions}
                item_responses = [value for value in responses if value.session_id in session_ids and value.question_id in question_ids]
                session_dates = {value.session_id: value.session_date for value in item_sessions}
                question_rows = []
                for order, question in enumerate(item_questions, start=1):
                    payload = question_payload(question, "unused", order)
                    payload.pop("presentation_id", None)
                    question_rows.append(payload)
                self.client.rpc("replace_mentimeter_presentation", {
                    "p_presentation": {
                        "external_id": item.presentation_id, "title": item.title, "status": "active",
                        "source_url": item.href, "metadata": {
                            "session_date": item.session_date.isoformat(), "source_hash": item.source_hash,
                            "captured_at": item.captured_at.isoformat() if item.captured_at else None,
                        },
                    },
                    "p_sessions": [{
                        "external_id": value.session_id, "status": "closed" if value.complete else "live",
                        "started_at": datetime.combine(value.session_date, datetime.min.time(), tzinfo=timezone.utc).isoformat(),
                        "metadata": {"participants": value.participants, "interactive_slides": value.interactive_slides},
                    } for value in item_sessions],
                    "p_questions": question_rows,
                    "p_responses": [{
                        "external_id": value.response_id, "session_external_id": value.session_id,
                        "question_external_id": value.question_id, "respondent_hash": value.participant_id,
                        "answer": {"value": value.value, "is_correct": value.is_correct},
                        "submitted_at": value.submitted_at.isoformat() if value.submitted_at else datetime.combine(session_dates[value.session_id], datetime.min.time(), tzinfo=timezone.utc).isoformat(),
                    } for value in item_responses],
                }).execute()
        except Exception as exc:
            raise PersistenceError(f"Supabase persistence failed: {exc}") from exc

    def load_corpus(self):
        p_rows = self._fetch_all("mentimeter_presentations", "id,external_id,title,source_url,metadata", ("id",))
        s_rows = self._fetch_all("mentimeter_sessions", "id,presentation_id,external_id,status,started_at,metadata", ("presentation_id", "id"))
        q_rows = self._fetch_all("mentimeter_questions", "id,presentation_id,external_id,question_order,slide_index,question_kind,prompt,options,analysis_role,primary_topic,subtopic,cognitive_task,bloom_level,predicted_difficulty,ai_confidence,ai_rationale,ai_status,taxonomy_version,needs_review,reviewed_by,reviewed_at,review_notes", ("presentation_id", "question_order", "id"))
        r_rows = self._fetch_all("mentimeter_responses", "id,external_id,session_id,question_id,respondent_hash,answer,submitted_at", ("session_id", "question_id", "id"))
        p_db = {row["id"]: row["external_id"] for row in p_rows}; s_db = {row["id"]: row["external_id"] for row in s_rows}; q_db = {row["id"]: row["external_id"] for row in q_rows}
        presentations = []
        for row in p_rows:
            meta = row.get("metadata") or {}; event = date.fromisoformat(meta.get("session_date") or "1970-01-01")
            captured = _datetime(meta.get("captured_at"))
            presentations.append(Presentation(row["external_id"], row["title"], event, row.get("source_url") or "", meta.get("source_hash"), captured))
        sessions = []
        for row in s_rows:
            meta = row.get("metadata") or {}; event = _datetime(row.get("started_at")); event_date = event.date() if event else date(1970, 1, 1)
            sessions.append(Session(row["external_id"], p_db[row["presentation_id"]], event_date, int(meta.get("participants") or 0), int(meta.get("interactive_slides") or 0), row.get("status") == "closed"))
        questions = []
        for row in q_rows:
            options = row.get("options") or []; choice_rows = [value for value in options if isinstance(value, dict) and "label" in value]
            kind = QuestionKind(_kind_from_role(row.get("analysis_role"), row.get("question_kind")))
            questions.append(Question(
                row["external_id"], p_db[row["presentation_id"]], int(row["slide_index"]), row["prompt"], kind,
                tuple(str(value["label"]) for value in choice_rows), tuple(index for index, value in enumerate(choice_rows) if value.get("correct")),
                topic=row.get("primary_topic"), analysis_role=row.get("analysis_role"), subtopic=row.get("subtopic"), cognitive_task=row.get("cognitive_task"), bloom=row.get("bloom_level"), predicted_difficulty=row.get("predicted_difficulty"), ai_confidence=row.get("ai_confidence"), ai_rationale=row.get("ai_rationale"), ai_status=row.get("ai_status"), taxonomy_version=row.get("taxonomy_version"), needs_review=bool(row.get("needs_review")), reviewed_by=row.get("reviewed_by"), reviewed_at=_datetime(row.get("reviewed_at")), review_notes=row.get("review_notes"),
            ))
        responses = []
        for row in r_rows:
            answer = row.get("answer") or {}; responses.append(Response(
                row["external_id"], s_db[row["session_id"]], q_db[row["question_id"]], row.get("respondent_hash") or "",
                answer.get("value") if isinstance(answer, dict) else answer,
                answer.get("is_correct") if isinstance(answer, dict) else None, _datetime(row.get("submitted_at")),
            ))
        return presentations, sessions, questions, responses

    def pending_manual_imports(self, destination: Path) -> list[ManualImport]:
        destination.mkdir(parents=True, exist_ok=True)
        rows = self.client.table("manual_imports").select("id,source_file_id,presentation_external_id,event_date,presentation_title,source_files(storage_bucket,storage_path,original_filename)").eq("status", "pending").order("created_at").execute().data or []
        result = []
        for row in rows:
            source = row.get("source_files") or {}; data = self.client.storage.from_(source.get("storage_bucket") or self.PRIVATE_BUCKET).download(source["storage_path"])
            local = destination / f"{row['id']}-{source['original_filename']}"; local.write_bytes(data)
            result.append(ManualImport(row["id"], local, row["presentation_external_id"], date.fromisoformat(row["event_date"]), row["presentation_title"]))
        return result

    def restore_source(self, presentation_external_id: str, destination: Path) -> tuple[Path, dict[str, Any]] | None:
        """Materialize a previously validated raw export from private Storage."""
        rows = self.client.table("source_files").select(
            "storage_bucket,storage_path,mime_type"
        ).eq("presentation_external_id", presentation_external_id).execute().data or []
        xlsx_source = next(
            (row for row in rows if str(row.get("storage_path") or "").endswith(".xlsx")),
            None,
        )
        deck_source = next(
            (row for row in rows if str(row.get("storage_path") or "").endswith(".slide_deck.json")),
            None,
        )
        if not xlsx_source or not deck_source:
            return None
        try:
            destination.mkdir(parents=True, exist_ok=True)
            xlsx_path = destination / f"{presentation_external_id}.xlsx"
            deck_path = destination / f"{presentation_external_id}.slide_deck.json"
            xlsx_path.write_bytes(self.client.storage.from_(
                xlsx_source.get("storage_bucket") or self.PRIVATE_BUCKET
            ).download(xlsx_source["storage_path"]))
            deck_bytes = self.client.storage.from_(
                deck_source.get("storage_bucket") or self.PRIVATE_BUCKET
            ).download(deck_source["storage_path"])
            deck_path.write_bytes(deck_bytes)
            payload = json.loads(deck_bytes.decode("utf-8"))
            deck = payload.get("slide_deck") if isinstance(payload, dict) else None
            if not isinstance(deck, dict):
                return None
            return xlsx_path, deck
        except Exception:
            # Cached sources are an optimization. A corrupt or unavailable
            # cache falls back to a fresh authoritative Mentimeter export.
            return None

    def complete_manual_import(self, import_id: str, row_count: int) -> None:
        self.client.table("manual_imports").update({"status": "imported", "row_count": row_count, "accepted_count": row_count, "imported_at": datetime.now(timezone.utc).isoformat()}).eq("id", import_id).execute()

    def reject_manual_import(self, import_id: str, reason: str) -> None:
        self.client.table("manual_imports").update({
            "status": "rejected", "row_count": 0, "accepted_count": 0,
            "rejected_count": 0, "error_summary": reason[:2000],
        }).eq("id", import_id).in_("status", ["pending", "validating"]).execute()

    def store_source(self, local_path: str | Path, remote_path: str, mime_type: str, presentation_external_id: str | None = None) -> None:
        path = Path(local_path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        self.upload(path, remote_path, bucket=self.PRIVATE_BUCKET, mime_type=mime_type)
        self.client.table("source_files").upsert({
            "storage_bucket": self.PRIVATE_BUCKET, "storage_path": remote_path,
            "original_filename": path.name, "mime_type": mime_type,
            "byte_size": path.stat().st_size, "sha256": digest,
            "presentation_external_id": presentation_external_id, "parser_version": "1.0",
        }, on_conflict="storage_path").execute()

    def upload(self, local_path: str | Path, remote_path: str, bucket: str | None = None, mime_type: str | None = None) -> None:
        bucket = bucket or self.PUBLIC_BUCKET
        try:
            with Path(local_path).open("rb") as handle:
                self.client.storage.from_(bucket).upload(remote_path, handle, {
                    "upsert": "true", "content-type": mime_type or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                })
        except Exception as exc:
            raise PersistenceError(f"Supabase Storage upload failed: {exc}") from exc

    def public_url(self, remote_path: str) -> str:
        return f"{self.url}/storage/v1/object/public/{self.PUBLIC_BUCKET}/{quote(remote_path, safe='/')}"

    def publish_snapshot(self, snapshot_id: str, public_path: str, private_path: str, snapshot: dict[str, Any], result: dict[str, Any], usage: dict[str, Any] | None = None, manual_imports: list[dict[str, Any]] | None = None) -> None:
        """The RPC is the single final transaction: snapshot publish + run success."""
        usage = usage or {}; checksum = hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode()).hexdigest()
        self.client.rpc("publish_dashboard_snapshot", {
            "p_pipeline_run_id": self.run_id, "p_schema_version": "1.2", "p_snapshot": snapshot,
            "p_privacy_k": 5, "p_checksum_sha256": checksum, "p_result": result, "p_manual_imports": manual_imports or [],
            "p_input_tokens": usage.get("input_tokens", 0), "p_cached_input_tokens": usage.get("cached_input_tokens", 0), "p_output_tokens": usage.get("output_tokens", 0),
            "p_estimated_cost_usd": usage.get("estimated_cost_usd", 0),
        }).execute()

    def audit(self, event: str, payload: dict[str, Any]) -> None:
        # pipeline_runs.metadata is the schema's pipeline audit surface.
        return None


class LocalRepository:
    """Explicit local backend for dry runs and reproducible tests."""

    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.state_file = self.root / "state.json"
        self.run_id = "local-run"
        self._corpus = ([], [], [], [])

    def states(self) -> dict[str, SyncState]:
        if not self.state_file.exists():
            return {}
        raw = json.loads(self.state_file.read_text(encoding="utf-8"))
        return {key: SyncState(**value) for key, value in raw.items()}

    def begin_run(self, mode: str) -> str:
        return self.run_id

    def monthly_ai_spend(self) -> float:
        return 0.0

    def load_corpus(self):
        return self._corpus

    def pending_manual_imports(self, destination: Path):
        return []

    def restore_source(self, presentation_external_id: str, destination: Path):
        return None

    def finish_run(self, status: str, result: dict[str, Any], usage: dict[str, Any] | None = None) -> None:
        return None

    def persist(self, presentations, sessions, questions, responses) -> None:
        state = self.states()
        for presentation in presentations:
            complete = any(s.presentation_id == presentation.presentation_id and s.complete for s in sessions)
            state[presentation.presentation_id] = SyncState(presentation.presentation_id, complete, presentation.source_hash)
        temporary = self.state_file.with_suffix(".tmp")
        temporary.write_text(json.dumps({key: asdict(value) for key, value in state.items()}, indent=2), encoding="utf-8")
        temporary.replace(self.state_file)
        old_p, old_s, old_q, old_r = self._corpus
        presentation_ids = {item.presentation_id for item in presentations}; session_ids = {item.session_id for item in sessions}; question_ids = {item.question_id for item in questions}
        self._corpus = (
            [item for item in old_p if item.presentation_id not in presentation_ids] + list(presentations),
            [item for item in old_s if item.presentation_id not in presentation_ids] + list(sessions),
            [item for item in old_q if item.presentation_id not in presentation_ids] + list(questions),
            [item for item in old_r if item.session_id not in session_ids and item.question_id not in question_ids] + list(responses),
        )

    def store_source(self, local_path: str | Path, remote_path: str, mime_type: str, presentation_external_id: str | None = None) -> None:
        return None

    def upload(self, local_path: str | Path, remote_path: str, bucket: str | None = None, mime_type: str | None = None) -> None:
        return None

    def public_url(self, remote_path: str) -> str:
        return f"/storage/v1/object/public/dashboard-exports/{remote_path}"

    def complete_manual_import(self, import_id: str, row_count: int) -> None:
        return None

    def reject_manual_import(self, import_id: str, reason: str) -> None:
        return None

    def publish_snapshot(self, snapshot_id: str, public_path: str, private_path: str, snapshot: dict[str, Any], result: dict[str, Any], usage: dict[str, Any] | None = None, manual_imports: list[dict[str, Any]] | None = None) -> None:
        temporary = self.root / "snapshot.tmp"
        temporary.write_text(json.dumps({"snapshot_id": snapshot_id, "public_path": public_path, "private_path": private_path, "snapshot": snapshot}), encoding="utf-8")
        temporary.replace(self.root / "last_good_snapshot.json")

    def audit(self, event: str, payload: dict[str, Any]) -> None:
        with (self.root / "audit.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"event": event, "payload": payload}, default=str) + "\n")


def _datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _kind_from_db(value: str | None) -> str:
    return {"multiple_choice": "academic", "scale": "evaluation", "open_text": "other", "word_cloud": "other", "ranking": "other"}.get(value or "", "other")


def _kind_from_role(role: str | None, question_kind: str | None) -> str:
    if role in {"academic", "profile", "evaluation", "nps", "other"}:
        return role
    return _kind_from_db(question_kind)


def question_payload(item: Question, presentation_database_id: str, question_order: int) -> dict[str, Any]:
    """Serialize against dedicated migration columns; options remain answer options only."""
    return {
        "external_id": item.question_id, "presentation_id": presentation_database_id,
        "question_order": question_order, "slide_index": item.slide_index, "question_kind": KIND_MAP[item.kind],
        "prompt": item.title,
        "options": [{"label": label, "correct": index in item.correct_indices} for index, label in enumerate(item.choices)],
        "is_active": True, "analysis_role": item.analysis_role or item.kind.value,
        "primary_topic": item.topic, "subtopic": item.subtopic,
        "cognitive_task": item.cognitive_task, "bloom_level": item.bloom,
        "predicted_difficulty": item.predicted_difficulty, "ai_confidence": item.ai_confidence,
        "ai_rationale": item.ai_rationale, "ai_status": item.ai_status or "unclassified",
        "taxonomy_version": item.taxonomy_version, "needs_review": item.needs_review,
    }
