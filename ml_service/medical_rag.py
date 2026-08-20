"""
medical_rag.py -- Vaidya Nidaan medical-literature RAG.

A cleaned-up rebuild of research/notebooks/chatbot_rag.ipynb. SAME methodology,
now sourced from PubMed/MEDLINE (the clinical-standard biomedical corpus) instead
of Semantic Scholar:

    PubMed / MEDLINE  ->  ChromaDB (store + retrieve abstracts)
    ->  GPT-4o answers grounded ONLY in the retrieved abstracts, with citations.

Source: NCBI E-utilities (esearch -> efetch), restricted to MEDLINE-indexed records
that have an abstract (`medline[sb]` + `hasabstract`). Set NCBI_API_KEY for 10 req/s
(vs 3) and NCBI_EMAIL for API etiquette; both are optional.

Run (from the repo root, using the ml_service venv that has chromadb + openai):
    ml_service/.venv/bin/python ml_service/medical_rag.py --build       # build KB once
    ml_service/.venv/bin/python ml_service/medical_rag.py --refresh     # refetch from PubMed
    ml_service/.venv/bin/python ml_service/medical_rag.py "your question"

What was fixed vs the original notebook:
  * source is PubMed/MEDLINE via E-utilities  (old: Semantic Scholar / hardcoded query)
  * retrieval uses the USER's question   (old code hardcoded one query for everything)
  * generation is GPT-4o grounded on the abstracts with [n] citations  (old: opt-125m)
  * papers are cached + de-duplicated and Chroma is persisted -> build once, reproducible
  * if nothing relevant is retrieved it REFUSES instead of guessing  (guardrail)
"""
import os
import json
import time
import argparse
import xml.etree.ElementTree as ET

import requests
import chromadb
from chromadb.config import Settings

# --- paths + config ----------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))       # ml_service/
ENV_PATH = os.path.join(HERE, ".env")
_STORE = os.path.join(HERE, "rag_store")
CACHE_PATH = os.path.join(_STORE, "papers_cache.json")  # raw fetched papers (reproducibility)
CHROMA_PATH = os.path.join(_STORE, "chroma_db")         # persisted vector store

try:
    from dotenv import load_dotenv

    load_dotenv(ENV_PATH)  # reuse ml_service/.env (OPENAI_API_KEY, OPENAI_MODEL)
except Exception:
    pass

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
GEN_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")

# The seed topics the knowledge base is built from (PubMed/MEDLINE searches).
# Broadened to ~26 clinical + algorithmic topics, incl. adjacent dementias
# (Lewy body, frontotemporal, vascular) so the assistant can answer differential
# questions instead of refusing them.
SEED_QUERIES = [
    # --- core Alzheimer's MRI / structural biomarkers ---
    "Alzheimer disease MRI biomarkers",
    "hippocampal atrophy Alzheimer disease diagnosis",
    "medial temporal lobe atrophy dementia MRI",
    "cortical thickness Alzheimer disease neuroimaging",
    "ventricular enlargement dementia MRI",
    "brain atrophy pattern neurodegeneration MRI",
    "brain parenchymal fraction atrophy dementia",
    # --- tissue segmentation / volumetry ---
    "brain tissue segmentation MRI grey white matter",
    "hippocampal volumetry FreeSurfer FSL segmentation",
    "grey matter white matter ratio dementia",
    # --- molecular / genetic / fluid biomarkers ---
    "APOE4 genotype Alzheimer disease MRI",
    "CSF biomarkers amyloid tau Alzheimer disease",
    "amyloid PET imaging Alzheimer disease",
    "tau PET neurodegeneration imaging",
    # --- staging / progression ---
    "mild cognitive impairment MRI progression Alzheimer",
    "amnestic mild cognitive impairment biomarkers",
    "preclinical Alzheimer disease neuroimaging",
    # --- differential dementias (avoid over-refusal) ---
    "Lewy body dementia MRI features",
    "frontotemporal dementia neuroimaging atrophy",
    "vascular dementia white matter hyperintensities MRI",
    # --- deep learning / classification / explainability ---
    "deep learning Alzheimer disease classification MRI",
    "convolutional neural network brain MRI dementia",
    "transfer learning medical image classification",
    "Grad-CAM explainability deep learning medical imaging",
    "explainable artificial intelligence clinical decision support",
    "Alzheimer's Disease Neuroimaging Initiative ADNI machine learning",
]

TOP_K = 4
# Cosine distance floor for the refusal guardrail. Measured: relevant papers sit
# around ~0.4, off-topic questions around ~0.9, so refuse if the nearest paper is
# farther than this.
MAX_DISTANCE = 0.75

REFUSAL = "I don't have enough grounded medical context to answer that from the retrieved papers."

