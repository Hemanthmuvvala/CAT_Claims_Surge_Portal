"""Node ③ — tag extraction. llama3.1 turns the masked claim text into a
validated ExtractedTags object. The LLM labels; it never scores."""
from __future__ import annotations

from ..llm import structured_call
from ..schemas import ExtractedTags, ScoreRequest

SYSTEM = (
    "You label property-insurance catastrophe claims for triage. Extract facts "
    "ONLY from the claim text given. Do not invent damages, people, dates or "
    "policy terms. Output strictly-valid JSON."
)

PROMPT = """Label this catastrophe claim.

Self-declared severity: {severity}
Reported peril: {peril}
Hardship flags recorded by intake: {hardship}
Attached documents: {documents}
Location: {location}

Claim description:
\"\"\"{description}\"\"\"

Return JSON with exactly these keys:
- "peril_type": one of wind, water, fire, impact, other
- "damage_type": one of structural, content, landscape, vehicle, unclear
- "severity_signals": short phrases in the text indicating damage seriousness
  (e.g. "roof torn off", "water above power sockets"). [] if none.
- "hardship_signals": short phrases indicating displacement, medical need,
  children/elderly exposure, lost livelihood or utilities. [] if none.
- "urgency_indicators": anything implying time pressure (rising water,
  open-to-weather structure, safety hazard). [] if none.
- "documents_referenced": documents the text itself mentions. [] if none.
- "summary": one neutral sentence, max 40 words.
"""


def extract_tags(claim: ScoreRequest, masked_description: str) -> tuple[ExtractedTags, int, int]:
    prompt = PROMPT.format(
        severity=claim.severity,
        peril=claim.peril,
        hardship=", ".join(claim.hardshipFlags) or "none",
        documents=", ".join(claim.documents) or "none",
        location=claim.location or "not given",
        description=masked_description,
    )
    return structured_call(prompt, ExtractedTags, system=SYSTEM, num_predict=300)
