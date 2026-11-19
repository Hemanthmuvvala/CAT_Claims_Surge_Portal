# AI spec — INS-04 · CAT Claims Surge Portal

## The requirement (from the BRD)
An agent that triages each incoming claim (severity + hardship signals) at volume and must stay grounded and cheap — show cost/latency awareness and a fallback when the model is rate-limited. RAG for the coverage check per claim. Simple clustering (embeddings or rules) for grouping. Eval the priority ordering against a labelled 'should-be-first' set.

## Pattern to use
**Batch triage agent + clustering + RAG**

Reference patterns + guardrails: `../../00_PROGRAM/TECH_STACK_AND_AI_PLAYBOOK.md`

## System architecture — build these parts explicitly
1. **CAT Event Registry** — Declares an event; claims attach to it.
2. **Bulk Intake** — Ingests large batches without locking up.
3. **Priority Agent** — Scores severity + hardship; explains top factors.
4. **Clustering Service** — Groups claims by location/peril (embeddings or rules).
5. **Assignment Engine** — Distributes work, respects adjuster capacity.
6. **Resilience Layer** — Fallback scoring + backpressure when the model is throttled.
7. **Command Dashboard** — Live volume, SLA, queue health, cost-per-claim.

**Pipeline:** Declare CAT event → Bulk claims in → Priority score (+hardship) → Cluster related claims → Balance + assign → Fallback under load → Live command view

**What makes this complex (don't skip):**
- Must survive a simulated burst (e.g. 500 at once)
- Graceful degradation when the LLM is rate-limited
- Cost + latency tracked per claim and shown
- Hardship cases provably reach a human fast

## Platform bar — every project must clear this (top-level)
- **Join the parts into one simple pipeline** — Use LangGraph to connect the parts into one clear flow — a few nodes is plenty. Put a limit on every loop and retry.
- **Use a fixed data shape at every step** — Pass data between parts in a fixed Pydantic shape. Check every AI output; fix or reject it if it's wrong.
- **Keep the run's state** — Save the run's state (LangGraph state) so a step can resume. A simple store is fine — no fancy memory needed.
- **Knowledge base + good search** — If the project uses RAG: load the knowledge base into Chroma with LangChain, search by keyword and by meaning, and show where each answer came from. Re-ranking is a nice-to-have.
- **A small test set for the AI** — Make a small golden set — about 6–10 examples with the right answers — and score your AI on it (RAGAS for RAG). Show the score.
- **Fail the run on bad scores** — If the score is below your bar, the run fails. A broken AI must not pass quietly.
- **A quick safety check** — Run a short prompt-injection check (about a dozen prompts with PyRIT or garak) and mask obvious PII with Presidio. For risky steps, wrap the AI in fixed rules so it never makes the dangerous choice alone.
- **See what it's doing** — Trace the main steps with OpenTelemetry (view in Jaeger, or just the console to start): prompt, time and cost. Add a backup for when the model is busy.

## Build it with these open-source tools (no paid accounts)
| Tool | Licence | What you use it for |
|---|---|---|
| **LangGraph** | MIT | Connect the parts into one clear, bounded state-graph — this is your orchestration. |
| **LangChain** | MIT | LLM calls, prompts, tool-calling, retrievers and output parsing. |
| **Chroma** | Apache-2.0 | Vector DB for the knowledge base (store embeddings, search). |
| **sentence-transformers** | Apache-2.0 | Open embedding models (or nomic-embed-text via Ollama). |
| **RAGAS** | Apache-2.0 | Score the RAG core on a couple of metrics (faithfulness, context precision). |
| **Pydantic** | MIT | The fixed data shape (schema) between every part; check and repair AI outputs. |
| **Ollama** | MIT | Run the local open-weight LLM (llama3.1 / mistral / qwen2.5). |
| **OpenTelemetry** | Apache-2.0 | Trace the main steps — prompt, time, cost. Start with the console; Jaeger is optional. |
| **OpenLLMetry** | Apache-2.0 | One line to send OTel spans for your LLM/LangChain calls (adds token + cost). |
| **Jaeger** | Apache-2.0 | Optional local viewer for the traces (run it in Docker when you want a UI). |
| **Presidio** | MIT | Mask the obvious PII / PHI in inputs, logs and prompts. |
| **PyRIT** | MIT | A short prompt-injection / jailbreak check (about a dozen prompts) that must pass. |
| **garak** | Apache-2.0 | A quick scan for injection / leak weaknesses (a light scan is fine). |
| **pytest** | MIT | Unit, integration, negative and authorization/isolation tests. |

**Architecture note (this project uses: RAG):** Keep your existing Node/Express app for the product API + auth (reused from the Foundation) and the React frontend as-is — that's most of the app, already done. Add one small Python FastAPI "AI service" (a handful of endpoints) that runs the LangGraph pipeline and the AI tools; the Node app calls it over HTTP. That's the only new runtime.

Keep the model provider behind a small adapter so a hosted API could be swapped in later without rewriting your app.

## Build checklist
- [ ] Choose the right pattern (don't prompt-stuff what should be RAG; don't agent-ify what's one call).
- [ ] **Grounding:** answer only from retrieved/real data; **cite** the source.
- [ ] **Refusal:** when the data can't support an answer, refuse/escalate — don't guess.
- [ ] **Structured output** where a machine consumes the result (validate the JSON).
- [ ] **Deterministic guardrails** for anything safety-/money-critical — the LLM must not make the dangerous call alone.
- [ ] **Observability:** log prompt, tokens, latency and cost per AI call; add a fallback for model failure/rate-limits.

## Eval plan (required — you report these numbers in the demo)
Primary metric(s) from the brief:
- Throughput under surge (claims triaged/min)
- Hardship/high-severity claims reaching an adjuster within target
- Even adjuster load (no one > X% over mean)

- Put labelled cases in `../evals/eval_set.json` and grow the set.
- Measure the metric above (e.g. field accuracy / answer + citation correctness / precision@k /
  groundedness / red-flag catch rate).
- Where the brief is safety-critical, the safety metric (e.g. red-flag catch) must be **100%** to pass.
