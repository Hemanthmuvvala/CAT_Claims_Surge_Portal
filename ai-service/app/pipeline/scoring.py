"""Node ⑤ — deterministic scoring from extracted tags.

The LLM never computes the score. Weights are fixed, documented in the CAT
response SOP, and each factor shown to the manager carries its exact weight;
the displayed weights sum to the score (explainability invariant).
"""
from __future__ import annotations

import re

from ..schemas import ExtractedTags, PriorityFactor, ScoreRequest, ScoreResponse

SEVERITY_WEIGHT = {"critical": 43, "high": 30, "medium": 17, "low": 6}
HARDSHIP_WEIGHT = 22
WATER_WEIGHT = 20
FIRE_WEIGHT = 22
MEDICAL_WEIGHT = 13
URGENCY_WEIGHT = 10
CAP = 97

WATER_PERILS = re.compile(r"flood|surge|water|rain|ingress|leak", re.I)
FIRE_PERILS = re.compile(r"fire|flame|smoke|burn|combustion|ash", re.I)
MEDICAL_RE = re.compile(r"medical|device|elderly|children|child|baby|infant|oxygen|disabled|hospital", re.I)
URGENCY_RE = re.compile(
    r"rising water|open[- ]to[- ]weather|exposed to weather|evacuat|trapped|unsafe|collapse|safety hazard|no power|without (?:power|electricity|water)",
    re.I,
)


def _detail_severity(sev: str) -> str:
    return {
        "critical": "Reported structural damage and safety risk at the property.",
        "high": "Significant damage reported; habitability may be affected.",
        "medium": "Moderate damage; property is still habitable.",
        "low": "Minor damage reported.",
    }.get(sev, "Moderate damage; property is still habitable.")


def build_factors_and_score(
    claim: ScoreRequest, tags: ExtractedTags
) -> tuple[list[PriorityFactor], int]:
    factors: list[PriorityFactor] = []

    def add_factor(label: str, weight: int, detail: str) -> None:
        used = sum(f.weight for f in factors)
        applied = min(weight, max(0, CAP - used))
        if applied < weight:
            detail = f"{detail} Score cap applied; {applied} of {weight} points counted."
        factors.append(
            PriorityFactor(
                label=label,
                weight=applied,
                detail=detail,
            )
        )

    add_factor(
        label=f"{claim.severity.capitalize()} severity reported",
        weight=SEVERITY_WEIGHT.get(claim.severity, 17),
        detail=_detail_severity(claim.severity),
    )
    hardship_sources = list(claim.hardshipFlags) + [
        s for s in tags.hardship_signals if s.lower() not in {h.lower() for h in claim.hardshipFlags}
    ]
    if claim.hardshipFlags or tags.hardship_signals:
        add_factor(
            "Vulnerability / hardship signals",
            HARDSHIP_WEIGHT,
            "; ".join(hardship_sources[:6]) + ".",
        )
    if (claim.hardshipFlags or tags.hardship_signals) and (MEDICAL_RE.search(" ".join(hardship_sources)) or tags.vulnerable_household):
        add_factor(
            "Vulnerable household — expedite",
            MEDICAL_WEIGHT,
            "Medical dependency or vulnerable person flagged — welfare risk grows with delay.",
        )
    if WATER_PERILS.search(claim.peril) or tags.peril_type == "water":
        add_factor(
            "Active water ingress",
            WATER_WEIGHT,
            "Water-related peril reported — deterioration risk.",
        )
    if FIRE_PERILS.search(claim.peril) or tags.peril_type == "fire":
        add_factor(
            "Active fire / combustion damage",
            FIRE_WEIGHT,
            "Fire-related peril reported — progressive deterioration and safety risk.",
        )
    urgency_match = URGENCY_RE.search(claim.description)
    if tags.urgency_indicators or urgency_match:
        detail = "Time pressure in claim text: " + "; ".join(tags.urgency_indicators[:3]) if tags.urgency_indicators else f"Time pressure described in the claim: {urgency_match.group(0)}."
        add_factor(
            "Urgency / time pressure",
            URGENCY_WEIGHT,
            detail,
        )
    score = sum(f.weight for f in factors)
    return factors, score
