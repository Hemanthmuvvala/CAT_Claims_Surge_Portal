# BRD — INS-04 · CAT Claims Surge Portal

> **This is a client brief, not a spec.** Read it, find the gaps, ask the questions, then write the PRD.
> **New to this industry? That's expected.** Read §0 (the primer) and §0.1 (the glossary) first —
> they explain the domain in plain English. A polished version of this brief is in **`BRIEF.html`**
> (open it in a browser).

**Domain:** Insurance — Claims / Catastrophe  
**Difficulty:** Core  
**Headline AI capability:** Batch triage agent + clustering + RAG

**In one line:** When a hurricane lands and 5,000 claims hit in a day, keep the queue sane and the vulnerable first.

---

## 0. Domain primer — read this first (no prior knowledge needed)
A 'catastrophe' (CAT) is a big event — a hurricane, flood or wildfire — that causes thousands of claims in a single day. Normal first-come-first-served handling collapses, and the most vulnerable people get buried in the queue. You're building a command centre that absorbs the surge: it scores each claim's urgency and hardship, groups related claims (same street, same storm), and balances the work across adjusters — all while staying cheap and fast under extreme load.

### 0.1 Glossary — the words you'll meet
- **CAT event** — A catastrophe — one incident generating a flood of claims at once.
- **Surge** — A sudden spike in claim volume far above normal.
- **Hardship / vulnerability** — Signals a claimant needs priority help (elderly, medical, displaced).
- **Clustering** — Grouping similar claims so they can be handled together.
- **Load balancing** — Spreading work evenly so no adjuster is overwhelmed.
- **Throughput** — How many claims the system can process per minute.
- **Backpressure / rate-limit** — When too many AI calls hit the model and some must wait or fall back.
- **Priority score** — A number ranking which claim should be handled first.

### 0.2 Worked example — one trip through the finished system
Hurricane declared. 500 claims arrive in an hour. For each, the triage agent scores severity + hardship; a 78-year-old with no power and structural damage scores 0.95 and jumps the queue. Claims from 'Maple Street' cluster together so one adjuster handles the whole street. When the LLM gets rate-limited, the system falls back to a rules-only score so nothing stalls. The dashboard shows throughput, queue health and cost-per-claim live.

---

## 1. Business context
A catastrophe (flood, storm, wildfire) triggers a surge: thousands of claims in hours, normal staffing overwhelmed, and the most vulnerable claimants at risk of being buried in the queue. This was flagged in your system-design training as a real high-scale scenario.

## 2. Problem statement
Volume spikes break first-come-first-served. There's no fast way to cluster related claims (same street, same event), prioritise hardship, or balance adjuster load.

## 3. Primary users / user types
- Catastrophe response manager
- Adjusters (surge team)
- Policyholders tracking their claim

## 4. Business goals (outcomes)
- Absorb a surge without collapsing
- Prioritise hardship & high-severity automatically
- Cluster related claims to adjust at scale

## 5. In scope (MVP)
- Bulk claim intake tied to a declared CAT event
- AI priority scoring (severity + vulnerability + coverage)
- Clustering of claims by location/peril for batch handling
- Adjuster load-balancing & assignment
- Policyholder status tracker

## 6. Out of scope
- Payments
- Field-inspection scheduling logistics

## 7. Key functional requirements
- Register a CAT event; claims attach to it
- Priority agent scores each claim and explains the top factors
- Cluster view groups nearby/similar claims
- Assignment engine distributes work and avoids overloading any adjuster
- Policyholder sees a plain-language status + next step

## 8. System architecture — the parts to build
> This is a real multi-component system, not a Basic form with one AI call. Build each part
> **explicitly**, behind a typed contract, and wire them into one bounded pipeline.

