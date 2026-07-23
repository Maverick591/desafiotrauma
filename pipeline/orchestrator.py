from __future__ import annotations

import json
import os
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from .ids import content_hash, stable_id
from .mentimeter import MentimeterClient, PresentationRef, select_presentations
from .metrics import difficulty_band, ineffective_distractors, nps, point_biserial, rolling_average, wilson_interval
from .models import Presentation, Question, QuestionKind, Response, Session
from .parser import EmptyPresentationError, UnknownSchemaError, parse_workbook
from .persistence import SupabaseRepository
from .privacy import privacy_safe_corpus, valid_response_count
from .reports import write_report


class SnapshotManager:
    def __init__(self, root: str | Path):
        self.root = Path(root); self.root.mkdir(parents=True, exist_ok=True)

    def publish(self, payload: dict[str, Any], validate: Callable[[dict[str, Any]], None] | None = None) -> Path:
        candidate = self.root / "candidate.json"
        candidate.write_text(json.dumps(payload, ensure_ascii=False, default=str), encoding="utf-8")
        if validate: validate(payload)
        target = self.root / "last_good.json"; candidate.replace(target); return target


def questions_from_deck(deck: dict[str, Any], presentation_id: str) -> list[Question]:
    questions: list[Question] = []
    for slide_index, slide in enumerate(deck.get("slides") or [], start=1):
        slide_type = str((slide.get("static_content") or {}).get("type") or "")
        for content in slide.get("interactive_contents") or []:
            title = str(content.get("title") or slide.get("title") or "").strip()
            if not title: continue
            choices = tuple(str(choice.get("title") or "").strip() for choice in content.get("choices") or [])
            correct = tuple(index for index, choice in enumerate(content.get("choices") or []) if choice.get("marked_correct"))
            lower = f"{slide_type} {title}".casefold()
            if "participante" in lower or "profile" in lower: kind = QuestionKind.PROFILE
            elif "nps" in lower or "recomend" in lower: kind = QuestionKind.NPS
            elif correct or "quiz" in lower: kind = QuestionKind.ACADEMIC
            elif any(token in lower for token in ("avali", "scale", "rating")): kind = QuestionKind.EVALUATION
            else: kind = QuestionKind.OTHER
            questions.append(Question(stable_id("question", presentation_id, slide_index, title), presentation_id, slide_index, title, kind, choices, correct))
    return questions


def session_date_from_responses(responses: list[Response], fallback: date) -> date:
    dates = [response.submitted_at.date() for response in responses if response.submitted_at is not None]
    return min(dates) if dates else fallback


