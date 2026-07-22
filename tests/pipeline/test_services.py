from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from openpyxl import load_workbook

from pipeline.ai import AIClassifier, Classification, redact_pii
from pipeline.mentimeter import PresentationRef, extract_slide_deck, matches_title, select_presentations
from pipeline.models import Presentation, Question, QuestionKind, Response, Session
from pipeline.orchestrator import Pipeline, SnapshotManager, questions_from_deck
from pipeline.persistence import LocalRepository
from pipeline.reports import PRIVATE_SHEETS, PUBLIC_SHEETS, write_report


def test_discovery_title_is_strict_and_selection_reprocesses_two_recent() -> None:
    assert matches_title("Desafio Trauma - 27/05/2026")
    assert matches_title("Desafio Trauma -27/05/2026")
    assert not matches_title("Desafio Trauma - 27/05/2026 copy")
    refs = [
        PresentationRef(str(i), f"Desafio Trauma - {i:02d}/05/2026", f"/{i}", complete=True)
        for i in range(1, 5)
    ]
    refs[0] = PresentationRef("1", refs[0].title, "/1", complete=False)
    selected = select_presentations(refs, mode="incremental", known_ids={r.presentation_id for r in refs})
    assert {r.presentation_id for r in selected} == {"1", "3", "4"}
    older = PresentationRef("legacy", "Desafio Trauma - 22/10/2024", "/legacy")
    assert select_presentations([older, *refs], mode="backfill") == refs


def test_mentimeter_credentials_support_local_fallback(monkeypatch) -> None:
    from pipeline.mentimeter import MentimeterClient

    monkeypatch.delenv("MENTIMETER_EMAIL", raising=False)
    monkeypatch.delenv("MENTIMETER_PASSWORD", raising=False)
    monkeypatch.setenv("LOGIN_EMAIL", "local@example.invalid")
    monkeypatch.setenv("LOGIN_PASSWORD", "not-a-real-secret")
    client = MentimeterClient()
    assert client.email.endswith(".invalid")


def test_capture_accepts_only_json_with_slide_deck() -> None:
    assert extract_slide_deck({"anything": 1}) is None
    deck = {"slide_deck": {"name": "Desafio Trauma - 27/05/2026", "slides": []}}
    assert extract_slide_deck(deck) == deck["slide_deck"]


def test_slide_deck_builds_academic_question_from_correct_markers() -> None:
    deck = {"slides": [{"static_content": {"type": "quiz-choice"}, "interactive_contents": [{
        "title": "Conduta?", "correct_answer_mode": "enabled",
        "choices": [{"title": "A", "marked_correct": False}, {"title": "B", "marked_correct": True}],
    }]}]}
    question = questions_from_deck(deck, "p1")[0]
    assert question.kind == QuestionKind.ACADEMIC
    assert question.correct_indices == (1,)


def test_dry_run_only_discovers_and_selects(tmp_path: Path) -> None:
    class FakeClient:
        def discover(self):
            return [PresentationRef("p1", "Desafio Trauma - 27/05/2026", "/p1")]

        def fetch(self, *_):
            raise AssertionError("dry run must not download")

    result = Pipeline(client=FakeClient(), repository=LocalRepository(tmp_path), workdir=tmp_path).sync(
        "incremental", dry_run=True
    )
    assert result["selected"] == 1


