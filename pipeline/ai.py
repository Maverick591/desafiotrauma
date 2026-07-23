from __future__ import annotations

import json
import os
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field


PrimaryTopic = Literal[
    "Atendimento inicial/ABCDE", "Choque e ressuscitação", "TCE e coluna", "Tórax",
    "Abdome e pelve", "Vascular", "Extremidades", "Pediatria", "Gestante", "Idoso",
    "Queimaduras", "Imagem e diagnóstico", "Procedimentos e técnica operatória",
    "Complicações e UTI", "Ética, sistemas e prevenção", "Outros",
]


class Classification(BaseModel):
    analysis_role: Literal["academic", "profile", "evaluation", "other"] = "academic"
    primary_topic: PrimaryTopic
    subtopic: str = Field(min_length=2, max_length=100)
    cognitive_task: Literal["diagnóstico", "conduta", "priorização", "prognóstico", "anatomia", "mecanismo", "outro"]
    bloom: Literal["lembrar", "compreender", "aplicar", "analisar", "avaliar", "criar"]
    predicted_difficulty: Literal["very_hard", "hard", "medium", "easy", "very_easy"]
    confidence: float = Field(ge=0, le=1)
    rationale: str = Field(min_length=2, max_length=300)
    needs_review: bool = False
    status: Literal["classified", "pending_budget", "needs_review", "failed"] = "classified"


class ClassificationBatch(BaseModel):
    items: list[Classification] = Field(min_length=1, max_length=100)


EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
CPF_RE = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}(?!\d)")
NAME_LABEL_RE = re.compile(r"(?i)\b(nome|name)\s*:\s*[A-ZÀ-ÖØ-öø-ÿ][\wÀ-ÖØ-öø-ÿ'-]+(?:\s+(?:da|de|do|das|dos|e)?\s*[A-ZÀ-ÖØ-öø-ÿ][\wÀ-ÖØ-öø-ÿ'-]+){1,5}")
COMMON_NAME_RE = re.compile(
    r"(?i)\b(?:Adriana|Alexandre|Alice|Amanda|André|Antônio|Arthur|Beatriz|Bruna|"
    r"Bruno|Camila|Carla|Carlos|Catarina|Cláudia|Daniel|Daniela|Diego|Eduardo|"
    r"Elisa|Felipe|Fernanda|Francisco|Gabriel|Gabriela|Guilherme|Gustavo|Helena|"
    r"Isabela|Joana|João|Jorge|José|Júlia|Juliana|Larissa|Leonardo|Lucas|Luís|"
    r"Marcelo|Márcia|Marcos|Maria|Mariana|Mateus|Miguel|Natália|Patrícia|Paula|"
    r"Paulo|Pedro|Rafael|Renata|Ricardo|Roberto|Rodrigo|Sofia|Tatiana|Thiago|"
    r"Valentina|Vanessa|Vinícius)"
    r"\s+(?:(?:da|de|do|das|dos|e)\s+)?[a-zà-öø-ÿ][\wà-öø-ÿ'-]+"
    r"(?:\s+(?:(?:da|de|do|das|dos|e)\s+)?[a-zà-öø-ÿ][\wà-öø-ÿ'-]+){0,2}"
    r"(?=\s*(?:[,;:.!?)]|$|\b(?:apresenta|chega|refere|relata|foi|tem|com|sem|"
    r"enviou|enviaram|respondeu|responderam|comentou|comentaram|avaliou|avaliaram)\b))"
)
PERSON_CONTEXT_RE = re.compile(
    r"(?i)\b(paciente|participante|respondente|alun[oa]|sr\.?|sra\.?|senhor(?:a)?|dr\.?|dra\.?)"
    r"(\s+(?!(?:com|de|do|da|dos|das|apresenta|chega|refere|relata|sofreu?|v[ií]tima|masculino|feminino)\b)"
    r"[a-zà-öø-ÿ][\wà-öø-ÿ'-]+(?:\s+(?:da|de|do|das|dos|e))?\s+[a-zà-öø-ÿ][\wà-öø-ÿ'-]+)"
    r"(?=\s*(?:[,;:.!?)]|$|\b(?:apresenta|chega|refere|relata|foi|tem|com)\b))"
)
PERSON_ACTION_RE = re.compile(
    r"(?i)\b([a-zà-öø-ÿ][\wà-öø-ÿ'-]+(?:\s+(?:da|de|do|das|dos|e))?"
    r"\s+[a-zà-öø-ÿ][\wà-öø-ÿ'-]+)(?=\s+(?:enviou|enviaram|respondeu|responderam|"
    r"comentou|comentaram|avaliou|avaliaram|relatou|relataram|informou|informaram)\b)"
)
PERSON_BEFORE_CLINICAL_VERB_RE = re.compile(
    r"(?i)\b(?!(?:o|a|um|uma|paciente|participante|respondente|homem|mulher|crian[cç]a|"
    r"adulto|idoso|gestante|v[ií]tima|trauma|ferimento|les[aã]o|fratura|hemorragia|"
    r"choque|queimadura|radiografia|tomografia|exame|quadro|caso|sinal|s[ií]ndrome|"
    r"doen[cç]a|dor|abdome|t[oó]rax)\b)"
    r"([a-zà-öø-ÿ][\wà-öø-ÿ'-]+(?:\s+(?:da|de|do|das|dos|e))?"
    r"\s+[a-zà-öø-ÿ][\wà-öø-ÿ'-]+"
    r"(?:\s+(?:(?:da|de|do|das|dos|e)\s+)?[a-zà-öø-ÿ][\wà-öø-ÿ'-]+){0,2})"
    r"(?=\s*(?:,\s*\d{1,3}\s*anos?\s*,?)?\s+(?:apresenta|apresentou|chega|chegou|"
    r"refere|referiu|relata|relatou|informa|informou|responde|respondeu|comenta|"
    r"comentou|avalia|avaliou|sofre|sofreu|tem|teve|foi|era|est[aá])\b)"
)
SAFE_AI_TOKENS = set("""
a ao aos as com como da das de do dos e em entre na nas no nos o os ou para pela pelas pelo
pelos por qual quais que se sem sob sobre um uma quando onde apos antes durante mais menos
melhor primeiro proximo seguinte correta incorreta verdadeiro falso
abdome abdominal aberta aberto acesso acidose adulto aerea airway alca amputacao analgesia
anatomia antibiotic antibiotico aorta arteria atendimento atls avaliacao avulsion bacia bala
base bicarbonato bradicardia braco cabeca queimadura queimaduras capilar cardiaco cervical
circulacao choque coagulopatia coluna complicacao compressao conduta consciente controle cranio
cricotireoidostomia cristalide dano danos debito deformidade derrame descompressao diagnostico
dificil distal dreno ecografia extremidade extremidades fast fechado fechada ferida ferimento
fratura gasgow gestante glasgow hemorragia hemorragico hemodinamica hemodinamico hemotorax idoso
imagem inicial instavel intubacao laparotomia lesao liquido macica mecanismo medular membro
neuro neurologico obstrucao oxigenio paciente pelvis pelve pediatria perfusao pneumotorax pressao
procedimento pulso pupila radiografia reanimacao reposicao respiracao ressuscitacao sangue sinal
sindrome sistemico tecnica tempo tce tomografia toracica toracico toracostomia toracotomia torax
trauma traumatismo tratamento tubo ultrassom uti vascular ventilacao via volume xifoide
queda moto atropelamento atropelado atropelada anos ano
""".split())
SAFE_AI_PLACEHOLDER_RE = re.compile(r"\[(?:NAME|EMAIL|CPF|PHONE|TERM)\]")
SAFE_AI_TOKEN_RE = re.compile(r"\[(?:NAME|EMAIL|CPF|PHONE|TERM)\]|[A-Za-zÀ-ÖØ-öø-ÿ]+|\d+(?:[.,]\d+)?|[^\w\s]", re.UNICODE)
def _token_key(token: str) -> str:
    normalized = unicodedata.normalize("NFKD", token)
    return "".join(char for char in normalized if not unicodedata.combining(char)).casefold()


