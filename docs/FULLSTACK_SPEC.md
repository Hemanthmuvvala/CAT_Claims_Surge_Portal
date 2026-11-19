# Fullstack spec — INS-04 · CAT Claims Surge Portal

> Give the fullstack the same care as the AI. **45% of the marks** are here
> (data model + UI/UX + backend & APIs). You reuse your Foundation app, so this is about
> extending it well — not rebuilding it.

## 1. Frontend (React, reused shell)
- **Structure:** `pages/` · `components/` · `hooks/` · `api/` (one typed client) · `context/` (auth).
- **Routing:** React Router with **protected routes** (reuse your auth guard).
- **State:** `useState` / `useContext` for local + shared; **TanStack Query** for server data (nice loading/error/caching); Redux Toolkit **only** if the app truly needs it.
- **Every screen** handles **empty / loading / error / success** — never a blank white screen on failure.
- **Forms:** controlled inputs + client validation; show the backend's validation errors inline.
- **Screens to build:**
- **CAT command dashboard (volume, SLA, queue health)** — handle empty / loading / error / success.
- **Priority queue** — handle empty / loading / error / success.
- **Cluster map/list** — handle empty / loading / error / success.
- **Adjuster workload view** — handle empty / loading / error / success.
- **Policyholder status page** — handle empty / loading / error / success.

## 2. Backend (Node + Express, reused)
- **Layering:** `routes → controllers → services → data-access`. Keep business logic out of routes.
- **Validation:** **Zod** on every body/params; reject bad input with a structured error `{ code, message, details }` — never a raw stack trace.
- **Auth + authz:** JWT (reused) + an **authorization middleware**. Enforce **per-user / per-tenant isolation** on every data route — and test it.
- **Logging:** structured (**pino**); mask PII (pair with Presidio on the AI side).
- **Lists:** paginate + filter; **idempotency** on any money/record-changing route.
- **Endpoints (extend your app):**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Get a JWT (reused). |
| `GET` | `/api/events` | List events — scoped to the caller; paginate. |
| `POST` | `/api/events` | Create one — validate the body. |
| `GET` | `/api/events/:id` | Get one event — 403 if not yours. |
| `GET` | `/api/claims` | List claims — scoped to the caller; paginate. |
| `GET` | `/api/claims/:id` | Get one claim — 403 if not yours. |
| `GET` | `/api/clusters` | List clusters — scoped to the caller; paginate. |
| `GET` | `/api/clusters/:id` | Get one cluster — 403 if not yours. |
| `POST` | `/api/ai/run` | Node forwards to the Python AI service and returns the grounded result. |
| `GET` | `/api/health` | Liveness — app + AI service reachable. |

## 3. Data layer
- **From the ERD** (`docs/DATA_MODEL.md`): entities → tables with keys + relationships.
- **ORM + migrations:** **Prisma** (or Knex / Drizzle). Commit migrations so the DB is reproducible.
- **Entities:** Event, Claim, Cluster, PriorityScore, Resource/Adjuster, Assignment
- **PII:** mark sensitive fields; mask them in logs; never store raw secrets. Commit a **seed script**.

## 4. How it all fits together
```
React (reused shell)  ──►  Node/Express API  ──►  Python FastAPI AI service
  auth guard,               JWT + authz,            LangGraph pipeline + tools
  screen states             Zod validation,         (grounded, cited, guarded)
                            data access (ORM)
        ◄───────────────────────◄───────────────────────◄
```
- The **Node app owns** auth, validation, data and orchestration; it **calls the Python AI service** over HTTP (timeout + fallback if the AI service is down).
- The **React app only talks to Node**, never directly to the AI service.

## 5. Open-source fullstack toolbox
**Frontend**

| Tool | Licence | What for |
|---|---|---|
| **React** | MIT | UI components + state (reused from your Foundation app). |
| **Vite** | MIT | Dev server + build. |
| **React Router** | MIT | Routing + protected routes (reuse your auth guard). |
| **TanStack Query** | MIT | Server-state: fetching, caching, loading/error states (optional but handy). |
| **Redux Toolkit** | MIT | Shared client state — only if the app genuinely needs it. |

**Backend**

| Tool | Licence | What for |
|---|---|---|
| **Express** | MIT | HTTP API (reused). Routes → controllers → services → data access. |
| **Zod** | MIT | Validate every request body/params; turn failures into structured errors. |
| **Prisma** | Apache-2.0 | ORM + typed queries + migrations (or Knex (MIT) / Drizzle (Apache-2.0)). |
| **jsonwebtoken** | MIT | JWT auth (reused). Plus authz middleware for per-user isolation. |
| **bcrypt** | MIT | Password hashing (reused). |
| **pino** | MIT | Structured logging (mask PII). |

**Data**

| Tool | Licence | What for |
|---|---|---|
| **PostgreSQL** | PostgreSQL Lic. | Relational store for the domain data (or SQLite to start). |
| **SQLite** | Public domain | Zero-setup relational DB — fine for a 4-day build. |

**Tests**

| Tool | Licence | What for |
|---|---|---|
| **Vitest / Jest** | MIT | Backend unit + integration tests. |
| **Supertest** | MIT | HTTP endpoint tests (incl. negative + authorization). |
| **React Testing Library** | MIT | Frontend component tests. |

## 6. Fullstack definition of done
- [ ] ERD → schema with keys + relationships; migrations + seed committed.
- [ ] Endpoints above working, with Zod validation + structured errors + logging.
- [ ] JWT auth + authz; **isolation proven by a test** (user A can't read user B).
- [ ] React screens wired to the real API with **all four states** on each.
- [ ] Node ↔ Python AI service integration with a timeout + fallback.
- [ ] Backend tests (incl. negative + authorization) + at least a couple of component tests.