def test_local_pipeline_end_to_end_creates_last_good_only_after_publish(
    tmp_path: Path, synthetic_reference_xlsx: Path, synthetic_slide_deck: dict
) -> None:
    class FakeClient:
        def discover(self):
            return [PresentationRef("p1", "Desafio Trauma - 27/05/2026", "/p1")]

        def fetch(self, ref, destination):
            destination.mkdir(parents=True, exist_ok=True)
            return synthetic_reference_xlsx, synthetic_slide_deck

    repository = LocalRepository(tmp_path / "repository")
    result = Pipeline(client=FakeClient(), repository=repository, workdir=tmp_path / "work").sync("backfill")
    assert result["responses"] == 208
    assert len(list((tmp_path / "work/reports").glob("*/public.xlsx"))) == 1
    published = json.loads((tmp_path / "repository/last_good_snapshot.json").read_text())["snapshot"]
    assert set(published) == {"metadata", "filters", "overview", "participation", "learning", "experience", "topics", "metric_dictionary", "public_files"}
    assert published["overview"]["response_rate"] == 84.9  # 208 / (35 * 7)
    assert published["learning"]["accuracy_rate"] == 85.5  # 142 / 166
    assert published["experience"]["evaluations"] == 9      # 9 / 35 evaluated
    assert published["experience"]["evaluation_rate"] == 25.7


def test_ai_redacts_pii_uses_structured_parse_and_flags_low_confidence() -> None:
    captured = {}

    class FakeResponses:
        def parse(self, **kwargs):
            captured.update(kwargs)
            return type("Result", (), {"output_parsed": Classification(
                primary_topic="Abdome e pelve", subtopic="Baço", cognitive_task="conduta",
                bloom="aplicar", predicted_difficulty="medium", confidence=0.79,
                rationale="Classificação clínica",
            ), "usage": type("Usage", (), {"input_tokens": 100, "output_tokens": 20})()})()

    client = type("Client", (), {"responses": FakeResponses()})()
    classifier = AIClassifier(client=client, budget_usd=5)
    result = classifier.classify("João Silva joao@example.com CPF 123.456.789-00", ["A", "B"])
    assert result.needs_review is True and result.primary_topic == "Abdome e pelve"
    assert captured["model"] == "gpt-5.6-luna"
    assert captured["store"] is False
    assert captured["reasoning"] == {"effort": "low"}
    prompt = captured["input"]
    assert "joao@example.com" not in prompt and "123.456.789-00" not in prompt
    assert "[EMAIL]" in redact_pii("a@b.com")


def test_ai_budget_warns_and_stops() -> None:
    classifier = AIClassifier(client=object(), budget_usd=5)
    classifier.spent_usd = 3.5
    assert classifier.budget_warning
    classifier.spent_usd = 5
    assert classifier.classify("Q", []) .status == "pending_budget"


def _sample_data():
    presentation = Presentation("p1", "Desafio Trauma - 27/05/2026", date(2026, 5, 27), "/p1")
    session = Session("s1", "p1", date(2026, 5, 27), 5, 1, complete=True)
    question = Question("q1", "p1", 1, "Pergunta", QuestionKind.ACADEMIC, ("A", "B"), (0,))
    responses = [Response(f"r{i}", "s1", "q1", f"u{i}", "A", True) for i in range(5)]
    return [presentation], [session], [question], responses


def test_reports_have_exact_sheets_and_public_suppression(tmp_path: Path) -> None:
    data = _sample_data()
    public = tmp_path / "public.xlsx"
    private = tmp_path / "private.xlsx"
    write_report(public, *data, public=True)
    write_report(private, *data, public=False)
    public_wb = load_workbook(public, read_only=True)
    assert public_wb.sheetnames == list(PUBLIC_SHEETS)
    assert load_workbook(private, read_only=True).sheetnames == list(PRIVATE_SHEETS)
    assert public_wb["Questões agregadas"]["F2"].value == 1
    assert "Correlação ponto-bisserial" in [cell.value for cell in public_wb["Questões agregadas"][1]]
    assert public_wb["Encontros"]["F2"].value == 1


def test_snapshot_only_replaces_last_good_after_success(tmp_path: Path) -> None:
    manager = SnapshotManager(tmp_path)
    manager.publish({"version": 1})
    assert json.loads((tmp_path / "last_good.json").read_text())["version"] == 1
    with pytest.raises(RuntimeError):
        manager.publish({"version": 2}, validate=lambda _: (_ for _ in ()).throw(RuntimeError("bad")))
    assert json.loads((tmp_path / "last_good.json").read_text())["version"] == 1
