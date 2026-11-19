"""INS-04 AI service — FastAPI entrypoint.

Endpoints:
  POST /score           — full triage run for one claim (Node calls this)
  GET  /health          — liveness + provider status for the Node health rollup
  POST /clusters/sync   — push known cluster centroids for embedding match

Safety posture (BRIEF §09/§15): grounded-or-refuse, bounded retries, PII
masking before any prompt, human review can never be waived, local-only LLM.
"""
from __future__ import annotations

import time
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import settings
from .graph import InjectionRefused, run_score
from .kb import kb
from .llm import embeddings
from .observability import span
from .pipeline.cluster import cluster_index
from .schemas import HealthResponse, ScoreRequest, ScoreResponse

app = FastAPI(title="INS-04 AI service", version="1.0.0")

_started_at = time.time()


class ClusterSyncItem(BaseModel):
    clusterId: str
    label: str
    sampleText: str = Field(max_length=2000)


class ClusterSyncRequest(BaseModel):
    clusters: list[ClusterSyncItem] = Field(default_factory=list, max_length=200)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        store = kb()
        n_chunks, n_docs = store.chunk_count, store.doc_count()
    except Exception as e:  # KB unavailable → degraded, not dead
        return HealthResponse(
            status="degraded", llm=settings().llm_model, embedder=settings().embed_model,
            kbDocuments=0, kbChunks=0, note=f"knowledge base unavailable: {e}",
        )
    try:
        embeddings().embed_query("health probe")
    except Exception as e:
        return HealthResponse(
            status="unavailable", llm=settings().llm_model, embedder=settings().embed_model,
            kbDocuments=n_docs, kbChunks=n_chunks, note=f"embedder unreachable: {e}",
        )
    return HealthResponse(
        status="operational", llm=settings().llm_model, embedder=settings().embed_model,
        kbDocuments=n_docs, kbChunks=n_chunks,
        note=f"local {settings().llm_model} via Ollama — grounded-or-refuse, $0/claim",
    )


@app.post("/score", response_model=ScoreResponse)
def score(claim: ScoreRequest) -> ScoreResponse:
    t0 = time.perf_counter()
    with span("ai.http.score", {"claim": claim.claimId}):
        try:
            return run_score(claim)
        except InjectionRefused as e:
            # Refusal is a SAFE, CONTRACT-SHAPED outcome: no score invented,
            # flagged for human-only handling (BRIEF: refuse when unsupported).
            from datetime import datetime, timezone

            from .schemas import PriorityFactor

            raise HTTPException(
                status_code=422,
                detail={
                    "refusal": "prompt_injection",
                    "hits": e.hits,
                    "note": "Claim flagged for human-only handling; no AI score issued.",
                    "processedAt": datetime.now(timezone.utc).isoformat(),
                    "latencyMs": int((time.perf_counter() - t0) * 1000),
                    "factors": [
                        PriorityFactor(label="Flagged by safety guard", weight=0, detail="Prompt-injection pattern matched in claim text.").model_dump()
                    ],
                },
            )
        except Exception as e:  # bounded failure → Node falls back to rules
            raise HTTPException(status_code=503, detail=f"AI run failed: {e}")


@app.post("/clusters/sync")
def sync_clusters(body: ClusterSyncRequest) -> dict:
    pushed = 0
    idx = cluster_index()
    for item in body.clusters:
        try:
            vec = embeddings().embed_query(item.sampleText or item.label)
            idx.upsert(item.clusterId, item.label, vec)
            pushed += 1
        except Exception:
            continue
    return {"pushed": pushed, "total": len(idx.centroids)}
