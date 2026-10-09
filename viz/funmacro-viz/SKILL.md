---
name: funmacro-viz
description: 'Visualization phase of macrosynteny: convert an ntSynt synteny_blocks.tsv into the gggenomes/FunMacroSynteny interchange TSVs (links.tsv + sequence_lengths.tsv) with the vendored ntSynt formatting scripts (FAI order = genome order), then bake a single interactive HTML via the vendored FunMacroSynteny app (macrosynteny.py). Covers genome/chromosome ordering, contig aggregation, browser serving, and the 300-DPI PNG / SVG / single-file-collaborator exports. Has 3 ask-user stop points (SP1-SP3). Triggers: "visualize synteny", "funmacro html", "render synteny blocks".'
version: 1.1.0
updated: "2026-10-09"
triggers:
  - "visualize synteny"
  - "funmacro html"
  - "render synteny blocks"
---

# FunMacroSynteny Viz

> **v1.1.0.** Converts the run's blocks TSV into `links.tsv` + `sequence_lengths.tsv`, then bakes the interactive single-file HTML. Reads `run-done.json`; writes `output/funmacrosynteny.html`.

## 0. Inputs / Outputs contract

### Inputs (consumed)

| Path | Source | Required? |
| --- | --- | --- |
| `$RUN_DIR/output/ntSynt.synteny_blocks.tsv` | `build/ntsynt-run` | yes |
| `$RUN_DIR/output/run-done.json` (verdict PASS/PASS-WITH-WARNINGS) | `build/ntsynt-run` | yes |
| FAI files for every compared assembly | preflight | yes |
| `run-plan.json: viz.{length_threshold, colour_assembly}` | preflight | yes |

### Outputs (produced)

| Path | Owner | Format | Notes |
| --- | --- | --- | --- |
| `$RUN_DIR/output/links.tsv` | this skill | TSV (9 cols or 10 with strand) | Interchange format; gggenomes-compatible |
| `$RUN_DIR/output/sequence_lengths.tsv` | this skill | TSV (4 cols) | Chromosome lengths + relative_orientation |
| `$RUN_DIR/output/funmacrosynteny.html` | this skill | HTML | Single-file interactive viz |
| `$RUN_DIR/output/viz-done.json` | this skill | JSON | Gate for qc |

### Verdict gate

`qc/macrosynteny-qc` refuses to run unless `output/viz-done.json` verdict is `PASS`/`PASS-WITH-WARNINGS` **or** the run's `run-done.json` says viz was skipped with reason.

## 0.5 Ask-User Stop Points

### SP1 — Genome order

| Trigger | Evidence check | Action |
| --- | --- | --- |
| ≥ 3 assemblies (FAI order defines genome order) | Ambiguous display order | Ask: "what display order for the N genomes? FAI order currently: A, B, C — (A) keep (recommended), (B) reorder" |

Auto-pick: keep preflight FAI order for ≤ 2 genomes.

### SP2 — Length threshold

| Trigger | Evidence check | Action |
| --- | --- | --- |
| Blocks below `run-plan.viz.length_threshold` (default 10000) get dropped from links.tsv | A noisy draft assembly produces hairball plots | Suggest raising `length_threshold`; ask only when > 1% of blocks would be dropped |

Auto-pick: `run-plan.viz.length_threshold`.

### SP3 — Contig aggregation for draft assemblies

| Trigger | Evidence check | Action |
| --- | --- | --- |
| Input genome has > ~10,000 sequences per FAI | Unreadable viz; the length threshold plus `sort_ntsynt_blocks.py` ordering can still work | Ask: "(A) plot as-is, (B) use `--aggregation` if provided via preflight, (C) restrict viz to the top-N longest chromosomes per genome" |

Auto-pick: (A) unless SP3's trigger fires.

## Description

The conversion is deterministic: one vendored script chain + one vendored web app. The agent's judgment is limited to ordering/threshold/aggregation.

## Prerequisites

- pixi env (pandas, numpy, python 3.12).
- FAI for each assembly produced at preflight.

## Procedure

### 1. Convert blocks → interchange TSVs (vendored, GPL-3, BirolLab/ntSynt)

