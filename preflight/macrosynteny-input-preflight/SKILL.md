---
name: macrosynteny-input-preflight
description: 'Preflight for macrosynteny analysis: validate ≥2 genome FASTA assemblies (gzipped OK; optional NCBI retrieval via the biodb-fetch dependency skill when assemblies are not local; resolves the telomeric-repeat motif for tidk evidence), generate samtools faidx indexes, compute Mash pairwise divergence sketch/dist matrix, derive the ntSynt -d parameter cascade (block_size/indel/merge/w_rounds from the README divergence table), and write preflight.md + run-plan.json with verdict GO/GO-WITH-WARNINGS/NO-GO. Has 6 ask-user stop points (SP1-SP6; SP6 sets the compulsory telomeric motif). Triggers: "macrosynteny preflight", "synteny preflight", "compare assemblies preflight".'
version: 1.3.0
updated: "2026-10-09"
triggers:
  - "macrosynteny preflight"
  - "synteny preflight"
  - "compare assemblies preflight"
---

# Macrosynteny Input Preflight

> **v1.3.0.** Mirrors `bettamt-preflight`: gather inputs → compute evidence → write `run-plan.json` (machine contract) + `preflight.md` (human audit). **Never** invokes the run sub-skill. `build/ntsynt-run` refuses to run without `preflight.md` ≥ `GO-WITH-WARNINGS`.

## Audience

- **AI Agents**: Triggered by the phrases above. Must run all evidence steps, then write the two artifacts.
- **Human Users**: Provides a transparent audit trail of every parameter choice.

## When to Use This Skill

Use this skill if:

- You are starting a macrosynteny run on 2+ whole-genome FASTA assemblies.
- You need to pick the ntSynt `-d` divergence and its parameter cascade from measured Mash distances.

Do NOT use this skill if:

- You only want visualization of **existing** ntSynt blocks — go to `viz/funmacro-viz` directly.
- You want micro/gene-level synteny (see orchestrator anti-use cases).

## 0. Inputs / Outputs contract

### Inputs (consumed)

| Path | Source | Required? |
| --- | --- | --- |
| `$RUN_DIR/*.fa[.gz]` or FASTA paths named in the prompt | User | yes (≥ 2) |
| `$RUN_DIR/preflight.md`, `$RUN_DIR/run-plan.json` (absent on first run) | this sub-skill | no |

### Outputs (produced)

| Path | Owner | Format | Notes |
| --- | --- | --- | --- |
| `$RUN_DIR/preflight.md` | this skill | markdown | Human audit trail, overall verdict |
| `$RUN_DIR/run-plan.json` | this skill | JSON | Machine contract for `build/ntsynt-run` (schema below) |
| `$RUN_DIR/preflight_evidence.txt` | this skill | text | Raw evidence |
| `<fasta>.fai` (next to each input, or in `$RUN_DIR/index/`) | samtools faidx | FAI | Consumed by viz + qc |

### Verdict gate

`build/ntsynt-run` **refuses to run** unless `$RUN_DIR/preflight.md` verdict is `GO` or `GO-WITH-WARNINGS`.

## 0.5 Ask-User Stop Points

### SP1 — Divergence source ambiguous

| Trigger | Evidence check | Action |
| --- | --- | --- |
| User names a `-d` value AND Mash distances disagree strongly (e.g. user says 1%, Mash says 8%) | Measured-vs-stated conflict | Ask: "you said `-d <X>`, Mash measures ≈`<max Y>%` — (A) trust Mash (recommended, auto-picks the cascade), (B) keep your `-d`, (C) run both" |

Auto-pick when: no user `-d` given → trust Mash.

### SP2 — Fewer than 2 valid assemblies

| Trigger | Evidence check | Action |
| --- | --- | --- |
| Only 1 valid FASTA (or all fail) | NO-GO territory — ntSynt needs ≥ 2 genomes | Stop and ask for the missing assemblies; do not proceed |

### SP3 — Draft/fragmented assemblies detected

| Trigger | Evidence check | Action |
| --- | --- | --- |
| Very high scaffold/contig counts (e.g. > 10k contigs in a Gbp genome) | ntSynt works on contigs but block count inflates and viz gets noisy | Warn: recommend chromosome-scale assemblies for best results; ask (A) proceed as-is, (B) aggregate small contigs above a length threshold in the viz layer only (recommended), (C) abort |

Auto-pick: proceed with (A) and log the warning when user is absent (batch mode) — but always surface it in `preflight.md`.

### SP6 — Telomeric-repeat motif for the compulsory telomere evidence (v1.3.0)

