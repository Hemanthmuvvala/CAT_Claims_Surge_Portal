"""LangGraph pipeline — the one bounded state-graph per claim (BRIEF §09).

ingest → guard → analyze → score → cluster → output

Node ③ (analyze) is a single bounded LLM call producing tags + coverage
together — halving per-claim latency on the local 8B model. Guardrails:
Pydantic validation at every node boundary; one repair retry per LLM call;
any node failure raises and the caller (Node backend) falls back to its
deterministic rules scorer. Nothing waits unbounded.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional, TypedDict

from langgraph.graph import END, StateGraph

from .config import settings
from .observability import span
from .pipeline.analyze import analyze_claim
from .pipeline.cluster import suggest_cluster
from .pipeline.guard import GuardVerdict, check_injection
from .pipeline.pii import mask_pii
from .pipeline.scoring import build_factors_and_score
from .schemas import (
    CoverageVerdict,
    ExtractedTags,
    ScoreRequest,
    ScoreResponse,
)


class RunState(TypedDict, total=False):
    claim: ScoreRequest
    masked_description: str
    pii_masked_count: int
    guard_result: GuardVerdict
    tags_result: ExtractedTags
    coverage_result: CoverageVerdict
    rag_best_similarity: float
    factors: list
    score_value: int
    cluster_json: Optional[dict]
    cluster_vector: Optional[list]
    tokens_prompt: int
    tokens_completion: int
    response: object
    run_latency_ms: float


# ------------------------------------------------------------------ nodes

def node_ingest(state: RunState) -> RunState:
    with span("ai.node.ingest", {"claim": state["claim"].claimId}):
        m = mask_pii(state["claim"].description)
        state["masked_description"] = m.text
        state["pii_masked_count"] = m.masked_count
    return state


def node_guard(state: RunState) -> RunState:
    with span("ai.node.guard", {"claim": state["claim"].claimId}):
        verdict = check_injection(state["masked_description"])
        state["guard_result"] = verdict
        if not verdict.passed:
            # Flagged claims never get an AI score â€” human-only handling.
            raise InjectionRefused(verdict.hits)
    return state


class InjectionRefused(RuntimeError):
    def __init__(self, hits: list[str]) -> None:
        super().__init__("prompt-injection guard tripped")
        self.hits = hits


def node_analyze(state: RunState) -> RunState:
    with span("ai.node.analyze", {"claim": state["claim"].claimId}):
        tags, coverage, best, pt, ct = analyze_claim(state["claim"], state["masked_description"])
        state["tags_result"] = tags
        state["coverage_result"] = coverage
        state["rag_best_similarity"] = best
        state["tokens_prompt"] += pt
        state["tokens_completion"] += ct
    return state


def node_score(state: RunState) -> RunState:
    with span("ai.node.score", {"claim": state["claim"].claimId}):
        factors, score = build_factors_and_score(state["claim"], state["tags_result"])
        state["factors"] = factors
        state["score_value"] = score
    return state


def node_cluster(state: RunState) -> RunState:
    with span("ai.node.cluster", {"claim": state["claim"].claimId}):
        suggestion, vector = suggest_cluster(state["claim"])
        state["cluster_json"] = suggestion.model_dump() if suggestion else None
        state["cluster_vector"] = vector
    return state


def node_output(state: RunState) -> RunState:
    with span("ai.node.output", {"claim": state["claim"].claimId}):
        s = settings()
        warnings: list[str] = []
        cov = state["coverage_result"]
        if cov.refused:
            warnings.append(
                "Coverage check refused: retrieved policy excerpts were insufficient â€” answer not grounded, escalated to human review."
            )
        elif cov.covered == "unclear":
            warnings.append("Coverage verdict unclear â€” adjuster must verify against the cited sections.")
        else:
            warnings.append("Coverage answer grounded in cited policy excerpts.")
        if not state["claim"].documents:
            warnings.append("No supporting documents attached; evidence not yet verified.")
        if state.get("pii_masked_count"):
            warnings.append(f"{state['pii_masked_count']} PII element(s) masked before processing.")

        evidence_state = (
            "available" if state["claim"].documents
            else "partial" if state["claim"].policyId
            else "missing"
        )

        from .pipeline.cluster import cluster_index

        if state.get("cluster_vector") and state["cluster_json"] and state["cluster_json"].get("clusterId"):
            cluster_index().upsert(
                state["cluster_json"]["clusterId"],
                state["claim"].location or state["claim"].claimId,
                state["cluster_vector"],
            )

        response = ScoreResponse(
            claimId=state["claim"].claimId,
            score=state["score_value"],
            factors=state["factors"],
            tags=state["tags_result"],
            coverage=cov,
            coverageEvidence=cov.citations,
            evidenceState=evidence_state,
            scoringMethod="ai_assisted",
            needsHumanReview=True,
            warnings=warnings,
            clusterSuggestion=state["cluster_json"],
            processedAt=datetime.now(timezone.utc).isoformat(),
            latencyMs=state.get("run_latency_ms", 0),
            tokensPrompt=state["tokens_prompt"],
            tokensCompletion=state["tokens_completion"],
            costUsd=0.0,
        )
        state["response"] = response
    return state


# ------------------------------------------------------------------ graph

def build_graph():
    g = StateGraph(RunState)
    g.add_node("ingest", node_ingest)
    g.add_node("guard", node_guard)
    g.add_node("analyze", node_analyze)
    g.add_node("score", node_score)
    g.add_node("cluster", node_cluster)
    g.add_node("output", node_output)
    g.set_entry_point("ingest")
    g.add_edge("ingest", "guard")
    g.add_edge("guard", "analyze")
    g.add_edge("analyze", "score")
    g.add_edge("score", "cluster")
    g.add_edge("cluster", "output")
    g.add_edge("output", END)
    return g.compile()


_app = None


def run_score(claim: ScoreRequest) -> ScoreResponse:
    """Execute the full graph for one claim. Raises on guard trip or failure â€”
    the HTTP layer maps that onto refusal/fallback semantics."""
    global _app
    if _app is None:
        _app = build_graph()
    state: RunState = {
        "claim": claim,
        "masked_description": "",
        "pii_masked_count": 0,
        "tokens_prompt": 0,
        "tokens_completion": 0,
    }
    t0 = time.perf_counter()
    with span("ai.run", {"claim": claim.claimId, "model": settings().llm_model}):
        state = _app.invoke(state)
    state["run_latency_ms"] = int((time.perf_counter() - t0) * 1000)
    # node_output already ran inside the graph and consumed run_latency_ms=0;
    # rebuild latency stamp here to keep the value honest.
    resp = state["response"]
    resp.latencyMs = int((time.perf_counter() - t0) * 1000)
    return resp