class Pipeline:
    def __init__(self, client=None, repository=None, classifier=None, workdir: str | Path | None = None):
        self.client = client or MentimeterClient(); self.repository = repository or SupabaseRepository()
        self.classifier = classifier; self.workdir = Path(workdir or os.getenv("PIPELINE_WORKDIR", ".pipeline-data"))
        self.workdir.mkdir(parents=True, exist_ok=True)

    def sync(self, mode: str, presentation_id: str | None = None, force_reclassify: bool = False, dry_run: bool = False) -> dict[str, Any]:
        if mode == "manual" and not presentation_id:
            pending = self.repository.pending_manual_imports(self.workdir / "manual")
            if not pending: raise RuntimeError("No pending manual_imports")
            if dry_run: return {"mode": mode, "selected": len(pending), "manual_import_ids": [item.import_id for item in pending], "dry_run": True}
            selected: list[Any] = pending
        else:
            refs = self.client.discover()
            if not refs: raise RuntimeError("No presentations discovered; refusing to replace last-good corpus")
            states = self.repository.states()
            refs = [PresentationRef(r.presentation_id, r.title, r.href, states.get(r.presentation_id).complete if r.presentation_id in states else False) for r in refs]
            selected = select_presentations(refs, mode, set(states), presentation_id)
            if dry_run: return {"mode": mode, "selected": len(selected), "presentation_ids": [r.presentation_id for r in selected], "dry_run": True}
        self.repository.begin_run(mode)
        try:
            return self._execute(selected, mode, force_reclassify)
        except Exception as exc:
            self.repository.finish_run("failed", {"mode": mode, "error": str(exc)[:2000]}, self.classifier.usage_summary if self.classifier else None)
            raise

    def _execute(self, selected, mode: str, force_reclassify: bool) -> dict[str, Any]:
        existing_corpus = self.repository.load_corpus()
        existing_questions = {q.question_id: q for q in existing_corpus[2]}
        presentations: list[Presentation] = []; sessions: list[Session] = []
        questions: list[Question] = []; responses: list[Response] = []
        accepted_manual_import_ids: set[str] = set()
        for item in selected:
            if hasattr(item, "local_path"):
                ref = PresentationRef(item.presentation_external_id, item.title, f"manual:{item.import_id}")
                xlsx_path, deck = Path(item.local_path), {"name": item.title, "slides": []}
            else:
                ref = item
                cached = self.repository.restore_source(ref.presentation_id, self.workdir / "raw") if mode == "backfill" else None
                if cached:
                    xlsx_path, deck = cached
                else:
                    xlsx_path, deck = self.client.fetch(ref, self.workdir / "raw")
                    deck_path = self.workdir / "raw" / f"{ref.presentation_id}.slide_deck.json"
                    self.repository.store_source(xlsx_path, f"raw/{ref.presentation_id}/{xlsx_path.name}", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ref.presentation_id)
                    self.repository.store_source(deck_path, f"raw/{ref.presentation_id}/{deck_path.name}", "application/json", ref.presentation_id)
            try:
                parsed_questions, parsed_responses = parse_workbook(xlsx_path, ref.presentation_id)
            except EmptyPresentationError:
                # Empty copies are expected in Mentimeter and must not poison the run.
                if hasattr(item, "import_id"):
                    self.repository.reject_manual_import(
                        item.import_id,
                        "Arquivo reconhecido, mas sem respostas válidas para importação.",
                    )
                continue
            except UnknownSchemaError:
                if not hasattr(item, "import_id"):
                    raise
                self.repository.reject_manual_import(
                    item.import_id,
                    "Estrutura XLSX não reconhecida. Exporte novamente os resultados completos do Mentimeter.",
                )
                continue
            if hasattr(item, "import_id"):
                accepted_manual_import_ids.add(item.import_id)
            deck_questions = {q.question_id: q for q in questions_from_deck(deck, ref.presentation_id)}
            deck_by_title: dict[str, list[Question]] = defaultdict(list)
            for deck_question in deck_questions.values(): deck_by_title[" ".join(deck_question.title.split()).casefold()].append(deck_question)
            enriched = []
            for question in parsed_questions:
                deck_question = deck_questions.get(question.question_id)
                if deck_question is None:
                    candidates = deck_by_title.get(" ".join(question.title.split()).casefold(), [])
                    deck_question = candidates[0] if len(candidates) == 1 else None
                enriched.append(replace(question, kind=deck_question.kind, choices=deck_question.choices, correct_indices=deck_question.correct_indices) if deck_question else question)
            enriched = self._classify_many(enriched, force_reclassify, existing_questions)
            parsed_responses = responses_with_answer_keys(enriched, parsed_responses)
            interactive_slides = len({q.slide_index for q in enriched})
            event_date = getattr(item, "event_date", None) or ref.session_date
            now = datetime.now(timezone.utc)
            presentations.append(Presentation(ref.presentation_id, ref.title, event_date, ref.href, content_hash(deck), now))
            for session_id in sorted({response.session_id for response in parsed_responses}):
                session_responses = [response for response in parsed_responses if response.session_id == session_id]
                participants = len({response.participant_id for response in session_responses})
                session_date = session_date_from_responses(session_responses, event_date)
                complete = bool(session_responses and enriched and participants and interactive_slides and session_date < now.date())
                sessions.append(Session(session_id, ref.presentation_id, session_date, participants, interactive_slides, complete))
            questions.extend(enriched); responses.extend(parsed_responses)
        if mode == "manual" and not presentations:
            raise RuntimeError("No valid manual imports; empty files were rejected")
        self.repository.persist(presentations, sessions, questions, responses)

        # Reports and public snapshot always use the complete corpus after applying the delta.
        full_presentations, full_sessions, full_questions, full_responses = self.repository.load_corpus()
        full_presentations, full_sessions, full_questions, full_responses = published_corpus(
            full_presentations, full_sessions, full_questions, full_responses
        )
        if not full_presentations:
            raise RuntimeError("No complete presentation corpus available; refusing to publish a partial snapshot")
        snapshot_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        report_dir = self.workdir / "reports" / snapshot_id
        public = write_report(report_dir / "public.xlsx", full_presentations, full_sessions, full_questions, full_responses, public=True)
        private = write_report(report_dir / "private.xlsx", full_presentations, full_sessions, full_questions, full_responses, public=False)
        public_remote = f"snapshots/{snapshot_id}/public.xlsx"; private_remote = f"snapshots/{snapshot_id}/private.xlsx"
        self.repository.upload(public, public_remote, bucket="dashboard-exports")
        self.repository.store_source(private, private_remote, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        snapshot = build_public_snapshot(full_presentations, full_sessions, full_questions, full_responses, public_files=[{
            "name": "Base pública XLSX", "description": "Resultados agregados e dicionário de métricas.",
            "url": self.repository.public_url(public_remote),
        }])
        validate_public_snapshot(snapshot)
        manual_results = []
        for item in selected:
            if hasattr(item, "import_id") and item.import_id in accepted_manual_import_ids:
                imported_question_ids = {q.question_id for q in questions if q.presentation_id == item.presentation_external_id}
                manual_results.append({"id": item.import_id, "row_count": sum(r.question_id in imported_question_ids for r in responses)})
        result = {"mode": mode, "selected": len(selected), "presentations": len(presentations), "sessions": len(sessions), "questions": len(questions), "responses": len(responses), "corpus_presentations": len(full_presentations), "artifacts": {"public": public_remote, "private": private_remote}, "dry_run": False}
        if self.classifier: result["ai"] = self.classifier.usage_summary
        # RPC publishes the snapshot and marks pipeline_runs succeeded atomically. Nothing follows it.
        self.repository.publish_snapshot(snapshot_id, public_remote, private_remote, snapshot, result, self.classifier.usage_summary if self.classifier else None, manual_results)
        return result

    def _classify(self, question: Question, force: bool, existing: Question | None) -> Question:
        if question.kind != QuestionKind.ACADEMIC: return question
        if existing and (not self.classifier or (existing.ai_confidence is not None and existing.ai_status not in {"pending_budget", "failed", "unclassified"} and not force)):
            return replace(question, topic=existing.topic, analysis_role=QuestionKind.ACADEMIC.value, subtopic=existing.subtopic, cognitive_task=existing.cognitive_task, bloom=existing.bloom, predicted_difficulty=existing.predicted_difficulty, ai_confidence=existing.ai_confidence, ai_rationale=existing.ai_rationale, ai_status=existing.ai_status, taxonomy_version=existing.taxonomy_version, needs_review=existing.needs_review, reviewed_by=existing.reviewed_by, reviewed_at=existing.reviewed_at, review_notes=existing.review_notes)
        if not self.classifier:
            return question
        result = self.classifier.classify(question.title, question.choices)
        return self._classified_question(question, result)

    @staticmethod
    def _classified_question(question: Question, result) -> Question:
        return replace(question, topic=result.primary_topic, analysis_role=QuestionKind.ACADEMIC.value, subtopic=result.subtopic, cognitive_task=result.cognitive_task, bloom=result.bloom, predicted_difficulty=result.predicted_difficulty, ai_confidence=result.confidence, ai_rationale=result.rationale, ai_status=result.status, taxonomy_version="desafio-trauma-v1", needs_review=result.needs_review)

    def _classify_many(
        self,
        questions: list[Question],
        force: bool,
        existing_questions: dict[str, Question],
    ) -> list[Question]:
        classified: list[Question | None] = [None] * len(questions)
        pending: list[tuple[int, Question]] = []
        for index, question in enumerate(questions):
            existing = existing_questions.get(question.question_id)
            reusable = existing and (
                not self.classifier or (
                    existing.ai_confidence is not None
                    and existing.ai_status not in {"pending_budget", "failed", "unclassified"}
                    and not force
                )
            )
            if question.kind == QuestionKind.ACADEMIC and self.classifier and not reusable:
                pending.append((index, question))
            else:
                classified[index] = self._classify(question, force, existing)
        if pending:
            requests = [(question.title, question.choices) for _, question in pending]
            if hasattr(self.classifier, "classify_batch"):
                results = self.classifier.classify_batch(requests)
            else:
                results = [self.classifier.classify(title, choices) for title, choices in requests]
            if len(results) != len(pending):
                raise RuntimeError("AI classifier returned an unexpected number of results")
            for (index, question), result in zip(pending, results, strict=True):
                classified[index] = self._classified_question(question, result)
        if any(question is None for question in classified):
            raise RuntimeError("Question classification left an unresolved item")
        return [question for question in classified if question is not None]


def _percent(numerator: float, denominator: float) -> float | None:
    return round(100 * numerator / denominator, 1) if denominator else None


_MONTH_NAMES = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")


def _month_key(value: date) -> str:
    return value.strftime("%Y-%m")


def _month_label(value: str) -> str:
    year, month = value.split("-")
    return f"{_MONTH_NAMES[int(month) - 1]}/{year[2:]}"


def _normalized_label(value: str) -> str:
    compact = " ".join(value.split()).casefold()
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", compact)
        if not unicodedata.combining(character)
    )


