"""Knowledge base: Chroma store + hybrid retrieval (keyword BM25 + vector).

Grounded-or-refuse: answers must cite retrieved chunks; below the similarity
floor the pipeline refuses instead of guessing (BRIEF §15).
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Optional

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from rank_bm25 import BM25Okapi

from .config import settings
from .llm import embeddings

Word = re.compile(r"[a-zA-Z]{3,}")


@lru_cache
def vectorstore() -> Chroma:
    s = settings()
    path = os.path.abspath(s.chroma_dir)
    return Chroma(
        collection_name=s.kb_collection,
        embedding_function=embeddings(),
        persist_directory=path,
        collection_metadata={"hnsw:space": "cosine"},  # normalized 0..1 relevance scores
    )


class KB:
    """Hybrid retriever over the seeded policy knowledge base."""

    def __init__(self) -> None:
        self.vs = vectorstore()
        self._bm25: Optional[BM25Okapi] = None
        self._docs: list[Document] = []

    def reload(self) -> None:
        """Pull all chunks from Chroma into the BM25 index (called at startup)."""
        data = self.vs.get(include=["documents", "metadatas"])
        self._docs = [
            Document(page_content=d, metadata=m or {})
            for d, m in zip(data["documents"], data["metadatas"])
        ]
        corpus = [Word.findall(doc.page_content.lower()) for doc in self._docs]
        self._bm25 = BM25Okapi(corpus) if corpus and any(corpus) else None

    @property
    def chunk_count(self) -> int:
        return len(self._docs)

    def doc_count(self) -> int:
        if not self._docs:
            return 0
        return len({m.get("source", "?") for m in (d.metadata for d in self._docs)})

    def retrieve(self, query: str, k: int | None = None) -> list[Document]:
        """Hybrid search: RRF-merge of BM25 keyword hits and vector hits.
        Returned docs carry `vecScore` (0..1 relevance) for the grounding gate."""
        k = k or settings().rag_top_k
        if not self._docs:
            return []
        ranked: dict[str, tuple[float, float]] = {}  # key -> (rrf, bestVecScore)

        vec_hits = self.vs.similarity_search_with_relevance_scores(query, k=k)
        for rank, (doc, score) in enumerate(vec_hits):
            key = doc.page_content[:80]
            rrf, _ = ranked.get(key, (0.0, 0.0))
            ranked[key] = (rrf + 1.0 / (60 + rank), max(_, float(score)))

        if self._bm25 is not None:
            terms = Word.findall(query.lower())
            if terms:
                bm_hits = self._bm25.get_top_n(terms, self._docs, n=k)
                for rank, doc in enumerate(bm_hits):
                    key = doc.page_content[:80]
                    rrf, vs = ranked.get(key, (0.0, 0.0))
                    ranked[key] = (rrf + 1.0 / (60 + rank), vs)

        by_key = {d.page_content[:80]: d for d in self._docs}
        merged = sorted(ranked.items(), key=lambda kv: -kv[1][0])[:k]
        out = []
        for key, (_, vec_score) in merged:
            doc = by_key.get(key)
            if doc is not None:
                doc.metadata = {**doc.metadata, "vecScore": vec_score}
                out.append(doc)
        return out


@lru_cache
def kb() -> KB:
    store = KB()
    store.reload()
    return store