SYSTEM_PROMPT = (
    "You are Vaidya Nidaan's medical-literature assistant for clinicians. Answer the "
    "QUESTION using ONLY the numbered paper abstracts in CONTEXT. These abstracts were "
    "already retrieved as relevant, so synthesize the best grounded answer you can from "
    "them. You MUST cite every claim with its source number(s) in square brackets, e.g. "
    "[1] or [2, 3]; an answer with no [n] citation is invalid. Refuse ONLY if the "
    "abstracts are genuinely unrelated to the question, by replying EXACTLY: "
    f"'{REFUSAL}' Do not use any knowledge outside the abstracts. Be concise and clinical."
)


# --- 1. fetch from PubMed / MEDLINE (NCBI E-utilities) -----------------------
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
NCBI_API_KEY = os.environ.get("NCBI_API_KEY", "").strip()   # optional: 10 req/s vs 3
NCBI_EMAIL = os.environ.get("NCBI_EMAIL", "").strip()       # optional: NCBI etiquette
NCBI_TOOL = "vaidya-nidaan-rag"
# Space requests so we stay under NCBI's rate limit (10/s with a key, else 3/s).
_REQUEST_PAUSE = 0.12 if NCBI_API_KEY else 0.34


def _ncbi_params(extra):
    p = {"tool": NCBI_TOOL, **extra}
    if NCBI_API_KEY:
        p["api_key"] = NCBI_API_KEY
    if NCBI_EMAIL:
        p["email"] = NCBI_EMAIL
    return p


def _esearch(query, retmax):
    """Return PubMed IDs for a query. Restrict to MEDLINE-indexed records that have
    an abstract, so every hit is journal-vetted (MeSH-indexed) and embeddable."""
    term = f"({query}) AND hasabstract AND medline[sb]"
    params = _ncbi_params({"db": "pubmed", "term": term, "retmax": retmax, "retmode": "json"})
    for attempt in range(3):
        try:
            r = requests.get(f"{EUTILS}/esearch.fcgi", params=params, timeout=20)
        except requests.RequestException as exc:
            print(f"  [warn] esearch error ({exc}); retrying...")
            time.sleep(2)
            continue
        if r.status_code == 200:
            return r.json().get("esearchresult", {}).get("idlist", [])
        if r.status_code == 429:  # rate limited -> back off and retry
            time.sleep(2 * (attempt + 1))
            continue
        print(f"  [warn] esearch returned HTTP {r.status_code}")
        break
    return []


def _abstract_text(article):
    """Join every <AbstractText> section (structured abstracts have several)."""
    parts = []
    for ab in article.findall(".//Abstract/AbstractText"):
        text = "".join(ab.itertext()).strip()
        if not text:
            continue
        label = ab.get("Label")
        parts.append(f"{label}: {text}" if label else text)
    return " ".join(parts).strip()


def _pub_year(article):
    """Best-effort publication year from <PubDate> (Year or MedlineDate)."""
    for path in (".//JournalIssue/PubDate/Year", ".//JournalIssue/PubDate/MedlineDate"):
        el = article.find(path)
        if el is not None and el.text:
            digits = "".join(c for c in el.text[:4] if c.isdigit())
            if digits:
                return int(digits)
    return 0


def _efetch(pmids):
    """Fetch + parse full records for a batch of PMIDs into paper dicts."""
    if not pmids:
        return []
    params = _ncbi_params({"db": "pubmed", "id": ",".join(pmids), "retmode": "xml"})
    try:
        r = requests.get(f"{EUTILS}/efetch.fcgi", params=params, timeout=30)
    except requests.RequestException as exc:
        print(f"  [warn] efetch error ({exc})")
        return []
    if r.status_code != 200:
        print(f"  [warn] efetch returned HTTP {r.status_code}")
        return []
    try:
        root = ET.fromstring(r.content)
    except ET.ParseError as exc:
        print(f"  [warn] efetch XML parse error ({exc})")
        return []
    papers = []
    for art in root.findall(".//PubmedArticle"):
        pmid_el = art.find(".//MedlineCitation/PMID")
        pmid = pmid_el.text if pmid_el is not None else None
        abstract = _abstract_text(art)
        if not (pmid and abstract):  # keep only records we can cite + embed
            continue
        title_el = art.find(".//Article/ArticleTitle")
        title = "".join(title_el.itertext()).strip() if title_el is not None else ""
        authors = []
        for a in art.findall(".//Article/AuthorList/Author"):
            name = f"{a.findtext('ForeName') or ''} {a.findtext('LastName') or ''}".strip()
            if name:
                authors.append({"name": name})
        papers.append({
            "paperId": pmid,
            "title": title,
            "abstract": abstract,
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            "year": _pub_year(art),
            "authors": authors,
        })
    return papers


