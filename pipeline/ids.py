from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from typing import Any


def _normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    return re.sub(r"\s+", " ", text).strip().casefold()


def stable_id(namespace: str, *parts: Any) -> str:
    canonical = "\x1f".join(_normalize(part) for part in parts)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]
    return f"{namespace}_{digest}"


def content_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

