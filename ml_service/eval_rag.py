"""
eval_rag.py -- a small, deterministic evaluation harness for medical_rag.

It tests the three things that actually make a RAG trustworthy:
  1. Retrieval relevance -- for in-domain questions, does a relevant paper come back
     close enough (cosine distance below the refusal threshold)?
  2. Grounding / citation -- when it answers, does it cite at least one source [n]?
  3. Refusal              -- for out-of-domain questions, does it refuse instead of
     hallucinating from the LLM's own memory?

Deterministic by construction: fixed questions, a persisted Chroma index, and
temperature=0 generation, so the same run gives the same verdict.

Run (from the repo root):
    ml_service/.venv/bin/python research/rag/eval_rag.py
"""
import re
import sys

import medical_rag as rag

# in-domain: (question, a keyword we expect in the top retrieved paper).
# These match the knowledge base actually built from PubMed/MEDLINE (Alzheimer's
# MRI-biomarker literature), verified to retrieve at cosine distance ~0.24-0.41.
IN_DOMAIN = [
    ("What MRI biomarkers are associated with Alzheimer's disease?", "biomarker"),
    ("How does APOE4 gene status affect Alzheimer's MRI biomarkers?", "apoe"),
    ("Can convolutional neural networks identify MRI biomarkers of Alzheimer's?", "convolutional"),
]

# out-of-domain: the KB has nothing relevant, so these MUST be refused
OUT_OF_DOMAIN = [
    "What is the capital of France?",
    "Give me a recipe for chocolate cake.",
    "What is the current price of Bitcoin?",
]


def main():
    passed, total = 0, 0

    print("== 1. Retrieval relevance (in-domain) ==")
    for q, kw in IN_DOMAIN:
        top = rag.retrieve(q)[0]
        close = top["distance"] <= rag.MAX_DISTANCE
        relevant = kw.lower() in (top["title"] + " " + top["abstract"]).lower()
        ok = close and relevant
        total += 1
        passed += ok
        print(f"  [{'PASS' if ok else 'FAIL'}]  d={top['distance']:.3f}  kw={kw!r:11}  {q}")

    print("\n== 2. Grounding / citation (answers must cite [n]) ==")
    for q, _ in IN_DOMAIN:
        r = rag.answer(q)
        cited = (not r["refused"]) and bool(re.search(r"\[\d+\]", r["answer"]))
        total += 1
        passed += cited
        print(f"  [{'PASS' if cited else 'FAIL'}]  cited={cited}   {q}")

    print("\n== 3. Refusal (out-of-domain must be refused) ==")
    for q in OUT_OF_DOMAIN:
        r = rag.answer(q)
        total += 1
        passed += r["refused"]
        print(f"  [{'PASS' if r['refused'] else 'FAIL'}]  refused={r['refused']}   {q}")

    print(f"\nRESULT: {passed}/{total} checks passed.")
    return passed == total


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