def minimize_for_ai(text: str) -> str:
    """Fail closed: only controlled non-identifying vocabulary crosses the API boundary."""
    minimized: list[str] = []
    for token in SAFE_AI_TOKEN_RE.findall(text):
        if SAFE_AI_PLACEHOLDER_RE.fullmatch(token) or not any(char.isalpha() for char in token):
            replacement = token
        else:
            replacement = token if _token_key(token) in SAFE_AI_TOKENS else "[TERM]"
        if replacement == "[TERM]" and minimized and minimized[-1] == "[TERM]":
            continue
        minimized.append(replacement)
    return " ".join(minimized)


def redact_pii(text: str) -> str:
    text = NAME_LABEL_RE.sub(lambda match: f"{match.group(1)}: [NAME]", text)
    text = PERSON_CONTEXT_RE.sub(lambda match: f"{match.group(1)} [NAME]", text)
    text = COMMON_NAME_RE.sub("[NAME]", text)
    text = PERSON_ACTION_RE.sub("[NAME]", text)
    text = PERSON_BEFORE_CLINICAL_VERB_RE.sub("[NAME]", text)
    text = EMAIL_RE.sub("[EMAIL]", text)
    text = CPF_RE.sub("[CPF]", text)
    return PHONE_RE.sub("[PHONE]", text)


@dataclass(slots=True)
class UsageRecord:
    input_tokens: int
    cached_input_tokens: int
    output_tokens: int
    estimated_cost_usd: float
    status: str


