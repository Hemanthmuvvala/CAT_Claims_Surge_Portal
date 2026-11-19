"""Node ① — PII masking (Presidio) on every free-text field before it reaches
any LLM prompt or log line (BRIEF: 'mask the obvious PII/PHI in inputs, logs
and prompts')."""
from __future__ import annotations

import re
from functools import lru_cache

from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

from ..config import settings

# Presidio's default PHONE_NUMBER recognizer misses short local forms
# (e.g. "555-0199"); catch those with a supplemental pass. The (?<!\d) /
# (?!\d) guards keep it from biting into longer digit runs like card numbers.
_SHORT_PHONE_RE = re.compile(r"(?<![\d-])\d{3}[-. ]\d{4}(?!\d)")


@lru_cache
def engines() -> tuple[AnalyzerEngine, AnonymizerEngine]:
    analyzer = AnalyzerEngine()
    return analyzer, AnonymizerEngine()


class MaskResult:
    def __init__(self, text: str, masked_count: int) -> None:
        self.text = text
        self.masked_count = masked_count


def mask_pii(text: str) -> MaskResult:
    if not text or not settings().pii_enabled:
        return MaskResult(text or "", 0)
    analyzer, anonymizer = engines()
    results = analyzer.analyze(text=text, language="en")
    out = anonymizer.anonymize(text=text, analyzer_results=results).text
    count = len(results)

    supplemental, n = _SHORT_PHONE_RE.subn("<PHONE_NUMBER>", out)
    if n:
        out, count = supplemental, count + n
    return MaskResult(out, count)