| Trigger | Evidence check | Action |
| --- | --- | --- |
| User named a motif or the taxon maps to a `tidk find` clade | Unambiguous | Record motif + source; no ask |
| Taxon not in the clade list and no motif known | Compulsory downstream evidence needs a motif | Ask: "(A) run `tidk explore` on one assembly and adopt the strongest edge-enriched candidate (recommended), (B) you supply the motif, (C) skip telomere evidence — caps the final verdict at PASS-WITH-WARNINGS (telomere-inconclusive, and fusion/fission candidates cannot be adjudicated)" |

Auto-pick: none — evidence-class decision.

### SP4 — Divergence > 10% or mixed divergences

| Trigger | Evidence check | Action |
| --- | --- | --- |
| Max pairwise Mash distance > 10% — or one genome is > a few % while another is ~0.1% from the rest | The single `-d` cascade may be wrong for the set | Ask: "(A) run ntSynt with the >10% defaults (recommended), (B) split the genome set into sub-groups and run per group, (C) proceed with custom override" |

Auto-pick when: max divergence ≤ 10% and spread < 2×.

### SP5 — Local FASTAs absent but accessions/taxa named

| Trigger | Evidence check | Action |
| --- | --- | --- |
| No valid FASTAs in `$RUN_DIR` but the user named NCBI accessions / assembly names / taxa | Assemblies must be retrieved from a database — never fetched inline | Propose: "I don't see the genome FASTAs, but I see accession(s) `<X>`. Retrieve via the dependency skill **biodb-fetch** (NCBI Datasets, cached + manifest contract)? (A) yes — fetch all listed accessions (recommended), (B) I'll place the FASTAs in `$RUN_DIR/input/` myself, (C) abort. State which accessions will be fetched and confirm before the network call. |"