def _criterion_key(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", _normalized_label(value)).strip("_")
    return normalized[:42] or "criterio"


def published_corpus(presentations, sessions, questions, responses):
    """Exclude open/partial sessions from every public and exported artifact."""
    published_sessions = [session for session in sessions if session.complete]
    session_ids = {session.session_id for session in published_sessions}
    published_responses = [response for response in responses if response.session_id in session_ids]
    question_ids = {response.question_id for response in published_responses}
    published_questions = [question for question in questions if question.question_id in question_ids]
    presentation_ids = {session.presentation_id for session in published_sessions}
    published_presentations = [presentation for presentation in presentations if presentation.presentation_id in presentation_ids]
    return published_presentations, published_sessions, published_questions, published_responses


def responses_with_answer_keys(questions: list[Question], responses: list[Response]) -> list[Response]:
    """Derive matrix-export correctness from authoritative slide-deck answer keys."""
    by_id = {question.question_id: question for question in questions}
    result = []
    for response in responses:
        question = by_id.get(response.question_id)
        if response.is_correct is not None or not question or question.kind != QuestionKind.ACADEMIC or not question.correct_indices:
            result.append(response); continue
        normalized = " ".join(str(response.value).split()).casefold()
        correct_values = set()
        all_values = set()
        for index, choice in enumerate(question.choices):
            tokens = {" ".join(choice.split()).casefold(), chr(65 + index).casefold(), str(index + 1)}
            all_values.update(tokens)
            if index in question.correct_indices: correct_values.update(tokens)
        result.append(replace(response, is_correct=normalized in correct_values if normalized in all_values else False))
    return result


def build_public_snapshot(presentations, sessions, questions, responses, privacy_k: int = 5, public_files=None, *, include_views: bool = True) -> dict[str, Any]:
    presentations, sessions, questions, responses = privacy_safe_corpus(
        presentations, sessions, questions, responses, privacy_k
    )
    by_session: dict[str, list[Response]] = defaultdict(list)
    by_question: dict[str, list[Response]] = defaultdict(list)
    for response in responses:
        by_session[response.session_id].append(response)
        by_question[response.question_id].append(response)

    question_by_id = {question.question_id: question for question in questions}
    session_by_id = {session.session_id: session for session in sessions}
    presentation_by_id = {presentation.presentation_id: presentation for presentation in presentations}
    presentation_dates = {key: value.session_date for key, value in presentation_by_id.items()}

    eligible_sessions = []
    for session in sorted(sessions, key=lambda value: value.session_date):
        sample = by_session[session.session_id]
        distinct = len({response.participant_id for response in sample})
        if distinct < privacy_k:
            continue
        academic_sample = [response for response in sample if response.is_correct is not None]
        academic_distinct = len({response.participant_id for response in academic_sample})
        accuracy = (
            _percent(sum(response.is_correct is True for response in academic_sample), len(academic_sample))
            if academic_distinct >= privacy_k
            else None
        )
        eligible_sessions.append({
            "session": session,
            "participants": distinct,
            "responses": valid_response_count(sample, questions),
            "accuracy": accuracy,
            "academic_answers": len(academic_sample) if accuracy is not None else 0,
            "academic_questions": len({response.question_id for response in academic_sample}) if accuracy is not None else 0,
        })

    academic_sessions = [row for row in eligible_sessions if row["accuracy"] is not None]
    moving_accuracy = rolling_average([row["accuracy"] for row in academic_sessions], 8)
    learning_trend = [{
        "label": row["session"].session_date.strftime("%d/%m/%Y"),
        "accuracy": row["accuracy"],
        "moving_accuracy": round(moving_accuracy[index], 1) if moving_accuracy[index] is not None else None,
        "answers": row["academic_answers"],
        "questions": row["academic_questions"],
    } for index, row in enumerate(academic_sessions)]
    moving_by_session = {
        row["session"].session_id: learning_trend[index]["moving_accuracy"]
        for index, row in enumerate(academic_sessions)
    }
    overview_trend = [{
        "label": row["session"].session_date.strftime("%d/%m/%Y"),
        "participation": row["participants"],
        "accuracy": moving_by_session.get(row["session"].session_id),
    } for row in eligible_sessions]
    participation_trend = [{
        "label": row["session"].session_date.strftime("%d/%m/%Y"),
        "participants": row["participants"],
        "responses": row["responses"],
    } for row in eligible_sessions]

    monthly_participation_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in eligible_sessions:
        monthly_participation_groups[_month_key(row["session"].session_date)].append(row)
    monthly_participation = []
    for month, rows in sorted(monthly_participation_groups.items()):
        monthly_participation.append({
            "month": month,
            "label": _month_label(month),
            "participants": sum(row["participants"] for row in rows),
            "responses": sum(row["responses"] for row in rows),
            "presentations": len({row["session"].presentation_id for row in rows}),
        })

    academic = [response for response in responses if response.is_correct is not None]
    total_scores = Counter()
    for response in academic:
        total_scores[(response.session_id, response.participant_id)] += int(response.is_correct is True)
    participants_total = sum(session.participants for session in sessions)
    capacity = sum(session.participants * session.interactive_slides for session in sessions)
    valid_responses = valid_response_count(responses, questions)
    overall_visible = participants_total >= privacy_k
    academic_visible = len({(response.session_id, response.participant_id) for response in academic}) >= privacy_k

    question_performance = []
    topic_acc: dict[str, list[Response]] = defaultdict(list)
    for question in questions:
        sample = [response for response in by_question[question.question_id] if response.is_correct is not None]
        distinct = len({(response.session_id, response.participant_id) for response in sample})
        if distinct < privacy_k:
            continue
        correct = sum(response.is_correct is True for response in sample)
        accuracy = _percent(correct, len(sample))
        low, high = wilson_interval(correct, len(sample))
        correct_choice = (
            question.choices[question.correct_indices[0]]
            if question.correct_indices and question.correct_indices[0] < len(question.choices)
            else ""
        )
        answer_counts = Counter(str(response.value) for response in sample)
        distractors = ineffective_distractors(answer_counts, correct_choice)
        discrimination = point_biserial(
            [bool(response.is_correct) for response in sample],
            [total_scores[(response.session_id, response.participant_id)] for response in sample],
        )
        presentation = presentation_by_id.get(question.presentation_id)
        question_performance.append({
            "question": question.title,
            "topic": question.topic or "Não classificado",
            "subtopic": question.subtopic,
            "presentation": presentation.title if presentation else None,
            "date": presentation.session_date.isoformat() if presentation else None,
            "accuracy": accuracy,
            "responses": len(sample),
            "difficulty": difficulty_band(accuracy / 100),
            "wilson_low": round(low * 100, 1),
            "wilson_high": round(high * 100, 1),
            "discrimination": round(discrimination, 3) if discrimination is not None else None,
            "ineffective_distractors": distractors,
        })
        topic_acc[question.topic or "Não classificado"].extend(sample)

    difficulty_counts: dict[str, list[float]] = defaultdict(list)
    for item in question_performance:
        difficulty_counts[item["difficulty"]].append(item["accuracy"])
    difficulty_labels = {
        "very_hard": "Muito difícil",
        "hard": "Difícil",
        "medium": "Moderada",
        "easy": "Fácil",
        "very_easy": "Muito fácil",
    }
    by_difficulty = [{
        "label": difficulty_labels[key],
        "accuracy": round(sum(values) / len(values), 1),
        "questions": len(values),
    } for key, values in difficulty_counts.items()]

    profile_questions = {question.question_id for question in questions if question.kind == QuestionKind.PROFILE}
    profile_people: dict[str, set[tuple[str, str]]] = defaultdict(set)
    for response in responses:
        if response.question_id in profile_questions:
            profile_people[str(response.value)].add((response.session_id, response.participant_id))
    profile_counts = Counter({label: len(people) for label, people in profile_people.items()})
    profile_responders = set().union(*profile_people.values()) if profile_people else set()
    profile_filters_safe = (
        bool(profile_counts)
        and all(value >= privacy_k for value in profile_counts.values())
        and len(profile_responders) == participants_total
        and sum(profile_counts.values()) == participants_total
    )
    visible_profile_counts = dict(profile_counts) if profile_filters_safe else {}
    profile_total = sum(visible_profile_counts.values())
    by_profile = (
        [{"label": key, "value": round(100 * value / profile_total, 1)} for key, value in visible_profile_counts.items()]
        if profile_total else []
    )
    format_counts = Counter(question.kind.value for question in questions)
    format_total = sum(format_counts.values())
    by_format = [{"label": key, "value": round(100 * value / format_total, 1)} for key, value in format_counts.items()]

    evaluation_questions = [question for question in questions if question.kind == QuestionKind.EVALUATION]
    evaluation_ids = {question.question_id for question in evaluation_questions}
    nps_ids = {question.question_id for question in questions if question.kind == QuestionKind.NPS}
    evaluation_rows = [
        response for response in responses
        if response.question_id in evaluation_ids and isinstance(response.value, (int, float))
    ]
    nps_rows = [
        response for response in responses
        if response.question_id in nps_ids and isinstance(response.value, (int, float))
    ]
    evaluator_ids = {(response.session_id, response.participant_id) for response in evaluation_rows}
    evaluation = evaluation_rows if len(evaluator_ids) >= privacy_k else []
    nps_respondents = {(response.session_id, response.participant_id) for response in nps_rows}
    nps_values = [response.value for response in nps_rows] if len(nps_respondents) >= privacy_k else []

    criterion_meta: dict[str, dict[str, str]] = {}
    criterion_by_question: dict[str, str] = {}
    for question in evaluation_questions:
        normalized = _normalized_label(question.title)
        key = _criterion_key(question.title)
        criterion_meta.setdefault(normalized, {"key": key, "label": " ".join(question.title.split())})
        criterion_by_question[question.question_id] = normalized
    criterion_rows: dict[str, list[Response]] = defaultdict(list)
    for response in evaluation:
        normalized = criterion_by_question.get(response.question_id)
        if normalized:
            criterion_rows[normalized].append(response)

    criteria = []
    for normalized, sample in sorted(criterion_rows.items(), key=lambda item: criterion_meta[item[0]]["label"]):
        respondent_count = len({(response.session_id, response.participant_id) for response in sample})
        if respondent_count < privacy_k:
            continue
        monthly_groups: dict[str, list[Response]] = defaultdict(list)
        for response in sample:
            session = session_by_id.get(response.session_id)
            if session:
                monthly_groups[_month_key(session.session_date)].append(response)
        trend = []
        for month, month_sample in sorted(monthly_groups.items()):
            month_respondents = {(response.session_id, response.participant_id) for response in month_sample}
            if len(month_respondents) < privacy_k:
                continue
            trend.append({
                "month": month,
                "label": _month_label(month),
                "score": round(sum(float(response.value) for response in month_sample) / len(month_sample), 2),
                "responses": len(month_respondents),
            })
        delta = round(trend[-1]["score"] - trend[-2]["score"], 2) if len(trend) > 1 else None
        criteria.append({
            **criterion_meta[normalized],
            "score": round(sum(float(response.value) for response in sample) / len(sample), 2),
            "responses": respondent_count,
            "delta": delta,
            "trend": trend,
        })

    evaluation_months: dict[str, list[Response]] = defaultdict(list)
    nps_months: dict[str, list[Response]] = defaultdict(list)
    for response in evaluation:
        session = session_by_id.get(response.session_id)
        if session:
            evaluation_months[_month_key(session.session_date)].append(response)
    for response in nps_rows:
        session = session_by_id.get(response.session_id)
        if session:
            nps_months[_month_key(session.session_date)].append(response)
    experience_trend = []
    for month, sample in sorted(evaluation_months.items()):
        month_evaluators = {(response.session_id, response.participant_id) for response in sample}
        if len(month_evaluators) < privacy_k:
            continue
        month_nps = nps_months.get(month, [])
        month_nps_values = (
            [response.value for response in month_nps]
            if len({(response.session_id, response.participant_id) for response in month_nps}) >= privacy_k
            else []
        )
        experience_trend.append({
            "month": month,
            "label": _month_label(month),
            "score": round(sum(float(response.value) for response in sample) / len(sample), 2),
            "evaluations": len(month_evaluators),
            "nps": round(nps(month_nps_values), 1) if month_nps_values else None,
        })

    topic_items = []
    for topic, sample in topic_acc.items():
        accuracy = _percent(sum(response.is_correct is True for response in sample), len(sample))
        topic_questions = [
            question for question in questions
            if (question.topic or "Não classificado") == topic
        ]
        question_count = len(topic_questions)
        occurrence_dates = [
            presentation_dates[question.presentation_id]
            for question in topic_questions
            if question.presentation_id in presentation_dates
        ]
        opportunity = (
            "Reforçar"
            if accuracy is not None and accuracy < 60 and len(sample) >= 30
            else ("Pouco abordado" if question_count <= 1 else "Manter e avançar")
        )
        topic_items.append({
            "topic": topic,
            "questions": question_count,
            "responses": len(sample),
            "accuracy": accuracy,
            "difficulty": difficulty_labels[difficulty_band(accuracy / 100)] if accuracy is not None else None,
            "recurrence": len({question.presentation_id for question in topic_questions}),
            "last_occurrence": max(occurrence_dates).isoformat() if occurrence_dates else None,
            "opportunity": opportunity,
        })
    topic_items.sort(key=lambda item: (-item["questions"], item["topic"]))

    academic_months: dict[str, list[Response]] = defaultdict(list)
    for response in academic:
        session = session_by_id.get(response.session_id)
        if session:
            academic_months[_month_key(session.session_date)].append(response)
    historical_monthly = []
    for month, sample in sorted(academic_months.items()):
        distinct = {(response.session_id, response.participant_id) for response in sample}
        if len(distinct) < privacy_k:
            continue
        historical_monthly.append({
            "month": month,
            "label": _month_label(month),
            "accuracy": _percent(sum(response.is_correct is True for response in sample), len(sample)),
            "answers": len(sample),
            "questions": len({response.question_id for response in sample}),
        })
    historical_candidates = [item for item in question_performance if item["responses"] >= 30]
    strongest_questions = sorted(
        historical_candidates,
        key=lambda item: (-item["accuracy"], -item["responses"], item["question"]),
    )[:5]
    priority_questions = sorted(
        [item for item in historical_candidates if item["accuracy"] < 60],
        key=lambda item: (item["accuracy"], -item["responses"], item["question"]),
    )[:6]

    filters = {
        "periods": ["Últimos 12 meses"] + sorted({str(session.session_date.year) for session in sessions}, reverse=True),
        "presentations": ["Todas as apresentações"] + [presentation.title for presentation in presentations],
        "profiles": ["Todos os perfis"] + sorted(visible_profile_counts),
        "formats": ["Todos os formatos"] + sorted(format_counts),
        "topics": ["Todos os assuntos"] + sorted(topic_acc),
        "difficulties": ["Todas as dificuldades"] + list(difficulty_labels.values()),
    }
    accuracy_rate = (
        _percent(sum(response.is_correct is True for response in academic), len(academic))
        if academic_visible else None
    )
    response_rate = _percent(valid_responses, capacity) if overall_visible else None
    score = round(sum(float(response.value) for response in evaluation) / len(evaluation), 2) if evaluation else None
    evaluation_count = len(evaluator_ids) if len(evaluator_ids) >= privacy_k else (0 if not evaluator_ids else None)
    evaluation_rate = (
        _percent(len(evaluator_ids), participants_total)
        if len(evaluator_ids) >= privacy_k and overall_visible else None
    )
    improvement = (
        round(learning_trend[-1]["moving_accuracy"] - learning_trend[0]["moving_accuracy"], 1)
        if len(learning_trend) > 1 else None
    )
    highlights = []
    if overall_visible:
        highlights.append({
            "title": "Participação que se transforma em evidência",
            "detail": f"{participants_total} participações em {len(presentations)} encontros do Desafio Trauma.",
        })
    if accuracy_rate is not None:
        highlights.append({
            "title": "Aprendizado monitorado continuamente",
            "detail": f"Acurácia histórica de {accuracy_rate:.1f}% em {len(academic)} respostas acadêmicas.",
        })
    if score is not None:
        highlights.append({
            "title": "Experiência reconhecida pelos participantes",
            "detail": f"Avaliação consolidada de {score:.2f}/5, com {evaluation_count or 0} avaliadores.",
        })
    if monthly_participation:
        busiest = max(monthly_participation, key=lambda item: item["participants"])
        highlights.append({
            "title": "Alcance mensal em perspectiva",
            "detail": f"{busiest['label']} concentrou {busiest['participants']} participações, o maior volume da série.",
        })
    reinforce_topics = sorted(
        [item for item in topic_items if item["opportunity"] == "Reforçar"],
        key=lambda item: item["accuracy"],
    )
    if reinforce_topics:
        highlights.append({
            "title": "Dados que orientam o próximo encontro",
            "detail": f"{reinforce_topics[0]['topic']} aparece como prioridade histórica de reforço ({reinforce_topics[0]['accuracy']:.1f}% de acurácia).",
        })

    snapshot = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_updated_at": max(
                (presentation.captured_at for presentation in presentations if presentation.captured_at),
                default=datetime.now(timezone.utc),
            ).isoformat(),
            "privacy_note": f"Grupos com menos de {privacy_k} participantes distintos são excluídos dos detalhes e dos totais públicos.",
        },
        "filters": filters,
        "overview": {
            "presentations": len(presentations),
            "participants": participants_total if overall_visible else None,
            "responses": valid_responses if overall_visible else None,
            "response_rate": response_rate,
            "accuracy_rate": accuracy_rate,
            "experience_score": score,
            "trend": overview_trend,
            "highlights": highlights,
        },
        "participation": {
            "total_participants": participants_total if overall_visible else None,
            "total_responses": valid_responses if overall_visible else None,
            "response_rate": response_rate,
            "evaluators": evaluation_count,
            "evaluation_rate": evaluation_rate,
            "presentations": len(presentations),
            "trend": participation_trend,
            "monthly": monthly_participation,
            "by_profile": by_profile,
            "by_format": by_format,
        },
        "learning": {
            "accuracy_rate": accuracy_rate,
            "questions": len([question for question in questions if question.kind == QuestionKind.ACADEMIC]),
            "answers": len(academic),
            "improvement": improvement,
            "trend": learning_trend,
            "by_difficulty": by_difficulty,
            "question_performance": question_performance,
            "historical": {
                "by_month": historical_monthly,
                "by_topic": topic_items,
                "strongest_questions": strongest_questions,
                "priority_questions": priority_questions,
            },
        },
        "experience": {
            "score": score,
            "nps": nps(nps_values),
            "evaluations": evaluation_count,
            "evaluation_rate": evaluation_rate,
            "recommendation_rate": _percent(sum(value >= 9 for value in nps_values), len(nps_values)),
            "criteria": criteria,
            "trend": experience_trend,
        },
        "topics": {
            "coverage": len(topic_items),
            "mapped_questions": sum(question.topic is not None for question in questions),
            "opportunities": sum(item["opportunity"] in {"Reforçar", "Pouco abordado"} for item in topic_items),
            "items": topic_items,
        },
        "metric_dictionary": [
            {"metric": "Taxa de resposta", "definition": "Respostas válidas divididas por participantes vezes slides interativos."},
            {"metric": "Acurácia", "definition": "Percentual de respostas acadêmicas corretas; exclui perfil e avaliação."},
            {"metric": "Média móvel", "definition": "Acurácia média das oito sessões acadêmicas elegíveis mais recentes."},
            {"metric": "NPS", "definition": "Percentual de promotores menos percentual de detratores."},
        ],
        "public_files": public_files or [],
    }
    if include_views:
        views = []
        options = {
            "period": snapshot["filters"]["periods"],
            "presentation": snapshot["filters"]["presentations"],
            "profile": snapshot["filters"]["profiles"],
            "format": snapshot["filters"]["formats"],
            "topic": snapshot["filters"]["topics"],
            "difficulty": snapshot["filters"]["difficulties"],
        }
        for filter_name, values in options.items():
            for value in values:
                if str(value).casefold().startswith(("todo", "toda")):
                    continue
                subset = _filter_corpus(filter_name, value, presentations, sessions, questions, responses)
                if not subset[3]:
                    continue
                filtered = build_public_snapshot(*subset, privacy_k=privacy_k, public_files=[], include_views=False)
                views.append({
                    "filters": {filter_name: value},
                    "snapshot": {
                        key: filtered[key]
                        for key in ("overview", "participation", "learning", "experience", "topics")
                    },
                })
        snapshot["filters"]["views"] = views
    return snapshot


