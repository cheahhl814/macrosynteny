---
name: macrosynteny-interpret
description: 'Interpretation phase of macrosynteny (extension, evidence from a real 7-genome study): runs the vendored analyze_macrosynteny.py over ntSynt-viz / ntSynt artifacts to produce 20 downstream TSV tables — candidate fusions/fissions/inversions/translocations, reference chromosome fate, target contig origin, orientation patterns, block completeness, rearrangement profile/summary, analysis metadata. Reference genome is inferred from the links.tsv chain; requires chrom-paint-feats.tsv from ntSynt-viz. Has 2 ask-user stop points (SP1-SP2). Triggers: "interpret synteny blocks", "fusion fission analysis", "rearrangement analysis".'
version: 1.3.0
updated: "2026-10-09"
triggers:
  - "interpret synteny blocks"
  - "fusion fission analysis"
  - "rearrangement analysis"
---

# Macrosynteny Interpret

> **v1.3.0.** Turns the synteny view into biological interpretation tables — fusions, fissions, inversions, translocations, chromosome fates — using the vendored `bin/analysis/analyze_macrosynteny.py` (user-provenance, proven on a 7-genome real study; see `docs-corpus/macrosynteny-analysis/README.md`).

## 0. Inputs / Outputs contract

### Inputs (consumed)

| Path | Source | Required? |
| --- | --- | --- |
| `$RUN_DIR/output/links.tsv` (raw **gggenomes**-ordered, untouched by the FunMacroSynteny converter) | viz step 1 | yes |
| `<prefix>.chrom-paint-feats.tsv` | **ntSynt-viz** output (viz step 4) | yes |
| `<prefix>.sequence_lengths.sorted.tsv` (our `sequence_lengths.tsv` copied/renamed) | viz step 1 | yes |
| `$RUN_DIR/output/ntSynt.synteny_blocks.tsv` | run | yes |
| `$RUN_DIR/output/ntSynt.pre-collinear-merge.synteny_blocks.tsv` | run | optional |
| `viz-done.json` / `ntsynt-viz-done.json` | viz | yes (verdict ≥ PASS-WITH-WARNINGS) |

### Outputs (produced)

| Path | Owner | Format | Notes |
| --- | --- | --- | --- |
| `$RUN_DIR/analysis/*.tsv` | this skill | TSV (20 tables) | fusion/fission/inversion/translocation candidates, reference_chromosome_fate, target_contig_origin, orientation patterns/summary, block_completeness, per_species_block_span_summary, indel_missingness_summary, rearrangement_profile/summary, reference_to_target_correspondence(.long), synteny_block_status_table, normalized_block_genome_table, analysis_metadata |
| `$RUN_DIR/analysis/interpret-done.json` | this skill | JSON | Gate for qc (interpret summary folds into the report) |

### Verdict gate

Optional phase — the skill runs without it; but `qc` folds the summary tables into the report whenever `analysis/interpret-done.json` exists. Since v1.3.0, the telomere adjudication (§3) is a compulsory part of any fusion/fission interpretation.

## 0.5 Ask-User Stop Points

### SP1 — Reference genome

| Trigger | Evidence check | Action |
| --- | --- | --- |
| The script infers the reference as the **start** of the links.tsv chain (`bin_id` column never appearing in `bin_id2`) | For the default FAI order the first assembly is the reference — a biological choice, not a default | Ask: "the interpreter will treat `<first>` as the reference (all fates/origins are expressed relative to it) — (A) keep (recommended; matches FAI order), (B) rerun viz with a different FAI order" |

Auto-pick: keep (A) — viz order was already SP1-approved there.

### SP2 — Interpretation thresholds

| Trigger | Evidence check | Action |
| --- | --- | --- |
| Default fusion/translocation thresholds (fusion ≥ 1 Mb span or ≥ 10% fraction; translocation ≥ 500 kb) | Study-scale dependent; defaults were tuned on a Betta-sized (~350–650 Mb) study | Ask only when genome sizes differ by an order of magnitude from the defaults' study; options: scale with genome size (recommended) / keep defaults / custom |