class AIClassifier:
    MODEL = "gpt-5.6-luna"

    def __init__(
        self,
        client: Any | None = None,
        budget_usd: float = 5.0,
        input_usd_per_million: float | None = None,
        cached_input_usd_per_million: float | None = None,
        output_usd_per_million: float | None = None,
        usage_log: str | Path | None = None,
        initial_spend_usd: float = 0.0,
        max_output_tokens: int = 500,
    ):
        if client is None:
            from openai import OpenAI
            client = OpenAI(
                timeout=float(os.getenv("OPENAI_REQUEST_TIMEOUT_SECONDS", "30")),
                max_retries=int(os.getenv("OPENAI_MAX_RETRIES", "0")),
            )
        self.client = client
        self.budget_usd = budget_usd
        self.spent_usd = initial_spend_usd
        self.run_spend_usd = 0.0
        self.input_rate = input_usd_per_million or float(os.getenv("OPENAI_INPUT_USD_PER_M", "1.00"))
        self.cached_input_rate = cached_input_usd_per_million or float(os.getenv("OPENAI_CACHED_INPUT_USD_PER_M", "0.10"))
        self.output_rate = output_usd_per_million or float(os.getenv("OPENAI_OUTPUT_USD_PER_M", "6.00"))
        self.model = os.getenv("OPENAI_MODEL", self.MODEL)
        self.warning_ratio = min(1.0, max(0.0, float(os.getenv("OPENAI_BUDGET_WARNING_PERCENT", "70")) / 100))
        self.max_output_tokens = max_output_tokens
        self.usage_log = Path(usage_log) if usage_log else None
        self.input_tokens = 0
        self.cached_input_tokens = 0
        self.output_tokens = 0

    @property
    def budget_warning(self) -> bool:
        return self.spent_usd >= self.budget_usd * self.warning_ratio

    @staticmethod
    def _pending_budget() -> Classification:
        return Classification(
            analysis_role="academic", primary_topic="Outros", subtopic="Pendente de orçamento",
            cognitive_task="outro", bloom="compreender", predicted_difficulty="medium", confidence=0,
            rationale="Orçamento mensal insuficiente", needs_review=True, status="pending_budget",
        )

    @staticmethod
    def _failed() -> Classification:
        return Classification(
            analysis_role="academic",
            primary_topic="Outros",
            subtopic="Classificação automática indisponível",
            cognitive_task="outro",
            bloom="compreender",
            predicted_difficulty="medium",
            confidence=0,
            rationale="Classificação automática indisponível; requer revisão humana",
            needs_review=True,
            status="failed",
        )

    def _record_response_usage(self, response: Any, status: str) -> None:
        usage = getattr(response, "usage", None)
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        input_details = getattr(usage, "input_tokens_details", None)
        cached_input_tokens = min(input_tokens, int(getattr(input_details, "cached_tokens", 0) or 0))
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        self.input_tokens += input_tokens
        self.cached_input_tokens += cached_input_tokens
        self.output_tokens += output_tokens
        cost = ((input_tokens - cached_input_tokens) * self.input_rate + cached_input_tokens * self.cached_input_rate + output_tokens * self.output_rate) / 1_000_000
        self.spent_usd += cost
        self.run_spend_usd += cost
        self._log(UsageRecord(input_tokens, cached_input_tokens, output_tokens, cost, status))

    def classify(self, question: str, choices: list[str] | tuple[str, ...]) -> Classification:
        reserve = self.max_output_tokens * self.output_rate / 1_000_000
        if self.spent_usd + reserve > self.budget_usd:
            self._log(UsageRecord(0, 0, 0, 0.0, "pending_budget"))
            return self._pending_budget()
        safe = json.dumps({
            "question": minimize_for_ai(redact_pii(question)),
            "choices": [minimize_for_ai(redact_pii(str(choice))) for choice in choices],
        }, ensure_ascii=False)
        prompt = (
            "Classifique a questão médica usando exclusivamente a taxonomia permitida. "
            "Não tente reconstruir dados pessoais redigidos. Entrada: " + safe
        )
        try:
            response = self.client.responses.parse(
                model=self.model,
                reasoning={"effort": "low"},
                store=False,
                input=prompt,
                text_format=Classification,
                max_output_tokens=self.max_output_tokens,
            )
            result = response.output_parsed
            if result is None:
                raise RuntimeError("Structured classification was not returned")
        except Exception:
            self._log(UsageRecord(0, 0, 0, 0.0, "failed"))
            return self._failed()
        if result.confidence < 0.80:
            result.needs_review = True
            result.status = "needs_review"
        self._record_response_usage(response, result.status)
        return result

    def classify_batch(
        self,
        requests: list[tuple[str, list[str] | tuple[str, ...]]],
    ) -> list[Classification]:
        if not requests:
            return []
        output_limit = self.max_output_tokens * len(requests)
        reserve = output_limit * self.output_rate / 1_000_000
        if self.spent_usd + reserve > self.budget_usd:
            for _ in requests:
                self._log(UsageRecord(0, 0, 0, 0.0, "pending_budget"))
            return [self._pending_budget() for _ in requests]
        safe_items = [{
            "index": index,
            "question": minimize_for_ai(redact_pii(question)),
            "choices": [minimize_for_ai(redact_pii(str(choice))) for choice in choices],
        } for index, (question, choices) in enumerate(requests)]
        prompt = (
            "Classifique cada questão médica, preservando a ordem e usando exclusivamente a taxonomia permitida. "
            "Retorne exatamente um item por entrada. Não tente reconstruir dados pessoais redigidos. Entrada: "
            + json.dumps(safe_items, ensure_ascii=False)
        )
        try:
            response = self.client.responses.parse(
                model=self.model,
                reasoning={"effort": "low"},
                store=False,
                input=prompt,
                text_format=ClassificationBatch,
                max_output_tokens=output_limit,
            )
            parsed = response.output_parsed
            if parsed is None or len(parsed.items) != len(requests):
                raise RuntimeError("Structured batch classification count mismatch")
            results = parsed.items
        except Exception:
            for _ in requests:
                self._log(UsageRecord(0, 0, 0, 0.0, "failed"))
            return [self._failed() for _ in requests]
        for result in results:
            if result.confidence < 0.80:
                result.needs_review = True
                result.status = "needs_review"
        status = "needs_review" if any(result.needs_review for result in results) else "classified"
        self._record_response_usage(response, status)
        return results

    @property
    def usage_summary(self) -> dict[str, float | int | bool]:
        return {
            "input_tokens": self.input_tokens, "cached_input_tokens": self.cached_input_tokens, "output_tokens": self.output_tokens,
            "estimated_cost_usd": self.run_spend_usd, "monthly_spend_usd": self.spent_usd, "budget_usd": self.budget_usd,
            "budget_warning": self.budget_warning,
        }

    def _log(self, usage: UsageRecord) -> None:
        if not self.usage_log:
            return
        self.usage_log.parent.mkdir(parents=True, exist_ok=True)
        with self.usage_log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({**asdict(usage), "cumulative_cost_usd": self.spent_usd}) + "\n")