def _filter_corpus(filter_name, value, presentations, sessions, questions, responses):
    """Build a privacy-ready corpus slice for one global filter dimension."""
    selected_responses = list(responses)
    question_by_id = {question.question_id: question for question in questions}
    session_by_id = {session.session_id: session for session in sessions}

    if filter_name == "presentation":
        presentation_ids = {item.presentation_id for item in presentations if item.title == value}
        selected_session_ids = {item.session_id for item in sessions if item.presentation_id in presentation_ids}
        selected_responses = [item for item in responses if item.session_id in selected_session_ids]
    elif filter_name == "period":
        dated_sessions = list(sessions)
        if value == "Últimos 12 meses" and dated_sessions:
            cutoff = max(item.session_date for item in dated_sessions) - timedelta(days=365)
            selected_session_ids = {item.session_id for item in dated_sessions if item.session_date >= cutoff}
        else:
            selected_session_ids = {item.session_id for item in dated_sessions if str(item.session_date.year) == str(value)}
        selected_responses = [item for item in responses if item.session_id in selected_session_ids]
    elif filter_name == "profile":
        profile_ids = {item.question_id for item in questions if item.kind == QuestionKind.PROFILE}
        participant_ids = {item.participant_id for item in responses if item.question_id in profile_ids and str(item.value) == str(value)}
        selected_responses = [item for item in responses if item.participant_id in participant_ids]
    elif filter_name == "format":
        question_ids = {item.question_id for item in questions if item.kind.value == value}
        selected_responses = [item for item in responses if item.question_id in question_ids]
    elif filter_name == "topic":
        question_ids = {item.question_id for item in questions if (item.topic or "Não classificado") == value}
        selected_responses = [item for item in responses if item.question_id in question_ids]
    elif filter_name == "difficulty":
        labels = {"very_hard": "Muito difícil", "hard": "Difícil", "medium": "Moderada", "easy": "Fácil", "very_easy": "Muito fácil"}
        samples: dict[str, list[Response]] = defaultdict(list)
        for response in responses:
            if response.is_correct is not None:
                samples[response.question_id].append(response)
        question_ids = {
            question_id for question_id, sample in samples.items()
            if labels[difficulty_band(sum(item.is_correct is True for item in sample) / len(sample))] == value
        }
        selected_responses = [item for item in responses if item.question_id in question_ids]

    selected_session_ids = {item.session_id for item in selected_responses}
    selected_question_ids = {item.question_id for item in selected_responses}
    selected_questions = [item for item in questions if item.question_id in selected_question_ids]
    selected_sessions = []
    for session_id in selected_session_ids:
        session = session_by_id.get(session_id)
        if not session:
            continue
        sample = [item for item in selected_responses if item.session_id == session_id]
        slide_count = len({question_by_id[item.question_id].slide_index for item in sample if item.question_id in question_by_id})
        selected_sessions.append(replace(session, participants=len({item.participant_id for item in sample}), interactive_slides=max(1, slide_count)))
    selected_presentation_ids = {item.presentation_id for item in selected_sessions}
    selected_presentations = [item for item in presentations if item.presentation_id in selected_presentation_ids]
    return selected_presentations, selected_sessions, selected_questions, selected_responses


