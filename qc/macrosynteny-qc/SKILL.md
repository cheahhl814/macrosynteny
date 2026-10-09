---
name: macrosynteny-qc
description: 'QC phase of macrosynteny: run the vendored de-novo synteny block statistics script (denovo_synteny_block_stats.py from BirolLab/ntSynt) over the blocks TSV + FAI files, sanity-check block counts and genome coverage against the Mash divergence, and write report/macrosynteny-report.md with verdict PASS/PASS-WITH-WARNINGS/NO-GO. Triggers: "synteny qc", "synteny block stats", "macrosynteny report".'
version: 1.2.0
updated: "2026-10-09"
triggers:
  - "synteny qc"
  - "synteny block stats"
  - "macrosynteny report"
---

# Macrosynteny QC

> **v1.2.0.** Mirrors `bettamt-qc`: load run artifacts → compute stats → write the final report with a verdict. Reads `run-done.json` (+ `viz-done.json` when present); writes `report/macrosynteny-report.md`.

## 0. Inputs / Outputs contract

### Inputs (consumed)

| Path | Source | Required? |
| --- | --- | --- |
| `$RUN_DIR/output/ntSynt.synteny_blocks.tsv` | run | yes |
| `$RUN_DIR/output/run-done.json` (verdict ≥ PASS-WITH-WARNINGS) | run | yes |
| `$RUN_DIR/run-plan.json` (assemblies, fai, divergence) | preflight | yes |
| FAI files for every assembly | preflight | yes |
| `$RUN_DIR/output/viz-done.json` | viz | optional |

### Outputs (produced)

| Path | Owner | Format | Notes |
| --- | --- | --- | --- |
| `$RUN_DIR/report/macrosynteny-report.md` | this skill | markdown | The final audit-report; verdict PASS / PASS-WITH-WARNINGS / NO-GO |
| `$RUN_DIR/report/qc-verdict.json` | this skill | JSON | Machine verdict for the orchestrator gate |
| `$RUN_DIR/report/block_stats.tsv` | this skill | TSV | Raw stats output from the vendored script |

### Verdict gate

The orchestrator routes `qc-done` only when `qc-verdict.json` verdict is `PASS`/`PASS-WITH-WARNINGS`.

## 0.5 Ask-User Stop Points

### SP1 — Unexpected coverage vs divergence

| Trigger | Evidence check | Action |
| --- | --- | --- |
| Total covered fraction per genome disagrees wildly with the Mash divergence (e.g. 0.1% divergence genomes with < 50% coverage; or highly diverged genomes with near-full coverage) | A mis-set `-d` or a contaminant/admixture genome | Ask: "(A) re-run with the adjacent `-d` regime (recommended), (B) accept (biological reason known), (C) stop" |

Auto-pick: none — this is the report's judgment call, ask.

## Description

Statistics come from the upstream `analysis_scripts/denovo_synteny_block_stats.py` (vendored, GPL-3); the agent adds only cross-checks and narrative interpretation.

## Prerequisites

- pixi env (python, pandas, numpy).
- Run artifacts complete.

## Procedure

### 1. Compute de-novo block statistics (vendored)

```bash
STATS="<skill-root>/bin/stats/denovo_synteny_block_stats.py"
mkdir -p "$RUN_DIR/report"
(cd "$RUN_DIR/output" && pixi run --manifest-path <skill-root>/pixi.toml \
  python3 "$STATS" --tsv ntSynt.synteny_blocks.tsv --fai a.fa.fai b.fa.fai c.fa.fai \
  > "$RUN_DIR/../report/block_stats.tsv")
python3 "$STATS" -h   # flag reference; also in docs-corpus/ntsynt
```

### 1b. (Optional) telomere-signal scaffold QC (vendored, `bin/extras/`)

Scaffold-completeness context for the coverage numbers: which assemblies carry true telomeres vs truncated scaffolds. Uses `tidk telomeric` (bioconda, pinned in pixi.toml) + the vendored `telomere_to_json.py`; full schema + interpretation patterns in `bin/extras/telomere-AGENTS.md` and `docs-corpus/telomere-qc/`.

```bash
# per assembly: search the (species-appropriate) telomeric repeat in windows
pixi run --manifest-path <skill-root>/pixi.toml \
  tidk telomeric --search TTAGGG -o "$RUN_DIR/telomere/a" --window 10000 --extension 4 a.fa
find "$RUN_DIR/telomere" -name '*TSV' -o -name '*tsv' | while read T; do
  python3 "<skill-root>/bin/extras/telomere_to_json.py" "$T"
done
```