1. **CAT Event Registry** — Declares an event; claims attach to it.
2. **Bulk Intake** — Ingests large batches without locking up.
3. **Priority Agent** — Scores severity + hardship; explains top factors.
4. **Clustering Service** — Groups claims by location/peril (embeddings or rules).
5. **Assignment Engine** — Distributes work, respects adjuster capacity.
6. **Resilience Layer** — Fallback scoring + backpressure when the model is throttled.
7. **Command Dashboard** — Live volume, SLA, queue health, cost-per-claim.

**Pipeline (data flow):**  Declare CAT event → Bulk claims in → Priority score (+hardship) → Cluster related claims → Balance + assign → Fallback under load → Live command view

### 8.1 What makes THIS build complex
- Must survive a simulated burst (e.g. 500 at once)
- Graceful degradation when the LLM is rate-limited
- Cost + latency tracked per claim and shown
- Hardship cases provably reach a human fast

## 9. AI engineering requirement
An agent that triages each incoming claim (severity + hardship signals) at volume and must stay grounded and cheap — show cost/latency awareness and a fallback when the model is rate-limited. RAG for the coverage check per claim. Simple clustering (embeddings or rules) for grouping. Eval the priority ordering against a labelled 'should-be-first' set.

### 9.1 Platform bar — every project must clear this (top-level)
- **Join the parts into one simple pipeline** — Use LangGraph to connect the parts into one clear flow — a few nodes is plenty. Put a limit on every loop and retry.
- **Use a fixed data shape at every step** — Pass data between parts in a fixed Pydantic shape. Check every AI output; fix or reject it if it's wrong.
- **Keep the run's state** — Save the run's state (LangGraph state) so a step can resume. A simple store is fine — no fancy memory needed.
- **Knowledge base + good search** — If the project uses RAG: load the knowledge base into Chroma with LangChain, search by keyword and by meaning, and show where each answer came from. Re-ranking is a nice-to-have.
- **A small test set for the AI** — Make a small golden set — about 6–10 examples with the right answers — and score your AI on it (RAGAS for RAG). Show the score.
- **Fail the run on bad scores** — If the score is below your bar, the run fails. A broken AI must not pass quietly.
- **A quick safety check** — Run a short prompt-injection check (about a dozen prompts with PyRIT or garak) and mask obvious PII with Presidio. For risky steps, wrap the AI in fixed rules so it never makes the dangerous choice alone.
- **See what it's doing** — Trace the main steps with OpenTelemetry (view in Jaeger, or just the console to start): prompt, time and cost. Add a backup for when the model is busy.

## 10. Core data entities (seed for your data model)
- Event (id, type, region, declaredAt)
- Claim (id, eventId, policyId, severity, priorityScore, status)
- Cluster (eventId, key, claimIds[])
- PriorityScore (claimId, value, factors[])
- Resource/Adjuster (id, capacity, load)
- Assignment (claimId, adjusterId, assignedAt)

## 11. Key screens (seed for your UI/UX)
- CAT command dashboard (volume, SLA, queue health)
- Priority queue
- Cluster map/list
- Adjuster workload view
- Policyholder status page

## 12. Non-functional requirements
- Handle a simulated burst (e.g., 500 claims loaded at once) without UI lockup
- Triage degrades gracefully under model failure
- Cost per claim tracked and shown on the dashboard

## 13. Success metrics — the 2–3 that will actually be checked
- Throughput under surge (claims triaged/min)
- Hardship/high-severity claims reaching an adjuster within target
- Even adjuster load (no one > X% over mean)

## 14. Suggested sample data
A synthetic CAT event + a generated batch of 300–500 claims with location + severity signals.

## 15. Stretch goals (only after the MVP is solid)
- Live queue-health auto-scaling signal
- Reassignment when an adjuster goes offline
- Surge forecast from intake rate

## 16. Defend-your-design prompts (you WILL be asked these)
- How does your design survive 10x normal volume?
- What happens to triage when the LLM API is throttled?
- Defend your prioritisation — why is claimant A ahead of B?
