# CAT Surge Response SOP — Triage & Assignment (Demo Corpus)

Internal procedure for the INS-04 CAT Claims Surge Portal. Synthetic demo
document.

## 1. Triage priority score

Claims are scored 0–100 by a deterministic rules engine from AI-extracted
tags. Bands:

- **85–100 Critical** — act immediately; same-day adjuster contact.
- **65–84 High** — contact within 24 hours.
- **40–64 Medium** — contact within 72 hours.
- **0–39 Routine** — standard queue.

## 2. Weighting rules (the score is the sum of factor weights)

- Severity reported by claimant: critical 43 / high 30 / medium 17 / low 6.
- Vulnerability or hardship signals present: +22.
- Medical dependency or vulnerable household (when a hardship signal is present): +13.
- Active water ingress or water-related peril: +20.
- Active fire / combustion damage: +22.
- Urgency described in the claim (for example rising water, evacuation, or an
  unsafe structure): +10. An AI outage does not by itself increase priority.
- Score is capped at 97. Factor weights show the points actually counted after
  the cap, and their sum always equals the displayed score.

## 3. Clustering

Claims are grouped by location similarity so an adjuster can handle a street or
neighbourhood in one visit. The AI proposes cluster membership by embedding
location plus description; a manager confirms before members are moved.

## 4. Human review rule

No AI output may close, settle or deny a claim. Every triage result is stamped
"needs human review"; adjusters and managers decide all statuses. The AI is
triage support only.

## 5. Fallback

If the AI provider is unavailable or slow, claims are scored by the same fixed
severity, hardship, peril, urgency and cap weights using signals available from
the submitted claim, and are labelled "rules_fallback". Model downtime itself
does not increase priority. Nothing waits unbounded on the model.