```bash
VIZ="<skill-root>/bin/viz"
mkdir -p "$RUN_DIR/output"
(cd "$RUN_DIR/output" && pixi run --manifest-path <skill-root>/pixi.toml \
  bash "$VIZ/prepare_gggenomes_inputs.sh" \
    ntSynt.synteny_blocks.tsv macrosynteny 10000 a.fa \
    a.fa.fai b.fa.fai c.fa.fai)
# - FAI order = genome order (SP1)
# - the mlr sort used upstream is replaced by sort_links_mlr_compat.py inside the wrapper

# 1b. Convert to FunMacroSynteny's schema (bin_id before seq_id; drop extras):
#     CANARY-VERIFIED gotcha: the gggenomes formatter emits `seq_id` BEFORE `bin_id`
#     plus block_ori/colour_block extras — FunMacroSynteny needs
#     block_id bin_id seq_id start end bin_id2 seq_id2 start2 end2 [strand].
#     links_gggenomes_to_funmacro.py reorders + sorts each pair's coordinates.
pixi run --manifest-path <skill-root>/pixi.toml \
  python3 "$VIZ/links_gggenomes_to_funmacro.py" "$RUN_DIR/output/links.tsv" "$RUN_DIR/output/links.funmacro.tsv"
# keep the raw gggenomes links.tsv for R/gggenomes workflows; bake from links.funmacro.tsv
```

### 2. Validate the interchange TSVs

```bash
# links.tsv header must be: block_id bin_id seq_id start end bin_id2 seq_id2 start2 end2 [strand]
head -1 "$RUN_DIR/output/links.tsv"
# sequence_lengths.tsv header: bin_id seq_id length relative_orientation
head -1 "$RUN_DIR/output/sequence_lengths.tsv"
# start < end in every row of both files
awk -F'\t' 'NR>1 && $4>$5 {bad++} END{print bad+0 " bad spans"; exit bad>0}' "$RUN_DIR/output/links.tsv"
```

### 3. Bake the single-file interactive HTML (vendored FunMacroSynteny)

```bash
FM="<skill-root>/bin/funmacrosynteny"
python3 "$FM/macrosynteny.py" "$RUN_DIR/output/links.funmacro.tsv" -o "$RUN_DIR/output/funmacrosynteny.html" --no-browser
# optional companion: FunMacroSynteny's generate_links_tsv.py can merge
# sequence_lengths.tsv info into links.tsv when chromosome lengths must be
# accounted for — run it if links rows lack lengths the app needs
```

