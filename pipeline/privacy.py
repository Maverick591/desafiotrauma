from __future__ import annotations

from collections import defaultdict
from dataclasses import replace
from typing import Iterable

from .models import Presentation, Question, Response, Session


def valid_response_count(responses: Iterable[Response], questions: Iterable[Question]) -> int:
    """Count at most one response per participant and interactive slide."""
    slide_by_question = {question.question_id: question.slide_index for question in questions}
    keys = {
        (response.session_id, response.participant_id, slide_by_question[response.question_id])
        for response in responses
        if response.question_id in slide_by_question
    }
    return len(keys)


def privacy_safe_corpus(
    presentations: Iterable[Presentation],
    sessions: Iterable[Session],
    questions: Iterable[Question],
    responses: Iterable[Response],
    privacy_k: int = 5,
) -> tuple[list[Presentation], list[Session], list[Question], list[Response]]:
    """Remove undersized sessions before any public total or derived view is built.

    Applying k-anonymity only to detail rows permits differencing a hidden row from
    an all-session total. Public aggregates therefore use the same eligible corpus
    as their visible detail. A session must have both a reported audience and a
    distinct-response sample of at least ``privacy_k``.
    """
    presentation_rows = list(presentations)
    session_rows = list(sessions)
    question_rows = list(questions)
    response_rows = list(responses)
    by_session: dict[str, set[str]] = defaultdict(set)
    for response in response_rows:
        by_session[response.session_id].add(response.participant_id)

    candidate_sessions = [
        session
        for session in session_rows
        if session.participants >= privacy_k
        and len(by_session.get(session.session_id, set())) >= privacy_k
    ]
    candidate_session_ids = {session.session_id for session in candidate_sessions}

    # Remove every undersized session-question cell before higher-level totals.
    people_by_cell: dict[tuple[str, str], set[str]] = defaultdict(set)
    for response in response_rows:
        if response.session_id in candidate_session_ids:
            people_by_cell[(response.session_id, response.question_id)].add(response.participant_id)
    safe_cells = {cell for cell, people in people_by_cell.items() if len(people) >= privacy_k}
    cell_safe_responses = [
        response
        for response in response_rows
        if (response.session_id, response.question_id) in safe_cells
    ]
    safe_people_by_session: dict[str, set[str]] = defaultdict(set)
    for response in cell_safe_responses:
        safe_people_by_session[response.session_id].add(response.participant_id)
    final_session_ids = {
        session.session_id
        for session in candidate_sessions
        if len(safe_people_by_session.get(session.session_id, set())) >= privacy_k
    }
    safe_responses = [response for response in cell_safe_responses if response.session_id in final_session_ids]
    safe_question_ids = {response.question_id for response in safe_responses}
    safe_questions = [question for question in question_rows if question.question_id in safe_question_ids]
    slide_by_question = {question.question_id: question.slide_index for question in safe_questions}
    safe_sessions = []
    for session in candidate_sessions:
        if session.session_id not in final_session_ids:
            continue
        visible_slides = {
            slide_by_question[response.question_id]
            for response in safe_responses
            if response.session_id == session.session_id and response.question_id in slide_by_question
        }
        safe_sessions.append(replace(
            session,
            participants=len(safe_people_by_session[session.session_id]),
            interactive_slides=len(visible_slides),
        ))
    safe_presentation_ids = {session.presentation_id for session in safe_sessions}
    safe_presentations = [
        presentation
        for presentation in presentation_rows
        if presentation.presentation_id in safe_presentation_ids
    ]
    return safe_presentations, safe_sessions, safe_questions, safe_responses