Auto-pick: defaults.

## Description

The interpreter normalizes one row per block per genome, validates the linear genome chain, infers genome order and block orientations, then classifies structural events. Strict, loud failures (`fail()` → sys.exit) guard against mis-shaped inputs.

## Prerequisites

- pixi env (pandas, numpy); viz outputs complete; `chrom-paint-feats.tsv` present (requires the ntSynt-viz path in viz).

## Procedure

### 1. Assemble the interpreter's input view

```bash
mkdir -p "$RUN_DIR/analysis"
# The reader resolves all 4 inputs from one ntSynt-viz-style prefix if present:
#   <prefix>.links.tsv | <prefix>.chrom-paint-feats.tsv | <prefix>.sequence_lengths.sorted.tsv
# Our pipeline keeps those names: use --input-prefix "$RUN_DIR/output/<viz-prefix>"
# and pass the blocks TSVs explicitly:
pixi run --manifest-path <skill-root>/pixi.toml \
  python3 <skill-root>/bin/analysis/analyze_macrosynteny.py \
    --input-prefix "$RUN_DIR/output/<viz-prefix>" \
    --synteny-blocks "$RUN_DIR/output/ntSynt.synteny_blocks.tsv" \
    --premerge-synteny-blocks "$RUN_DIR/output/ntSynt.pre-collinear-merge.synteny_blocks.tsv" \
    --output-dir "$RUN_DIR/analysis"
```

### 2. Verify (always)

```bash
# 20 tables + metadata present and non-empty
ls "$RUN_DIR/analysis"/*.tsv | wc -l   # expect 20
# analysis_metadata.tsv records reference_genome, genome_order, thresholds — cross-check vs run-plan.json
cat "$RUN_DIR/analysis/analysis_metadata.tsv"
# rearrangement_summary.tsv is the headline table — sanity: reverse_fraction in [0,1]
awk -F'\t' 'NR>1 && ($8<0 || $8>1){bad=1} END{exit bad}' "$RUN_DIR/analysis/rearrangement_summary.tsv"
```

### 3. Telomere adjudication of fusion/fission candidates (COMPULSORY since v1.3.0)

