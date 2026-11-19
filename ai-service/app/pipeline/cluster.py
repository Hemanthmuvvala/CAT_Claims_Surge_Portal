"""Node ⑥ — clustering suggestion. Embed location+description; nearest existing
cluster wins if cosine ≥ join threshold, else a NEW cluster is proposed.

The suggestion is advisory only — a manager confirms moves (SOP §3). The live
cluster registry is owned by the Node backend; it passes known clusters in the
request when available and we fall back to reporting similarity-unknown.
"""
from __future__ import annotations

import math
from typing import Optional

from ..config import settings
from ..llm import embeddings
from ..schemas import ClusterSuggestion, ScoreRequest


class ClusterIndex:
    """Minimal in-memory centroid registry the service maintains per event.

    Seeds are pushed by the Node backend on startup/updates via /clusters/sync;
    new claim embeddings are matched here.
    """

    def __init__(self) -> None:
        self.centroids: dict[str, list[float]] = {}
        self.labels: dict[str, str] = {}

    def upsert(self, cluster_id: str, label: str, vector: list[float]) -> None:
        if cluster_id in self.centroids:
            old = self.centroids[cluster_id]
            n = self.labels.get(cluster_id + ":n", 1)
            self.centroids[cluster_id] = [(o * n + v) / (n + 1) for o, v in zip(old, vector)]
            self.labels[cluster_id + ":n"] = n + 1
        else:
            self.centroids[cluster_id] = list(vector)
            self.labels[cluster_id + ":n"] = 1
        self.labels[cluster_id] = label

    def match(self, vector: list[float], threshold: float | None = None) -> tuple[Optional[str], float]:
        th = threshold if threshold is not None else settings().cluster_join_similarity
        best_id, best_sim = None, 0.0
        for cid, cent in self.centroids.items():
            sim = _cosine(vector, cent)
            if sim > best_sim:
                best_id, best_sim = cid, sim
        if best_sim < th:
            return None, best_sim
        return best_id, best_sim


def _cosine(a: list[float], b: list[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a)) or 1.0
    db = math.sqrt(sum(x * x for x in b)) or 1.0
    return num / (da * db)


_index = ClusterIndex()


def cluster_index() -> ClusterIndex:
    return _index


def suggest_cluster(claim: ScoreRequest) -> tuple[Optional[ClusterSuggestion], list[float]]:
    text = f"{claim.location or ''} {claim.peril} {claim.description[:500]}"
    if not text.strip():
        return None, []
    vec = embeddings().embed_query(text)
    cid, sim = _index.match(vec)
    if cid:
        basis = f"Location/peril embedding matched cluster '{_index.labels.get(cid, cid)}' (cosine {sim:.2f})."
        return ClusterSuggestion(clusterId=cid, similarity=round(sim, 3), basis=basis), vec
    if sim > 0:
        basis = f"No existing cluster above join threshold (best cosine {sim:.2f}) — propose new cluster."
        return ClusterSuggestion(clusterId=None, similarity=round(sim, 3), basis=basis), vec
    return ClusterSuggestion(clusterId=None, similarity=0.0, basis="No clusters registered for this event yet — propose new cluster."), vec
