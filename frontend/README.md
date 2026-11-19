# INS-04 · CAT Claims Surge Portal — Frontend

React 18 + Vite (plain JavaScript, JSX — no TypeScript) prototype of the CAT Claims
Surge Portal described in `../UI_prompt.md`. All data is synthetic; all "AI" is
simulated and clearly labelled.

## Run it

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # production build (vite build)
npm run preview    # serve the production build
```

To reset demo data (seeded in localStorage), run in the browser console:

```js
localStorage.removeItem("ins04-cat-portal-db-v2"); location.reload();
```

## Demo accounts (labelled prototype access, NOT production auth)

| Role | Account | Lands on |
|---|---|---|
| Policyholder / Claimant | `priya.raman@example.com` (pre-filled) | My Claims |
| CAT Response Manager | one-click demo card | CAT Command Centre |
| Adjuster / Surge Team | one-click demo card (Marcus Chen, `adj-1`) | My Work Queue |

## Screens

**Manager**
1. CAT Command Centre — KPIs, intake/triage chart, queue health, adjuster bars, AI Processing Health, alerts, activity table.
2. Priority Queue — search + 7 filters, filter chips, sorting, pagination, sticky-header table, claim drawer with triage explanation, evidence, assignment.
3. Claim Clusters — schematic map with labelled pins + list toggle, peril filter, cluster detail panel.
4. Adjuster Workload — capacity bars, deviation vs team mean, assignments table, "Balance Workload" preview (simulated rule, review-before-apply).
5. CAT Events — registry + Declare CAT Event modal with validation.
6. Bulk Claim Intake — CSV paste/upload, per-line validation, async progress, completion/error summary.

**Adjuster** — My Work Queue, shared claim detail (status updates limited to permitted operational statuses), Workload Summary, Cluster Context.

**Policyholder** — Submit a Claim (validated form → confirmation with reference), My Claims, Claim Status tracker (plain-language status, timeline, "What happens next?").

**End-to-end demo workflow:** policyholder submits → claim appears as *Triage pending* in the manager queue → simulated triage completes (AI-assisted or rules-fallback depending on the simulated provider state) → manager reviews score/factors/evidence and assigns → assignee sees it in My Work Queue and updates status → policyholder sees the claimant-safe status/timeline change.

## Mock-only functionality

- Authentication (demo role selector / demo policyholder account).
- All data persistence (localStorage `ins04-cat-portal-db-v2`).
- AI triage results, latency, cost, provider health (simulated; toggle in dashboard AI panel via `setSimulatedProviderStatus`).
- Batch intake parsing/progress, balance-workload proposals, notifications, activity feed.

## Requires backend integration

- Real JWT auth + per-role permission enforcement.
- Real persistence for Event / Claim / Cluster / PriorityScore / Resource / Assignment (service layer in `src/services/api.js` is the replaceable seam).
- Real AI triage via the Python FastAPI service (called by Node backend, never the browser).
- Geospatial cluster map, event closing, policy evidence retrieval, secure messaging, notification delivery.
