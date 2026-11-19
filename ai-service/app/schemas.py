"""Fixed Pydantic shapes between every pipeline step (BRIEF: 'fixed data shape').

The Node backend consumes ScoreResponse verbatim — field names are the contract.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

ScoringMethod = Literal["ai_assisted", "rules_fallback"]
EvidenceState = Literal["available", "partial", "missing"]


class ScoreRequest(BaseModel):
    """POST /score body — sent by the Node backend."""

    claimId: str
    severity: str = Field(pattern="^(critical|high|medium|low)$")
    peril: str
    hardshipFlags: list[str] = Field(default_factory=list, max_length=10)
    description: str = Field(max_length=4000)
    policyId: Optional[str] = None
    documents: list[str] = Field(default_factory=list, max_length=20)
    location: Optional[str] = None
    eventId: Optional[str] = None


class ExtractedTags(BaseModel):
    """Node ③ output — what the LLM extracted from the claim text.

    The LLM only *labels*; the deterministic scorer turns labels into a number.
    """

    peril_type: Literal["wind", "water", "fire", "impact", "other"] = "other"
    damage_type: Literal["structural", "content", "landscape", "vehicle", "unclear"] = "unclear"
    severity_signals: list[str] = Field(default_factory=list, max_length=8)
    hardship_signals: list[str] = Field(default_factory=list, max_length=8)
    urgency_indicators: list[str] = Field(default_factory=list, max_length=8)
    documents_referenced: list[str] = Field(default_factory=list, max_length=10)
    summary: str = Field(max_length=400, default="")
    vulnerable_household: bool = False  # explicit label: medical/elderly/children dependency


class CoverageCitation(BaseModel):
    source: str = Field(max_length=200)
    ref: str = Field(max_length=200)
    quote: str = Field(max_length=600)


class CoverageVerdict(BaseModel):
    """Node ? output - RAG-grounded coverage check with citations."""

    covered: Literal["yes", "no", "unclear"] = "unclear"
    explanation: str = Field(max_length=600, default="")
    citations: list[CoverageCitation] = Field(default_factory=list, max_length=5)
    evidence_required: list[str] = Field(default_factory=list, max_length=6)
    refused: bool = False  # true when retrieval could not support an answer


class AnalysisRaw(BaseModel):
    """Single-call analysis output: tags + coverage in one bounded JSON blob."""

    peril_type: Literal["wind", "water", "fire", "impact", "other"] = "other"
    damage_type: Literal["structural", "content", "landscape", "vehicle", "unclear"] = "unclear"
    severity_signals: list[str] = Field(default_factory=list, max_length=8)
    hardship_signals: list[str] = Field(default_factory=list, max_length=8)
    urgency_indicators: list[str] = Field(default_factory=list, max_length=8)
    documents_referenced: list[str] = Field(default_factory=list, max_length=10)
    summary: str = Field(max_length=400, default="")
    vulnerable_household: bool = False
    covered: Literal["yes", "no", "unclear"] = "unclear"
    explanation: str = Field(max_length=600, default="")
    citations: list[CoverageCitation] = Field(default_factory=list, max_length=2)
    evidence_required: list[str] = Field(default_factory=list, max_length=3)


class ClusterSuggestion(BaseModel):
    clusterId: Optional[str] = None  # None  propose a NEW cluster
    similarity: float = Field(ge=0.0, le=1.0, default=0.0)
    basis: str = Field(max_length=200, default="")


class PriorityFactor(BaseModel):
    label: str = Field(max_length=120)
    weight: int = Field(ge=0, le=100)
    detail: str = Field(max_length=400, default="")


class ScoreResponse(BaseModel):
    """The one contract shape every run must satisfy before leaving the service."""

    claimId: str
    score: int = Field(ge=0, le=100)
    factors: list[PriorityFactor] = Field(min_length=1)
    tags: ExtractedTags
    coverage: CoverageVerdict
    coverageEvidence: list[CoverageCitation] = Field(default_factory=list)
    evidenceState: EvidenceState = "partial"
    scoringMethod: ScoringMethod = "ai_assisted"
    needsHumanReview: Literal[True] = True  # AI can never waive human review
    warnings: list[str] = Field(default_factory=list)
    clusterSuggestion: Optional[ClusterSuggestion] = None
    processedAt: str
    latencyMs: int = Field(default=0, ge=0)
    tokensPrompt: int = 0
    tokensCompletion: int = 0
    costUsd: float = 0.0  # local Ollama → always $0.00

    @field_validator("factors")
    @classmethod
    def weights_sum_to_score(cls, v: list[PriorityFactor], info) -> list[PriorityFactor]:
        # Explainability invariant: displayed factor weights sum to the score.
        total = sum(f.weight for f in v)
        if "score" in info.data and total != info.data["score"]:
            raise ValueError(f"factor weights sum {total} != score {info.data['score']}")
        return v


class HealthResponse(BaseModel):
    status: Literal["operational", "degraded", "unavailable"]
    llm: str
    embedder: str
    kbDocuments: int
    kbChunks: int
    note: str = ""
