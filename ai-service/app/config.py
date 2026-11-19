"""AI service configuration — env-driven, no secrets in the repo (BRIEF §15)."""
from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """All knobs in one place; every node reads timeouts from here."""

    # Ollama
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    llm_model: str = os.getenv("AI_LLM_MODEL", "llama3.1:8b")
    embed_model: str = os.getenv("AI_EMBED_MODEL", "nomic-embed-text")

    # LLM call bounds — every call is bounded; no unbounded retries (BRIEF §15)
    llm_timeout_s: float = float(os.getenv("AI_LLM_TIMEOUT_S", "60"))
    llm_temperature: float = float(os.getenv("AI_LLM_TEMPERATURE", "0"))
    llm_max_retries: int = 1  # one validation-repair retry, then fail fast

    # Knowledge base (Chroma)
    chroma_dir: str = os.getenv("AI_CHROMA_DIR", os.path.join(os.path.dirname(__file__), "..", "chroma_kb"))
    kb_collection: str = "policy_kb"
    chunk_size_chars: int = 1200
    chunk_overlap_chars: int = 200
    rag_top_k: int = 4
    rag_min_similarity: float = 0.25  # below this → refuse (grounded-or-refuse)

    # Clustering
    cluster_join_similarity: float = float(os.getenv("AI_CLUSTER_JOIN_SIM", "0.72"))

    # PII masking (Presidio)
    pii_enabled: bool = os.getenv("AI_PII_MASKING", "1") != "0"

    # Tracing
    otel_console_export: bool = os.getenv("AI_OTEL_CONSOLE", "1") != "0"
    service_name: str = "ins04-ai-service"

    # Service identity
    service_port: int = int(os.getenv("AI_SERVICE_PORT", "8000"))


@lru_cache
def settings() -> Settings:
    return Settings()
