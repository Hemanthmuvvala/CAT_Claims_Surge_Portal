"""OpenTelemetry tracing — console exporter by default (BRIEF: 'start with the
console; Jaeger is optional'). OpenLLMetry-compatible span names on LLM calls."""
from __future__ import annotations

import time
from contextlib import contextmanager

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

from .config import settings

_provider = TracerProvider(resource=Resource.create({"service.name": settings().service_name}))
_provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
trace.set_tracer_provider(_provider)
tracer = trace.get_tracer("ins04.ai")


@contextmanager
def span(name: str, attrs: dict | None = None):
    with tracer.start_as_current_span(name) as sp:
        if attrs:
            for k, v in attrs.items():
                sp.set_attribute(k, str(v))
        t0 = time.perf_counter()
        try:
            yield sp
        finally:
            sp.set_attribute("duration_ms", f"{(time.perf_counter()-t0)*1000:.0f}")