def validate_public_snapshot(snapshot: dict[str, Any]) -> None:
    required = {"metadata", "filters", "overview", "participation", "learning", "experience", "topics", "metric_dictionary", "public_files"}
    if set(snapshot) != required: raise ValueError(f"snapshot v1 keys mismatch: {set(snapshot) ^ required}")
    for section, field in (("overview", "response_rate"), ("overview", "accuracy_rate"), ("participation", "response_rate"), ("participation", "evaluation_rate"), ("learning", "accuracy_rate"), ("experience", "evaluation_rate"), ("experience", "recommendation_rate")):
        value = snapshot.get(section, {}).get(field)
        if value is not None and (value < 0 or value > 100): raise ValueError(f"percentage unit invalid: {section}.{field}")
    contracts = {
        "metadata": {"generated_at", "source_updated_at", "privacy_note"},
        "filters": {"periods", "presentations", "profiles", "formats", "topics", "difficulties", "views"},
        "overview": {"presentations", "participants", "responses", "response_rate", "accuracy_rate", "experience_score", "trend", "highlights"},
        "participation": {"total_participants", "total_responses", "response_rate", "evaluators", "evaluation_rate", "presentations", "trend", "monthly", "by_profile", "by_format"},
        "learning": {"accuracy_rate", "questions", "answers", "improvement", "trend", "by_difficulty", "question_performance", "historical"},
        "experience": {"score", "nps", "evaluations", "evaluation_rate", "recommendation_rate", "criteria", "trend"},
        "topics": {"coverage", "mapped_questions", "opportunities", "items"},
    }
    for section, fields in contracts.items():
        if set(snapshot[section]) != fields: raise ValueError(f"snapshot v1 section mismatch: {section}")
    if not isinstance(snapshot["metric_dictionary"], list) or not isinstance(snapshot["public_files"], list): raise ValueError("snapshot v1 list contract invalid")
