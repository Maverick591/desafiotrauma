from __future__ import annotations

import math
from collections.abc import Mapping, Sequence


def safe_rate(numerator: int | float, denominator: int | float) -> float | None:
    return numerator / denominator if denominator else None


def participation_rate(valid_responses: int, capacity: int, interactive_slides: int = 1) -> float | None:
    """Valid responses / (participants * interactive slides).

    ``capacity`` is the participant count. A default of one slide also makes this
    useful for the published 208/245 reference check.
    """
    return safe_rate(valid_responses, capacity * interactive_slides)


def evaluation_rate(evaluation_respondents: int, participants: int) -> float | None:
    return safe_rate(evaluation_respondents, participants)


def academic_accuracy(correct: int, valid_academic_responses: int) -> float | None:
    return safe_rate(correct, valid_academic_responses)


def difficulty_band(accuracy: float) -> str:
    if accuracy < 0.30:
        return "very_hard"
    if accuracy < 0.50:
        return "hard"
    if accuracy < 0.70:
        return "medium"
    if accuracy < 0.85:
        return "easy"
    return "very_easy"


def wilson_interval(successes: int, total: int, z: float = 1.959963984540054) -> tuple[float, float]:
    if total <= 0:
        return (0.0, 0.0)
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator
    return max(0.0, centre - margin), min(1.0, centre + margin)


def rolling_average(values: Sequence[float | None], window: int = 8) -> list[float | None]:
    result: list[float | None] = []
    for index in range(len(values)):
        sample = [value for value in values[max(0, index - window + 1) : index + 1] if value is not None]
        result.append(sum(sample) / len(sample) if sample else None)
    return result


def point_biserial(correct: Sequence[int | bool], total_scores: Sequence[float]) -> float | None:
    if len(correct) != len(total_scores) or len(correct) < 20:
        return None
    ones = [score for flag, score in zip(correct, total_scores) if bool(flag)]
    zeros = [score for flag, score in zip(correct, total_scores) if not bool(flag)]
    if not ones or not zeros:
        return None
    mean = sum(total_scores) / len(total_scores)
    variance = sum((score - mean) ** 2 for score in total_scores) / len(total_scores)
    if variance == 0:
        return None
    p = len(ones) / len(correct)
    q = 1 - p
    return ((sum(ones) / len(ones)) - (sum(zeros) / len(zeros))) / math.sqrt(variance) * math.sqrt(p * q)


def ineffective_distractors(counts: Mapping[str, int], correct_choice: str, threshold: float = 0.05) -> list[str]:
    total = sum(max(0, count) for count in counts.values())
    if not total:
        return []
    return [choice for choice, count in counts.items() if choice != correct_choice and count / total < threshold]


def nps(scores: Sequence[int | float]) -> float | None:
    valid = [score for score in scores if 0 <= score <= 10]
    if not valid:
        return None
    promoters = sum(score >= 9 for score in valid)
    detractors = sum(score <= 6 for score in valid)
    return 100 * (promoters - detractors) / len(valid)


def reinforce(accuracy: float | None, sample_size: int) -> bool:
    return accuracy is not None and accuracy < 0.60 and sample_size >= 30


def public_value(value: object, sample_size: int, minimum: int = 5) -> object | None:
    return value if sample_size >= minimum else None
