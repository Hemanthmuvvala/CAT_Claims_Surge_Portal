"""Bounded LLM/embedder access. Every call has a timeout; token use is counted."""
from __future__ import annotations

import json
import time
from typing import Optional, Type, TypeVar

from langchain_core.exceptions import OutputParserException
from langchain_ollama import ChatOllama, OllamaEmbeddings
from pydantic import BaseModel, ValidationError

from .config import settings

T = TypeVar("T", bound=BaseModel)

_llm: Optional[ChatOllama] = None
_embed: Optional[OllamaEmbeddings] = None


def llm() -> ChatOllama:
    global _llm
    if _llm is None:
        _llm = ChatOllama(
            model=settings().llm_model,
            base_url=settings().ollama_base_url,
            temperature=settings().llm_temperature,
            timeout=settings().llm_timeout_s,
            num_ctx=8192,
        )
    return _llm


def embeddings() -> OllamaEmbeddings:
    global _embed
    if _embed is None:
        _embed = OllamaEmbeddings(
            model=settings().embed_model,
            base_url=settings().ollama_base_url,
        )
    return _embed


_bounded: dict[int, ChatOllama] = {}


def bounded_llm(num_predict: int) -> ChatOllama:
    """ChatOllama with a capped output length (keeps local 8B generation fast)."""
    if num_predict not in _bounded:
        _bounded[num_predict] = ChatOllama(
            model=settings().llm_model,
            base_url=settings().ollama_base_url,
            temperature=settings().llm_temperature,
            timeout=settings().llm_timeout_s,
            num_ctx=8192,
            num_predict=num_predict,
        )
    return _bounded[num_predict]


def structured_call(prompt: str, schema: Type[T], system: str = "", num_predict: int | None = None) -> tuple[T, int, int]:
    """One bounded LLM call — validated Pydantic object.

    Returns (result, prompt_tokens, completion_tokens). Raises on validation
    failure after ONE repair retry - the caller decides the fallback.
    num_predict bounds the JSON output length (keeps local 8B generation fast).
    """
    sys = system or (
        "You are a precise insurance-claims assistant. Answer ONLY with JSON that "
        "matches the requested schema. Never invent facts, figures or policy terms."
    )
    chain = bounded_llm(num_predict) if num_predict else llm()
    last_err: Exception | None = None
    for attempt in range(1 + settings().llm_max_retries):
        resp = chain.invoke([("system", sys), ("human", prompt)])
        prompt_tokens = getattr(resp, "usage_metadata", {}).get("input_tokens", 0) or 0
        completion_tokens = getattr(resp, "usage_metadata", {}).get("output_tokens", 0) or 0
        text = resp.content if isinstance(resp.content, str) else str(resp.content)
        try:
            return schema.model_validate(_extract_json(text)), prompt_tokens, completion_tokens
        except (ValidationError, OutputParserException, json.JSONDecodeError) as e:
            last_err = e
            prompt = (
                f"{prompt}\n\nYour previous answer was invalid: {e}. "
                "Return corrected JSON matching the schema exactly. No prose."
            )
    raise RuntimeError(f"LLM output failed schema after repair retry: {last_err}")


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of a possibly chatty LLM answer."""
    text = text.strip()
    if text.startswith("{"):
        return json.loads(text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise json.JSONDecodeError("no JSON object found", text, 0)
    return json.loads(text[start : end + 1])


def timed[T](fn, *args, **kwargs):
    t0 = time.perf_counter()
    out = fn(*args, **kwargs)
    return out, (time.perf_counter() - t0) * 1000.0
