"""Seed the Chroma knowledge base from knowledge_base/*.md.

Chunks each document with overlap, embeds via nomic-embed-text (Ollama), and
persists into the policy_kb collection. Idempotent: wipes and reseeds.

Run: python -m app.seed_kb   (from ai-service/, after `pip install -r requirements.txt`)
"""
from __future__ import annotations

import os
import sys

from langchain_chroma import Chroma
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .config import settings
from .llm import embeddings


def seed() -> dict:
    s = settings()
    kb_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "knowledge_base"))
    files = sorted(f for f in os.listdir(kb_dir) if f.endswith(".md"))
    if not files:
        raise SystemExit(f"no .md documents found in {kb_dir}")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=s.chunk_size_chars,
        chunk_overlap=s.chunk_overlap_chars,
        separators=["\n\n## ", "\n\n", "\n", ". "],
    )
    docs = []
    for fname in files:
        title = os.path.splitext(fname)[0]
        raw = TextLoader(os.path.join(kb_dir, fname)).load()
        for chunk in splitter.split_documents(raw):
            chunk.metadata = {"source": title, "section": _first_heading(chunk.page_content)}
            docs.append(chunk)

    path = os.path.abspath(s.chroma_dir)
    os.makedirs(path, exist_ok=True)
    store = Chroma(collection_name=s.kb_collection, embedding_function=embeddings(), persist_directory=path)
    store.delete_collection()  # idempotent reseed
    store = Chroma(collection_name=s.kb_collection, embedding_function=embeddings(), persist_directory=path)
    ids = store.add_documents(docs)
    print(f"seeded {len(docs)} chunks from {len(files)} docs into {path}")
    return {"docs": len(files), "chunks": len(docs)}


def _first_heading(text: str) -> str:
    for line in text.splitlines():
        if line.strip():
            return line.lstrip("# ").strip()[:120]
    return "?"


if __name__ == "__main__":
    sys.exit(seed())