Auto-pick when: user already said "download/it's in a database" → fetch with biodb-fetch (still announce the accessions). If biodb-fetch is not deployed: tell the user (install: clone https://github.com/cheahhl814/biodb-fetch into your agent's skills directory); NEVER fetch from NCBI inline as a workaround.

## Description

This sub-skill computes 4 pieces of evidence (FASTA validity, FAI indexes, Mash distances, parameter cascade) and emits `run-plan.json` + `preflight.md`.

## Prerequisites

- pixi env (the skill root's `pixi.toml`): `samtools`, `mash`, `ntsynt` present.
- Work dir `$RUN_DIR` with ≥ 2 input FASTAs (plain or gzip/bgzip).

## Procedure

### 1. Gather inputs

| Input | Required? | Default |
| --- | --- | --- |
| FASTA paths (≥2, gzipped OK) | yes | — (if absent but accessions named → SP5 retrieval via biodb-fetch) |
| User-specified divergence / parameters | no | Mash-derived |
| Visualization length threshold | no | `10000` (blocks shorter than this are dropped from links.tsv) |

### 2. Compute evidence (always run; never skip)

```bash
cd "$RUN_DIR" || exit 1
SKILL_DATA=<path-to>/skills/macrosynteny   # skill root (docs-corpus, bin/)
# 0) Optional retrieval (SP5): assemblies not on disk → biodb-fetch genome path
#    python3 <skills>/biodb-fetch/scripts/ncbi_datasets.py genome \
#        --accession <ACCESSION> --outdir "$RUN_DIR/input/"
#    Verify manifest.tsv contract_version before consuming payloads; record manifest
#    row paths in run-plan.json.provenance. Retrieved FASTAs flow through 2a–2e as normal.
# 2a) Inputs: count + readability (gunzip -t for .gz)
# 2b) FAI: samtools faidx <input> (writes <input>.fai)
# 2c) Genome sizes: awk '{s+=$2} END {print s}' <input>.fai
# 2d) Mash: for each input, `mash sketch -o <name>.msh <input>`; then pairwise
#     `mash dist <a>.msh <b>.msh` — record (1 - 1/100 * distance * 100) i.e.
#     the **sequence divergence** Mash reports as an estimate of actual nucleotide divergence.
# 2e) -d = ceil(max pairwise divergence as %); pick cascade per the ntSynt README table:
#       -d 1  → block_size 500,  indel 10000,  merge 10000,    w_rounds 100 10
#       -d 5  → block_size 1000, indel 50000,  merge 100000,   w_rounds 250 100   (for 1-10%)
#       -d 15 → block_size 10000, indel 100000, merge 1000000, w_rounds 500 250  (for >10%)
#     Record both -d and every per-flag override actually used in run-plan.json.
```

Record every measurement in `preflight_evidence.txt` with the exact command used.

### 3. Write outputs

#### 3a) `run-plan.json` schema

```json
{
  "assemblies": ["path/to/a.fa", "path/to/b.fa"],
  "fai": ["path/to/a.fa.fai", "path/to/b.fa.fai"],
  "genome_sizes_bp": {"a": 3000000000, "b": 2800000000},
  "mash_divergence_pct": {"a-b": 1.3},
  "ntsynt_args": {
    "-d": 2, "-b": 1000, "--indel": 50000, "--merge": "100000", "--w_rounds": [250, 100],
    "-p": "ntSynt", "-t": 8
  },
  "telomere": {"motif": "TTAGGG", "motif_source": "user | find:<clade> | explore | none(inconclusive)", "window_bp": 10000},
  "viz": {"length_threshold": 10000, "colour_assembly": "a.fa"},
  "provenance": {"retrieved": [{"accession": "GCF_000001405.40", "manifest_row": "input/manifest.tsv", "payload": "input/GCF_000001405.40.fna"}]},
  "verdict": "GO",
  "warnings": [],
  "generated": "<ISO8601>"
}
```

Field rules: `-d` and cascade values are **integers as ntSynt accepts** (`--merge` may be `3w` style). `viz.colour_assembly` defaults to the first assembly. Everything downstream (run/viz/qc) reads this file — do not re-derive parameters.

#### 3b) `preflight.md`

Markdown with the standard table (assembly readability, FAI success, genome sizes, pairwise divergence matrix, chosen cascade, warnings) and the overall verdict.

## Interpretation Guidelines

- **GO**: ≥ 2 assemblies pass, FAIs generated, Mash runs, cascade within a known regime.
- **GO-WITH-WARNINGS**: fragmented assemblies, divergence near a regime boundary, or user-override divergence.
- **NO-GO**: < 2 valid assemblies or unreadable inputs. Stop.

## Troubleshooting — Signature library

| Signature in stderr / log | Likely cause | Suggested fix |
| --- | --- | --- |
| `mash: command not found` | pixi env not installed | `pixi install` at the skill root; then `pixi run mash sketch ...` |
| `samtools faidx: failed to open` | file path wrong, or .gz without bgzip | `gunzip -t` / `file input.gz` — bgzip for .gz; plain FAI for .fa |
| `mash dist: sketches have incompatible k` | re-sketching with different -k | re-sketch all inputs with the same defaults, never mix old .msh files |
| `.fai` exists but 0 lines | empty/corrupt FASTA | re-check the download; `wc -c`, gzip -t |
| divergence reported > 100 | mash dist misinterpretation — used similarity instead of divergence | use `(1 - mash_distance_score) * 100` — see Mash docs (docs-corpus/mash) |
| assembly has thousands of contigs | fragmented input (see SP3) | warn; suggest viz-layer contig aggregation |
| `No module named Bio` from biodb-fetch's ncbi_fetch.py | biodb-fetch's Entrez env differs from this skill's pixi env | invoke biodb-fetch scripts via ITS OWN pixi env (`pixi run --manifest-path <biodb-fetch>/pixi.toml`) — skills own their environments; do not copy BioPython into this skill |
| biodb-fetch `manifest.tsv` missing `contract_version` | stale biodb-fetch deploy | `pixi run update-check` inside the biodb-fetch skill dir; re-deploy before proceeding |
| duplicated downloads (same accession twice) | cache bypassed | biodb-fetch shared store dedupes — don't pass `--refresh` unless explicitly re-fetching |
| `tidk find: clade not found` | taxon outside tidk's clade list | use `tidk explore` (de-novo repeat discovery) or a user-supplied motif; record the source in run-plan.json.telomere.motif_source |
| `tidk explore` returns no strong candidate | repeat-poor or very divergent telomere motif | SP6 option B/C; never silently pick a weak candidate as the motif |

## Verification

- [ ] `run-plan.json` exists and is valid JSON with `verdict`.
- [ ] `preflight.md` exists with overall verdict.
- [ ] `preflight_evidence.txt` exists with raw evidence.
- [ ] Every assembly has an `.fai` file.

## What NOT to do

- Do not run ntSynt from this sub-skill — that is `build/ntsynt-run`.
- Do not hardcode `-d` without measuring (or asking at SP1).
- Do not proceed to `run` on a `NO-GO`.

## Handoff

On `GO`/`GO-WITH-WARNINGS` → hand off to `build/ntsynt-run`; on `NO-GO` → stop and report.