def fetch_papers(query, limit=25):
    """Search PubMed/MEDLINE and return papers (with abstracts) for a query.

    Two-step E-utilities flow -- esearch (query -> PMIDs) then efetch (PMIDs -> records).
    Returns the SAME dict shape the rest of the pipeline expects (paperId/title/abstract/
    url/year/authors), so nothing downstream -- Chroma, retrieve, the refusal guardrail,
    the eval harness -- has to change.
    """
    pmids = _esearch(query, retmax=limit)
    time.sleep(_REQUEST_PAUSE)
    papers = _efetch(pmids)
    time.sleep(_REQUEST_PAUSE)
    return papers


# --- 2. build the knowledge base (fetch -> cache -> Chroma) ------------------
def _collection():
    client = chromadb.PersistentClient(
        path=CHROMA_PATH, settings=Settings(anonymized_telemetry=False)
    )
    # cosine space so distances are comparable across queries (0 = identical).
    return client.get_or_create_collection("medical_papers", metadata={"hnsw:space": "cosine"})


def build_knowledge_base(queries=SEED_QUERIES, refresh=False):
    """Fetch papers for the seed queries, cache them, and (re)build the Chroma store."""
    papers = {}
    if os.path.exists(CACHE_PATH) and not refresh:
        papers = json.load(open(CACHE_PATH))
        print(f"Loaded {len(papers)} papers from cache ({CACHE_PATH}).")
    else:
        for q in queries:
            got = fetch_papers(q)
            for p in got:
                pid = p.get("paperId") or p.get("url")
                if pid:
                    papers[pid] = p  # keyed by id -> de-duplicates across queries
            print(f"  fetched {len(got):2d} papers for: {q}")
            time.sleep(1)  # be polite to the public API
        json.dump(papers, open(CACHE_PATH, "w"))
        print(f"Cached {len(papers)} unique papers -> {CACHE_PATH}")

    col = _collection()
    ids, docs, metas = [], [], []
    for pid, p in papers.items():
        authors = ", ".join(a.get("name", "") for a in (p.get("authors") or [])[:3])
        ids.append(pid)
        docs.append(p["abstract"])
        metas.append({
            "title": (p.get("title") or "")[:400],
            "url": p.get("url") or "",
            "year": p.get("year") or 0,
            "authors": authors,
        })
    if ids:
        col.upsert(ids=ids, documents=docs, metadatas=metas)  # upsert -> idempotent, no dupes
    print(f"Knowledge base ready: {col.count()} papers in Chroma ({CHROMA_PATH}).")
    return col.count()


# --- 3. retrieve -------------------------------------------------------------
def retrieve(query, k=TOP_K):
    """Return the k most relevant paper abstracts for the user's question."""
    col = _collection()
    if col.count() == 0:
        raise RuntimeError("Knowledge base is empty. Run:  medical_rag.py --build")
    res = col.query(query_texts=[query], n_results=k)
    hits = []
    for doc, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
        hits.append({"abstract": doc, "distance": float(dist), **meta})
    return hits


# --- 4. answer (grounded generation + guardrail) ----------------------------
def answer(query, k=TOP_K):
    hits = retrieve(query, k=k)
    # Guardrail: if the closest paper is not similar enough, refuse before the LLM runs.
    if not hits or hits[0]["distance"] > MAX_DISTANCE:
        return {"answer": REFUSAL, "refused": True, "sources": hits}
    context = "\n\n".join(
        f"[{i + 1}] {h['title']} ({h['year']})\n{h['abstract']}" for i, h in enumerate(hits)
    )
    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_API_KEY)
    resp = client.chat.completions.create(
        model=GEN_MODEL,
        temperature=0,  # deterministic generation
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"CONTEXT:\n{context}\n\nQUESTION: {query}"},
        ],
    )
    text = resp.choices[0].message.content.strip()
    return {"answer": text, "refused": text == REFUSAL, "sources": hits}


# --- CLI ---------------------------------------------------------------------
def _print_answer(query, result):
    print(f"\nQUESTION: {query}\n")
    print("Retrieved papers (cosine distance; lower = more relevant):")
    for i, h in enumerate(result["sources"], 1):
        print(f"  [{i}] d={h['distance']:.3f}  {h['title'][:70]} ({h['year']})")
    print("\nGrounded answer (gpt-4o, temp=0, cite-or-refuse):")
    print("  " + result["answer"].replace("\n", "\n  "))
    print(f"\n[refused={result['refused']}]")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Vaidya Nidaan medical RAG")
    ap.add_argument("question", nargs="*", help="a medical question to answer")
    ap.add_argument("--build", action="store_true", help="(re)build the knowledge base")
    ap.add_argument("--refresh", action="store_true", help="ignore cache; refetch from PubMed/MEDLINE")
    args = ap.parse_args()

    if args.build or args.refresh:
        build_knowledge_base(refresh=args.refresh)

    q = " ".join(args.question).strip()
    if q:
        _print_answer(q, answer(q))
    elif not (args.build or args.refresh):
        print('Usage:  medical_rag.py --build   |   medical_rag.py "your question"')
