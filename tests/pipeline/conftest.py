from __future__ import annotations

from pathlib import Path

import pytest
from openpyxl import Workbook


@pytest.fixture
def synthetic_reference_xlsx(tmp_path: Path) -> Path:
    """Synthetic 27/05/2026-shaped data: 208/245, 9/35 and 142/166."""
    path = tmp_path / "desafio-trauma-2026-05-27.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Results"
    sheet.append(["Participant ID", "Question", "Answer", "Correct", "Question type"])
    participants = [f"participant-{index:02d}" for index in range(35)]
    for index in range(33):
        sheet.append([participants[index], "Participante", "Aluno", "", "profile"])
    academic_pairs = [(participant, question) for question in range(1, 6) for participant in participants][:166]
    for index, (participant, question) in enumerate(academic_pairs):
        sheet.append([
            participant, f"Pergunta acadêmica {question}", "A",
            "true" if index < 142 else "false", "quiz",
        ])
    for index in range(9):
        sheet.append([participants[index], "Avaliação geral", 9, "", "evaluation"])
    workbook.save(path)
    return path


@pytest.fixture
def synthetic_slide_deck() -> dict:
    academic_slides = [
        {
            "slide_id": f"slide-{index}",
            "static_content": {"type": "quiz-choice"},
            "interactive_contents": [{
                "title": f"Pergunta acadêmica {index}",
                "correct_answer_mode": "enabled",
                "choices": [
                    {"title": "A", "marked_correct": True},
                    {"title": "B", "marked_correct": False},
                ],
            }],
        }
        for index in range(1, 6)
    ]
    return {
        "name": "Desafio Trauma - 27/05/2026",
        "slide_deck_id": "synthetic-deck",
        "slides": academic_slides + [
            {"slide_id": "slide-6", "static_content": {"type": "quiz-choice"}, "interactive_contents": [{"title": "Participante", "correct_answer_mode": "disabled", "choices": [{"title": "Aluno", "marked_correct": False}]}]},
            {"slide_id": "slide-7", "static_content": {"type": "scales"}, "interactive_contents": [{"title": "Avaliação geral", "correct_answer_mode": "disabled", "choices": []}]},
        ],
    }
