"""Node ④ — RAG coverage check. Hybrid retrieval from Chroma, then llama3.1
answers strictly from the retrieved chunks WITH citations. Below the similarity
floor → refused=True (grounded-or-refuse, BRIEF §15)."""
from __future__ import annotations

from ..config import settings
from ..kb import kb
from ..llm import structured_call
from ..schemas import CoverageVerdict, ScoreRequest

SYSTEM = (
    "You answer insurance coverage questions using ONLY the provided policy "
    "excerpts. Every statement must be traceable to an excerpt. If the excerpts "
    "do not clearly answer the question, set \"covered\" to \"unclear\" and say "
    "what is missing. Never invent policy terms, dollar figures or clause names."
)

PROMPT = """Policy excerpts retrieved for this claim:

{excerpts}

Claim to check:
- Peril: {peril}
- Self-declared severity: {severity}
- Description (PII-masked): {description}
- Hardship flags: {hardship}
- Documents attached: {documents}

Question: Is this loss plausibly covered under the policy, what deductible or
endorsement condition applies, and what evidence is required next?

Return JSON with exactly these keys:
- "covered": one of yes, no, unclear
- "explanation": max 80 words, grounded in the excerpts, cite like [S1]
- "citations": array of {{"source", "ref", "quote"}} — maximum 2 entries, the
  strongest supporting excerpts only; source = document title from the excerpt
  header; ref = the section marker; quote = the exact supporting sentence
  (max 40 words).
- "evidence_required": list of next documents the adjuster should request.
"""


def coverage_check(claim: ScoreRequest, masked_description: str) -> tuple[CoverageVerdict, float]:
    s = settings()
    query = f"{claim.peril} {masked_description[:400]} coverage deductible endorsement"
    hits = kb().retrieve(query)
    if not hits:
        return CoverageVerdict(refused=True, explanation="Knowledge base unavailable — no excerpts retrieved."), 0.0

    best = max(float(h.metadata.get("vecScore", 0.0)) for h in hits)
    if best < s.rag_min_similarity:
        return CoverageVerdict(
            refused=True,
            explanation="Retrieved excerpts were not relevant enough to ground a coverage answer — escalating to human review instead of guessing.",
        ), best

    excerpts = "\n\n".join(
        f"[S{i+1}] source={h.metadata.get('source','?')} ref={h.metadata.get('section','?')}\n{h.page_content}"
        for i, h in enumerate(hits[:3])
    )
    verdict, _, _ = structured_call(
        PROMPT.format(
            excerpts=excerpts,
            peril=claim.peril,
            severity=claim.severity,
            description=masked_description,
            hardship=", ".join(claim.hardshipFlags) or "none",
            documents=", ".join(claim.documents) or "none",
        ),
        CoverageVerdict,
        system=SYSTEM,
        num_predict=512,
    )
    return verdict, best