The app loads `d3` from the CDN at view time (https://d3js.org — needs internet on first open) and the local `src/*.js` modules, which `prepare_links`/bake keep alongside the html in the same directory tree. For a **fully offline single file** (`Export Hub → Collaborator Mode`), open it in a browser once and use the app's own export — the baked `window.bakedData` TSV already travels inside the file.

### 2b. FunMacroSynteny input-shape requirements (evidence: `docs-corpus/funmacrosynteny/app-notes.md`)

Three facts change how raw ntSynt output is prepared — verified by reading `generate_links_tsv.py`, `macrosynteny.py`, and the upstream tests:

1. **Pairwise rows only**: the viewer draws each row as ONE link between exactly two genomes (`bin_id/seq_id/start/end` ↔ `bin_id2/seq_id2/start2/end2`). For multi-genome runs, feed FunMacroSynteny one **pairwise** links.tsv per adjacent genome pair (or against a chosen reference), not the raw N-genome blocks TSV. The gggenomes-format `links.tsv` from `prepare_gggenomes_inputs.sh` is already pairwise; if it links blocks between consecutive genome pairs, pass it through directly.
2. **No chromosome-length input**: the app sizes each chromosome to the furthest block end it sees — chromosomes without a block near their end render truncated. `generate_links_tsv.py` fixes this by padding uncovered chromosome tails with `nonsyn_<n>` filler rows (`null` second coordinates). Use it when chromosome completeness matters:

```bash
python3 "<skill-root>/bin/funmacrosynteny/generate_links_tsv.py" \
    --links-tsv "$RUN_DIR/output/links.tsv" \
    --sequence-lengths "$RUN_DIR/output/sequence_lengths.tsv" \
    > "$RUN_DIR/output/links.padded.tsv"   # stdout; check upstream usage via cli-reference.md
```

3. **Column hygiene**: `generate_links_tsv.py` keeps `strand` but drops every other extra column; upstream's test `sequence_lengths` file contains a space-vs-tab defect (`Sample 2 <space><length>`) that our generated files must NOT copy — always emit real tabs.

### 4. Serve + verify

```bash
# verify the baked data is in the html
grep -c "window.bakedData" "$RUN_DIR/output/funmacrosynteny.html" || echo "WARN: data not baked"
# headless/opening the app:
python3 -m http.server 8765 --directory "$RUN_DIR/output" &
# user browses http://localhost:8765/funmacrosynteny.html
```

Optionally open it: `xdg-open "$RUN_DIR/output/funmacrosynteny.html"` (Linux) / `open ...` (macOS). **Verification without a browser**: the data must be baked (`window.bakedData` non-empty) and the TSVs must validate in step 2 — pixel-level verification is manual.

### 5. Write outputs

`viz-done.json`: `{"links_tsv": ..., "sequence_lengths_tsv": ..., "html": ..., "genome_order": [...], "length_threshold": N, "verdict": "PASS", "warnings": []}`.

## Interpretation Guidelines

- **PASS**: TSVs validate, data baked into the HTML.
- **PASS-WITH-WARNINGS**: many short blocks dropped at the length threshold (record the count).
- **NO-GO**: malformed links.tsv or baking failed → `debug/macrosynteny-debug`.

## The FunMacroSynteny app (what the user gets)

- Drag-and-drop genome/chromosome reordering; right-click: recolor, reverse orientation, focus mode, markers.
- Right-click a genome → neighbor-sense auto-sort.
- Export Hub: 300-DPI PNG (18 cm, publication-ready), vector SVG, and a single-file collaborator `.html`.
- Data comes from `window.bakedData` (injected by `macrosynteny.py`); `macrosynteny.css` + `src/` are needed unless the collaborator file was exported.

## Troubleshooting — Signature library

| Signature in stderr / log | Likely cause | Suggested fix |
| --- | --- | --- |
| `sort_ntsynt_blocks.py: error: unrecognized arg` | upstream script flags changed on the pinned commit — use vendored copy as-is | read `docs-corpus/ntsynt/web-docs.md` for the flag reference |
| `format_blocks_gggenomes.py: KeyError: 'strand'` | blocks TSV from an old/other ntSynt version with 7 columns | re-run ntSynt run with the pinned version; do not force-pad columns |
| `mlr: command not found` from the raw upstream .sh | mlr removed from env on purpose | use `prepare_gggenomes_inputs.sh` (wraps the python shim) — never patch the vendored upstream copy |
| `FileNotFoundError: ...sequence_lengths` when baking | step 1 failed with a visible error earlier in the log | fix step 1 first; baking consumes both TSVs |
| HTML opens blank | `window.bakedData` empty because links.tsv was empty | check blocks TSV non-empty; re-run run phase if needed |
| Blank/near-blank canvas | sequence_lengths.tsv is missing or unparsable | regenerate the TSVs |
| app renders but chromosomes unordered | expected — user drags/uses neighbor-sense auto-sort | none; SP1 covers genome order only |
| blank viz for genomes with unsorted FAI | FAI not created on the full FASTA | re-run `samtools faidx` |
| `python macrosynteny.py ... File template not found` | macrosynteny.html not in the same dir as macrosynteny.py | run with the vendored layout (both files in `bin/funmacrosynteny/`) |

## Verification

- [ ] `output/links.tsv` + `output/sequence_lengths.tsv` exist and validate.
- [ ] `output/funmacrosynteny.html` contains baked data (`window.bakedData`).
- [ ] `output/viz-done.json` exists with verdict.

## What NOT to do

- Do not modify the vendored upstream scripts — the wrapper (`prepare_gggenomes_inputs.sh`) is the only customization point.
- Do not re-run ntSynt from this sub-skill.
- Do not hand-edit links.tsv cell values; fix the pipeline instead.

## Handoff

On PASS/PASS-WARN → hand to qc; on NO-GO → `debug/macrosynteny-debug`.

Recommended message: "Interactive viz baked at `output/funmacrosynteny.html` — open it in a browser; then run `qc/macrosynteny-qc` for the summary report."