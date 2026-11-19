"""Eval harness — golden set + eval gate (BRIEF: 'failing evals fail the run').

Run from ai-service/:  pytest tests/ -q          (unit + contract)
                       python -m evals.run_evals  (golden set against live Ollama)
"""
