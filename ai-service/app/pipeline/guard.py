"""Node ② — prompt-injection guard on claimant free text.

Deterministic heuristics at runtime (cheap, zero-LLM), plus the mandated
garak offline scan that lives in evals/run_garak_scan.py. A hit does NOT score
the claim — it flags it for human-only handling and marks the run refused.
"""
from __future__ import annotations

import re

INJECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("instruction_override", re.compile(r"ignore (all|any|the above|previous).{0,40}instructions", re.I)),
    ("role_hijack", re.compile(
        r"(you\s+are\s+now|act(?:ing)?\s+as|pretend\s+to\s+be|from\s+now\s+on\s+you\s+are|operate\s+as)"
        r"\s+(the\s+|a\s+|an\s+|our\s+)?(system\s+)?"
        r"(administrator|superuser|developer|root|admin|system)\b",
        re.I,
    )),
    ("tag_smuggling", re.compile(r"</?(system|assistant|tool|document)>", re.I)),
    ("policy_injection", re.compile(r"(this claim|the policy|the report)\s+(is|was|are|were|has been|have been)\s+(approved|pre-approved|covered)\s+by\s+(management|the insurer|underwriting)", re.I)),
    ("authority_spoof", re.compile(r"\b(pre-?approved|preapproved)\s+(this|the)\s+claim\b", re.I)),
    ("authority_spoof2", re.compile(r"(insurer|management|underwriter|underwriting)\s+(has\s+)?(already\s+)?pre-?approved\b", re.I)),
    ("coverage_directive", re.compile(r"treat\s+(the\s+|this\s+|it\s+)?(whole\s+|entire\s+)?(claim|loss|case|report|policy)\b.{0,20}\bas\s+(covered|approved|pre-?approved)", re.I)),
    ("exfil_attempt", re.compile(r"(print|reveal|output|repeat)\s+(your|the)\s+(system prompt|instructions|rules)", re.I)),
    ("delimiter_spoof", re.compile(r"\[?SYSTEM\]|\[?INST\]|<\|(im_start|im_end|endoftext)\|>", re.I)),
    ("urgent_override", re.compile(r"(auto-?approve|skip (all|the) (checks|review|verification)|waive (all|the) (checks|review|verification|safety|guardrails))", re.I)),
]


class GuardVerdict:
    def __init__(self, passed: bool, hits: list[str]) -> None:
        self.passed = passed
        self.hits = hits


# Invisible characters attackers use to split keywords past naive regexes.
_INVISIBLE_RE = re.compile(r"[\u200b\u200c\u200d\u2060\ufeff]")
_NBSP_RE = re.compile(r"[\u00a0]")


def _normalise(text: str) -> str:
    cleaned = _INVISIBLE_RE.sub("", text or "")
    return _NBSP_RE.sub(" ", cleaned)


def check_injection(text: str) -> GuardVerdict:
    hits = [name for name, pattern in INJECTION_PATTERNS if pattern.search(_normalise(text))]
    return GuardVerdict(passed=not hits, hits=hits)
