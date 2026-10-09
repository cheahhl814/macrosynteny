# telomere-qc — docs-corpus index

**Role in this skill:** COMPULSORY telomeric-repeat evidence (since v1.3.0) — tidk `ends` + `search` for every assembly; scaffold-completeness context and the fusion/fission-vs-fragmentation adjudication, summarized by `bin/extras/telomere_to_json.py`.

- `telomere-json-schema.md` — JSON schema + interpretation patterns (both-ends enriched = likely complete chromosome; one-end = possible truncation; internal-only = interstitial telomeric repeats)
- `tidk-ends-format.md` — `tidk ends` output shapes (ends.tsv/bed/json), status vocabulary incl. wrong_strand semantics, and the adjudication wiring
