# Seed data spec — INS-04 · CAT Claims Surge Portal
<!-- Generate SYNTHETIC data only. Commit the generator/seed script so the DB is reproducible. -->

## From the brief
A synthetic CAT event + a generated batch of 300–500 claims with location + severity signals.

## What to produce
- Enough records to make the app and the AI feel real (not 3 rows).
- Where the brief needs **isolation**, generate **multiple users/tenants** so you can prove one
  cannot read another's data.
- Where the brief needs **evals**, generate labelled cases (link them to `evals/eval_set.json`).

## Entities to seed (from your data model)
- Event
- Claim
- Cluster
- PriorityScore
- Resource
- Assignment

## Rules
- No real PII. Make up names, numbers, documents.
- Keep a `seed` script (SQL or code) in the repo; document how to run it in the README.
