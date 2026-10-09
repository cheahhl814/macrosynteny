---
name: macrosynteny-qc
description: 'QC phase of macrosynteny: run the vendored de-novo synteny block statistics script (denovo_synteny_block_stats.py from BirolLab/ntSynt) over the blocks TSV + FAI files, sanity-check block counts and genome coverage against the Mash divergence, and write report/macrosynteny-report.md with verdict PASS/PASS-WITH-WARNINGS/NO-GO. Triggers: "synteny qc", "synteny block stats", "macrosynteny report".'
version: 1.3.0
updated: "2026-10-09"
triggers:
  - "synteny qc"
  - "synteny block stats"
  - "macrosynteny report"
---

# Macrosynteny QC

> **v1.3.0.** Mirrors `bettamt-qc`: load run artifacts → compute stats → write the final report with a verdict. Reads `run-done.json` (+ `viz-done.json` when present); writes `report/macrosynteny-report.md`.

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

### SP1a — Telomeric-repeat motif unknown

| Trigger | Evidence check | Action |
| --- | --- | --- |
| Taxon has no known motif and is not in `tidk find`'s clade list | Compulsory evidence needs a motif | Ask: "no known telomeric repeat for this taxon — (A) run `tidk explore` and take the strong edge-enriched candidate (recommended), (B) you supply the motif, (C) proceed telomere-inconclusive (caps verdict at PASS-WITH-WARNINGS)" |

Auto-pick: none — evidence-class decision.

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

### 1b. Telomere evidence (COMPULSORY since v1.3.0 — vendored helper, `bin/extras/`)

Telomere signal is the discriminator between a REAL fusion/fission and a fragmented assembly: a fragmented genome produces spurious candidate fissions/fusions precisely where scaffolds end without telomeres, while a true fusion/fission is telomere-coherent at the junctions and the true ends. Run for EVERY assembly (docs: `docs-corpus/tidk/cli-reference.md`, `bin/extras/telomere-readme.md`).

```bash
# per assembly (motif determined at preflight -> run-plan.json.telomere.motif):
# 1) T2T end-calling: telomeres present at each sequence end?
pixi run --manifest-path <skill-root>/pixi.toml \
  tidk ends -s TTAGGG -o a_ends -d "$RUN_DIR/telomere" "$RUN_DIR/input/a.fa"
# 2) per-window repeat counts -> JSON summary (telomere_to_json.py consumes the search TSV form):
pixi run --manifest-path <skill-root>/pixi.toml \
  tidk search -s TTAGGG -o a_search -d "$RUN_DIR/telomere" -w 10000 "$RUN_DIR/input/a.fa"
find "$RUN_DIR/telomere" -name '*search*.tsv' | while read T; do
  python3 "<skill-root>/bin/extras/telomere_to_json.py" "$T"
done
```

**Motif determination (do this before searching)**: known motif (user/clade literature) → use it; unknown → `tidk find -c <clade> -p` prints the clade's repeat (clade list in cli-reference.md); still unknown → `tidk explore` discovers de-novo repeat candidates (SP1 below). Record the motif + its source in the report.

`tidk ends` (canary-verified shapes, tidk 0.3.0): `--output a_ends` writes `a_ends.ends.tsv` (columns `id, sequence_length, side, status, telomere_start, telomere_end, telomere_length, offset, strand, window_limited`) + `a_ends.ends.bed` + `a_ends.ends.json` (counters: `t2t`, `one_end`, `no_ends`, plus `wrong_strand[]` entries, `tidk_version`). Status vocabulary: `present` / `absent` / `wrong_strand`. **`wrong_strand` and the C-rich/G-rich strand annotation = telomere PRESENT** (an inverted-end/misjoin hint, not absence) — adjudication treats them as enriched; note the inversion hint in the report. `tidk search` writes `<output>_telomeric_repeat_windows.tsv` (header `id, window, forward_repeat_number, reverse_repeat_number, telomeric_repeat`) — the TSV the vendored `telomere_to_json.py` consumes. Formats: `docs-corpus/telomere-qc/tidk-ends-format.md`.

Report fields (compulsory): `scaffolds_with_both_ends_enriched / num_scaffolds` per assembly (T2T-ness), and the telomere-based adjudication of every candidate fusion/fission when interpretation tables exist (see `analysis/macrosynteny-interpret` §4). A run WITHOUT telomere evidence cannot reach `PASS` — cap at `PASS-WITH-WARNINGS (telomere-inconclusive)` with the reason stated.

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

- **PASS**: statistics within the divergence-implied envelope; artifacts complete; telomere evidence run + motif recorded.
- **PASS-WITH-WARNINGS**: coverage/block-count edge cases, OR telomere evidence inconclusive (motif not determinable, telomere-inconclusive cap).
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
| `tidk: command not found` | pixi env stale (tidk compulsory in v1.3.0) | `pixi install` re-run at the skill root |
| `tidk telomeric: unrecognized subcommand` | subcommand name drift ('telomeric' was never valid; windows come from `tidk search`) | use `tidk search` / `tidk ends` per docs-corpus/tidk |
| `tidk search` TSV has zero windows for a scaffold | scaffold < window size | skip in the summary (telomere_to_json handles it) — note scaffolds < 50 kb as telomere-inconclusive |
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