Read the JSON `telomere_signal.{start,end}_region.enriched` flags — fold `scaffolds_with_telomere_signal / num_scaffolds` per assembly into the report's coverage interpretation ("blocks span chromosome ends in N/M assemblies" vs "truncated scaffolds inflate block-to-size ratios").

### 1c. (Optional) fold the interpretation tables

When `analysis/interpret-done.json` exists (run `analysis/macrosynteny-interpret` first), pull its `rearrangement_summary.tsv` + candidate counts verbatim into the report's interpretation section — thresholds stated, reference genome named.

### 2. Cross-checks (always run)

```bash
# 2a) column-count integrity (8 columns; strand col 6 in +/-)
# 2b) per-genome coverage: sum block spans per genome / genome size from FAI
# 2c) block count scale check: warn when > 50k blocks or < 10 blocks (regime mis-set)
# 2d) strand balance: warn when one genome is dominantly '-' vs others (possible reverse complement)
# 2e) viz consistency (when viz-done.json exists): links.tsv block_id set ⊆ blocks TSV block_id set
```

Record each check's measured value in `report/qc-verdict.json` `checks` array.

### 3. Write the report

`report/macrosynteny-report.md` standard shape:

- **Overall verdict** first line (PASS ✅ / PASS-WITH-WARNINGS ⚠️ / NO-GO ❌).
- **Evidence table**: n_blocks, n_genomes, per-genome coverage %, median/mean block length, Mash divergence used, length threshold dropped count, any strand-balance flag.
- **Interpretation**: 3-6 sentences tying coverage/divergence/block counts to the biological question (e.g. "blocks shared by all 4 great-ape genomes cover 84–91% per genome, consistent with the ≈1.3% max divergence").
- **Artifacts list**: every file path produced by the run.
- **Next steps** if PASS-WITH-WARNINGS.

## Interpretation Guidelines

- **PASS**: statistics within the divergence-implied envelope; artifacts complete.
- **PASS-WITH-WARNINGS**: coverage or block-count edge cases; SP1 asked and answered.
- **NO-GO**: empty/degenerate blocks, or cross-check contradictions → `debug/macrosynteny-debug`.

## Troubleshooting — Signature library

| Signature in stderr / log | Likely cause | Suggested fix |
| --- | --- | --- |
| `denovo_synteny_block_stats.py: error: --fai required` | FAI missing for one assembly | re-run preflight step 2b for that assembly |
| `pandas.errors.ParserError` on block_stats.tsv | TSV got R instead of a header/rows from an old shell redirect | regenerate with `> report/block_stats.tsv` exactly (see §1) |
| coverage sums to < 1% everywhere | `-d` regime mismatched the real divergence | SP1 / preflight SP4 re-check |
| `KeyError: FAI` inside the stats script | FAI paths not passed for every assembly | pass all FAIs verbatim from run-plan.json |
| stats script emits nothing on stdout | old python or import error | check `pixi run python3 --version`; consult signature library in debug sub-skill |
| block count explodes (>> expected) | fragmented assemblies | rerun viz at a higher length threshold; note the caveat in the report |
| `tidk: command not found` | pixi env stale (tidk added in v1.2.0) | `pixi install` re-run at the skill root |
| telomere JSON shows 0 enriched scaffolds for a polished assembly | wrong repeat motif for the taxon (e.g. vertebrate TTAGGG vs insect TTGGGG) | re-run `tidk telomeric --search` with the correct motif; check per-taxon literature / repeat motifs in docs-corpus/telomere-qc |
| `tidk telomeric: could not infer telomere length` | empty/minimal fixture | EXEC-SKIP telomere check for tiny fixtures (scaffolds < 50 kb lack assessable windows) |

## Verification

- [ ] `report/block_stats.tsv` non-empty.
- [ ] `report/macrosynteny-report.md` exists with overall verdict.
- [ ] `report/qc-verdict.json` valid JSON with `verdict`.

## What NOT to do

- Do not re-run ntSynt or viz from this sub-skill — report on their artifacts only.
- Do not fabricate statistics; every number must come from block_stats.tsv or the FAI sizes.
- Do not publish the viz HTML without this report when run in batch/CI mode.

## Handoff

On PASS/PASS-WARN → surface `report/macrosynteny-report.md` to the user (orchestrator `qc-done`); on NO-GO → `debug/macrosynteny-debug`.