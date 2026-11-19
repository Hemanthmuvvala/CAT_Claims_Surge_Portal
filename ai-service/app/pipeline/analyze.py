"""Node ③ — single-pass analysis (speed-optimized).

One bounded llama call produces BOTH the claim tags AND the RAG-grounded
coverage verdict, halving per-claim latency versus the old two-call design.
Retrieval still gates the call: below the similarity floor we refuse without
touching the model (grounded-or-refuse, BRIEF 15).
"""
from __future__ import annotations

from ..config import settings
from ..kb import kb
from ..llm import structured_call
from ..schemas import AnalysisRaw, CoverageVerdict, ExtractedTags, ScoreRequest

SYSTEM = (
    "You label property-insurance catastrophe claims AND answer coverage "
    "questions using ONLY the provided policy excerpts. Extract facts only from "
    "the claim text; never invent damages, people, dates, dollar figures or "
    "clause names. If the excerpts do not clearly answer coverage, set "
    "\"covered\" to \"unclear\". Output strictly-valid JSON."
)

PROMPT = """Policy excerpts retrieved for this claim:

{excerpts}

Claim to analyse:
- Self-declared severity: {severity}
- Reported peril: {peril}
- Hardship flags recorded by intake: {hardship}
- Attached documents: {documents}
- Location: {location}

Claim description (PII-masked):
\"\"\"{description}\"\"\"

Return ONE JSON object with exactly these keys:
- "peril_type": one of wind, water, fire, impact, other
- "damage_type": one of structural, content, landscape, vehicle, unclear
  (garden, plants, shrubs, trees, hedges, lawns or outdoor vegetation = landscape;
  personal belongings inside the property = content)
- "severity_signals": short phrases indicating damage seriousness (max 4). [] if none.
- "hardship_signals": short phrases about displacement, medical need,
  children/elderly, utilities lost (max 4). [] if none.
- "urgency_indicators": anything implying time pressure like rising water or
  open-to-weather structure (max 3). [] if none.
- "documents_referenced": documents the text itself mentions. [] if none.
- "summary": one neutral sentence, max 30 words.
- "vulnerable_household": true if the text indicates a medical device, elderly,
  young children, disability or hospital dependency in the household.
- "covered": one of yes, no, unclear - judged ONLY from the excerpts.
- "explanation": max 60 words grounded in the excerpts, cite like [S1].
- "citations": max 2 entries {{"source", "ref", "quote"}} - the strongest
  supporting excerpts; quote = exact sentence (max 40 words).
- "evidence_required": up to 3 next documents the adjuster should request.
"""


def _excerpts_block(hits) -> str:
    parts = []
    for i, h in enumerate(hits[:2]):
        content = (h.page_content or "")[:800]
        parts.append(
            f"[S{i+1}] source={h.metadata.get('source','?')} ref={h.metadata.get('section','?')}\n{content}"
        )
    return "\n\n".join(parts)


# Deterministic tag guard: outdoor vegetation losses are landscape damage.
# Small models sometimes label a destroyed garden as "content"; when the text
# clearly describes garden/vegetation damage we normalise the label.
import re as _re

LANDSCAPE_RE = _re.compile(
    r"garden|plant|shrub|hedge|tree|lawn|flowerbed|flower bed|vegetation|landscap|veg patch",
    _re.I,
)


def _guard_landscape(damage_type: str, masked_description: str) -> str:
    if damage_type in ("content", "unclear") and LANDSCAPE_RE.search(masked_description or ""):
        return "landscape"
    return damage_type


def _clean_list(items) -> list[str]:
    """Strip blank/whitespace entries the small model sometimes emits.

    Empty strings are dangerous downstream: scoring treats a non-empty
    hardship_signals / urgency_indicators list as a present signal, and blank
    entries would fabricate +22/+10 points.
    """
    return [s for s in (str(i).strip() for i in (items or [])) if s]


def _clean_documents_referenced(items, masked_description: str) -> list[str]:
    """Keep only documents the claim text itself mentions.

    The retrieved policy excerpts list 'required documents' columns, and the
    model tends to echo them — inventing document references the claimant
    never made.
    """
    cleaned = _clean_list(items)
    text = (masked_description or "").lower()
    return [d for d in cleaned if d.lower() in text]


def analyze_claim(claim: ScoreRequest, masked_description: str):
    """Returns (tags, coverage, best_similarity, prompt_tokens, completion_tokens)."""
    s = settings()
    query = f"{claim.peril} {masked_description[:400]} coverage deductible endorsement"
    hits = kb().retrieve(query)

    if not hits:
        coverage = CoverageVerdict(refused=True, explanation="Knowledge base unavailable - no excerpts retrieved.")
        return ExtractedTags(), coverage, 0.0, 0, 0

    best = max(float(h.metadata.get("vecScore", 0.0)) for h in hits)
    if best < s.rag_min_similarity:
        coverage = CoverageVerdict(
            refused=True,
            explanation="Retrieved excerpts were not relevant enough to ground a coverage answer - escalating to human review instead of guessing.",
        )
        return ExtractedTags(), coverage, best, 0, 0

    raw, pt, ct = structured_call(
        PROMPT.format(
            excerpts=_excerpts_block(hits),
            peril=claim.peril,
            severity=claim.severity,
            hardship=", ".join(claim.hardshipFlags) or "none",
            documents=", ".join(claim.documents) or "none",
            location=claim.location or "not given",
            description=masked_description,
        ),
        AnalysisRaw,
        system=SYSTEM,
        num_predict=420,
    )

    tags = ExtractedTags(
        peril_type=raw.peril_type,
        damage_type=_guard_landscape(raw.damage_type, masked_description),
        severity_signals=_clean_list(raw.severity_signals),
        hardship_signals=_clean_list(raw.hardship_signals),
        urgency_indicators=_clean_list(raw.urgency_indicators),
        documents_referenced=_clean_documents_referenced(raw.documents_referenced, masked_description),
        summary=raw.summary,
        vulnerable_household=raw.vulnerable_household,
    )
    coverage = CoverageVerdict(
        covered=raw.covered,
        explanation=raw.explanation,
        citations=raw.citations,
        evidence_required=raw.evidence_required,
        refused=False,
    )
    return tags, coverage, best, pt, ct