Telomeric signal distinguishes a **real fusion/fission** from an **assembly-fragmentation artifact** (the user's stated rationale): fragmentation creates scaffold breaks lacking telomeric repeats, real events preserve telomere coherence at the true ends and are silent at the junction.

Telomere-present definition (canary-verified, tidk 0.3.0): `tidk ends` status `present` **or** `wrong_strand` (the telomere exists but on the reverse-complement strand — an inverted-end/misjoin hint; treat as enriched and note the hint), never `absent`.

Prerequisite: the qc phase's telomere evidence — `tidk ends` T2T status + `tidk search` per-window counts summarized by `bin/extras/telomere_to_json.py`, for every assembly. If the qc phase ran telomere-inconclusive, the adjudication marks every candidate `inconclusive` (never silently drops them).

Adjudication table:

| Candidate (from the tables) | Evidence check (telomere) | Real event | Fragmentation artifact |
| --- | --- | --- | --- |
| `candidate_fusions.tsv` — a target sequence carries ≥2 reference chromosomes | Both OUTER ends of the target sequence telomere-enriched AND the junction region between the two reference blocks NOT enriched | fusion supported (two intact chromosomes joined) | target sequence lacks telomeres at one/both ends — truncated scaffold; the "fusion" may be a contig artifact |
| `candidate_fissions.tsv` — a reference chromosome splits across ≥2 target sequences | Each fragment carries a telomere-enriched end AT the split boundary | fission supported (true break; each fragment keeps a real end) | neither fragment enriched at the split boundary — scaffold ends, not a biological break |
| `candidate_inversions.tsv` | Ends of the inverted span unchanged | (orientation-only — telomere-independent, skip) | — |

Write `$RUN_DIR/analysis/telomere_adjudication.tsv` — columns: `candidate_table, candidate_id, target_or_reference, telomere_verdict (real / fragmentation / inconclusive), evidence (ends-enriched flags + junction window counts)`. Short scaffolds (< 50 kb, no assessable windows) stay `inconclusive` — never counted as fragmenting an event.

### 4. Write outputs

`interpret-done.json`: `{"tables": [...], "telomere_adjudication": {"n_fusions_confirmed": n, "n_fissions_confirmed": n, "n_suppressed_as_fragmentation": n, "n_inconclusive": n}, "reference_genome": ..., "genome_order": [...], "thresholds": {fusion_min_span_bp, fusion_min_fraction, translocation_min_span_bp}, "verdict": "PASS", "warnings": []}`.

Then hand the summary tables + adjudication counts to qc — they go verbatim into `report/macrosynteny-report.md`'s interpretation section with one sentence per headline number, always pairing the raw candidate count with the telomere-confirmed count.

## Interpretation Guidelines

- **PASS**: 20 tables written; metadata reference/order matches run-plan; summary sane.
- **PASS-WITH-WARNINGS**: premerge file absent (fusion/fission candidates lose the pre-merge comparison; script warns and continues).
- **NO-GO**: links.tsv not a linear chain, duplicated block/genome rows, or missing chrom-paint input → `debug/macrosynteny-debug`.

## Troubleshooting — Signature library

| Signature in stderr / log | Likely cause | Suggested fix |
| --- | --- | --- |
| `links.tsv does not describe a simple linear genome order` | formatter emitted non-consecutive genome pairs, or FunMacroSynteny-shaped file was fed by mistake | feed the **raw gggenomes-ordered** links.tsv; for ≥3 genomes verify the formatter's consecutive-pair chain; never feed `links.funmacro.tsv` |
| `Required input file not found: ...chrom-paint-feats.tsv` | ntSynt-viz path was skipped in viz | re-run viz with ntSynt-viz (step 4) — the interpreter cannot run without the paint features |
| `Normalized table is not one row per block per genome` | duplicated (block_id, genome) entries in links | re-run the block detection (run phase); do not deduplicate silently |
| `unexpected block_status values` (WARN) | newer ntSynt added a discontinuity reason | informational — status-specific summaries exclude it; extend `KNOWN_BLOCK_STATUSES` only after checking docs-corpus/ntsynt |
| `ModuleNotFoundError: pandas` | invoked with the bare system python | always `pixi run` from the skill root |
| `ValueError: Expected exactly one start genome, found [...]` | cyclic or disconnected genome chain in links | inspect `output/links.tsv` bin_id/bin_id2 edge set; re-run viz with explicit `--order` |
| adjudication marked everything inconclusive | telomere evidence missing or motif wrong | re-run the qc telomere step with the resolved motif (SP1a there); never adjudicate absent evidence as real/fragmentation |
| a candidate is both fusion-like and fragmentation-like | short target sequence with one enriched end | read the junction window counts in the evidence column; when borderline, leave `inconclusive` and note the ambiguity in the report |

## Verification

- [ ] `$RUN_DIR/analysis/` holds the interpreter TSVs + `telomere_adjudication.tsv`.
- [ ] `analysis/interpret-done.json` verdict PASS/PASS-WITH-WARNINGS and carries the telomere adjudication counts.
- [ ] No fusion/fission candidate reported in the qc report WITHOUT its telomere verdict.

## What NOT to do

- Do not edit the vendored script per-dataset — thresholds are arguments, schema fixes go upstream via provenance.
- Do not run the interpreter without the ntSynt-viz chrom-paint input.
- Do not treat candidate_* tables as events per se — they are candidates with thresholds; state the thresholds in the report.
- Do not report a fusion or fission as REAL without a telomere verdict for it — an unadjudicated candidate is an inconclusive candidate.

## Handoff

On PASS/WARN → `qc/macrosynteny-qc` (folds the tables in); on NO-GO → `debug/macrosynteny-debug`.