# INS-04 · CAT Claims Surge Portal — Backend

Node + Express REST API for the CAT Claims Surge Portal, built exactly to the
stack in `../BRIEF.html` §8 (Fullstack) and the contract in `../docs/API_CONTRACT.md`.

## Stack (all from the brief's toolbox)

| Layer | Tool | Notes |
|---|---|---|
| HTTP | **Express** | routes → controllers → services → data-access layering |
| Validation | **Zod** | every body/param/query; failures return `{code, message, details}` |
| Data | **PostgreSQL** (your pgAdmin instance, DB `cat_claims`) + **Knex** migrations + seeds | `knexfile.cjs`, `src/db/migrations`, `src/db/seeds` |
| Logging | **pino** + pino-http | structured; PII fields redacted |
| Auth | **JWT (HS256, node:crypto)** | `POST /api/auth/login` exchanges email + password (`demo1234` for all demo accounts) for an 8-hour token; scrypt password hashes; `x-demo-*` header fallback still works for scripted demos |
| AI | Python FastAPI service (**live**) | Node calls `AI_SERVICE_URL/score` with a configurable timeout (`AI_TIMEOUT_MS`, default 70s; Python model timeout is 60s) and falls back to the deterministic rules engine if the service is down |

## Run it

```bash
cd backend
npm install
npm run migrate     # create all tables
npm run seed        # load the synthetic dataset (demo logins + password hashes)
npm run dev         # http://localhost:3001 (watch mode)
```

`.env` (already created) points to `postgresql://postgres:…@localhost:5432/cat_claims`.

## Database schema (visible in pgAdmin → cat_claims)

- `users` — email, name, role (manager | adjuster | policyholder), policy_id, password_hash (scrypt), resource_id (links adjuster logins to their surge-team record)
- `events` — CAT event registry (name, type, region, declared_at, status)
- `resources` — adjusters (capacity, status)
- `claims` — ref, FK event, policy, PII contact fields, severity, hardship_flags jsonb, status, FK cluster, cluster_manual flag, FK assigned adjuster
- `clusters` + `cluster_claims` — junction table per the brief; `key` = `peril_family||location_key`, plus `peril_family` / `location_key` columns
- `priority_scores` — score history per claim: value, factors jsonb, tags jsonb (AI labels), scoring_method, latency_ms, cost_usd, evidence_state, needs_human_review, warnings
- `assignments` — history retained (reassignment appends, never updates)
- `claim_events` — claim timeline
- `activity_log` — dashboard activity feed

Reproduce from scratch anytime: `npm run db:reset`.

## API surface (`/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | app + db liveness; live AI probe (mode/model/KB stats) |
| POST | `/auth/login` | **live** — email + password → JWT + user profile (incl. `adjusterId` for surge-team logins) |
| GET/POST | `/events` | list (paginate, status filter) / declare CAT event |
| GET | `/events/:id` · `/events/:id/summary` | detail / dashboard KPIs + AI health |
| PATCH | `/events/:id/status` | manager-only event lifecycle: active / monitoring / closed |
| POST | `/events/:id/clusters/rebuild` | recompute automatic clusters; manual moves kept while the target cluster's key exists |
| GET | `/claims` | filters: eventId, status, severity, assigned, scoring method, clusterId |
| GET | `/claims/mine` | policyholder's own claims (resolved from the JWT identity; timeline included) |
| POST | `/claims` | submit claim (validated) → auto-clustered (peril family + street block), `triage_pending` |
| POST | `/claims/batch` | bulk intake matching the Excel template: reference, contactName/Email, hardship_flags, per-row validation, duplicate-ref rejection |
| GET | `/claims/:id` | full detail + latest score + timeline + assignment history (uuid **or** `CLM-…` ref accepted) |
| PATCH | `/claims/:id/status` | adjusters limited to operational statuses only (no coverage decisions) |
| POST | `/claims/:id/assign` · `/unassign` · `/flag-review` | manager-only; capacity guard (409 when full/unavailable), idempotent |
| POST | `/claims/:id/move-cluster` | manual cluster move/ungroup (marks `cluster_manual`) |
| GET | `/clusters` · `/clusters/:id` | per-event clusters with member claims (junction) |
| GET | `/adjusters` | resources with live load |
| GET | `/assignments` | assignment history |
| GET | `/priority-scores?claimId=` | score history |
| POST | `/ai/run` | triage orchestration: llama3.2:3b AI service → timeout → deterministic rules fallback |
| GET | `/ai/health` | aggregate model status, latency, fallback rate, cost |
| GET | `/activity` | activity feed |
| GET/POST | `/users` | user registry (POST hashes an optional password + links adjusterId) |

## AI status (honest)

- `POST /api/ai/run` scores with the local Python AI service (llama3.2:3b via Ollama, $0/claim):
  1. syncs the event's clusters into the AI embedding registry,
  2. calls `AI_SERVICE_URL/score` (configurable `AI_TIMEOUT_MS`, default 70s),
  3. on any failure falls back to the deterministic rules engine (`services/triageEngine.js`),
  4. persists the result with the true `scoring_method`, measured end-to-end scoring latency, and local cost (`$0.00`),
  5. **always** sets `needsHumanReview: true` — the AI can never waive human review.
- Malformed AI payloads are rejected by `validateAiResult()` (guardrail).
- The AI may suggest a cluster (`clusterSuggestion`); it is applied only when the
  suggested cluster id really exists in this event.
- The AI and fallback scorers share the same fixed factor weights and 97-point cap.
  At the cap, factor weights show the points actually counted and explain the cap.
- Adjuster load counts non-closed claims by each claim's current
  `assigned_resource_id`; the assignments table remains an audit history.

## What is NOT implemented (by design)

- Password reset, MFA, refresh tokens
- RAGAS deep metrics and Garak scans (AI-service evals cover the core gate)
- Payments, inspections, coverage decisions — per the brief, out of scope
