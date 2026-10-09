---
name: ntsynt-run
description: 'Execute ntSynt (BirolLab) for macrosynteny block detection using the preflight-derived parameters in run-plan.json: divergence d, block_size, indel, merge, w_rounds, plus Bloom-filter tuning. Validates outputs (synteny_blocks.tsv non-empty, expected column count), records stderr, writes run-done.json + run-report.md with verdict. Has 2 ask-user stop points (SP1-SP2). Signature library for OOM, Snakemake failures, divergence regime errors. Triggers: "run ntsynt", "compute synteny blocks", "run macrosynteny".'
version: 1.2.0
updated: "2026-10-09"
triggers:
  - "run ntsynt"
  - "compute synteny blocks"
  - "run macrosynteny"
---

# ntSynt Run

> **v1.2.0.** Mirrors `bettamt-run`: load the upstream plan → execute → verify outputs → write `run-report.md`. **Never** invokes the viz sub-skill. `viz/funmacro-viz` and `qc/macrosynteny-qc` refuse to run without the blocks TSV.

## 0. Inputs / Outputs contract

### Inputs (consumed)

| Path | Source | Required? |
| --- | --- | --- |
| `$RUN_DIR/preflight.md` | input-preflight | yes (verdict ≥ GO-WITH-WARNINGS) |
| `$RUN_DIR/run-plan.json` | input-preflight | yes |
| `$RUN_DIR/output/` | this sub-skill | created |

### Outputs (produced)

| Path | Owner | Format | Notes |
| --- | --- | --- | --- |
| `$RUN_DIR/output/ntSynt.synteny_blocks.tsv` | this skill | TSV (8 cols) | The core result |
| `$RUN_DIR/output/ntSynt.pre-collinear-merge.synteny_blocks.tsv` | intermediate | TSV | Retained in `--dev` mode |
| `$RUN_DIR/output/ntSynt.mx.dot` | intermediate | dot | Minimizer-map graph |
| `$RUN_DIR/output/run-report.md` + `run-done.json` | this skill | md/json | Gate for viz/qc |

### Verdict gate

`viz/funmacro-viz` and `qc/macrosynteny-qc` refuse to run unless `$RUN_DIR/output/run-done.json` verdict is `PASS` or `PASS-WITH-WARNINGS`.

## 0.5 Ask-User Stop Points

### SP1 — Peak memory / threads

| Trigger | Evidence check | Action |
| --- | --- | --- |
| Machine RAM < ~2× largest genome, or RAM constraint unnamed | ntSynt peak RAM scales with genome size (benchmarks: 4 Gbp-scale great-ape genomes → ~32–34 GB) | Ask: "how much RAM / thread budget? (e.g. `-t 8`, and adjust `--hashes`/`--fpr` to trade RAM for Bloom-filter FPR)" |

Auto-pick: `-t $(nproc)`, cap at 12; skip only when a user already set threads in run-plan.

### SP2 — Empty blocks at chosen divergence

| Trigger | Evidence check | Action |
| --- | --- | --- |
| `synteny_blocks.tsv` exists but has 0 data lines while exit code was 0 | Divergence mis-estimate or regime boundary | Ask: "(A) re-run one `-d` regime up/down (recommended, from preflight's matrix), (B) raise `--merge`/lower `--block_size`, (C) stop" |

Auto-pick: none — this is a real analysis fork, ask.

## Description

Single deterministic command when the cascade is known; the sub-skill's job is verification and artifact capture.

## Prerequisites

- `run-plan.json` with `ntsynt_args` present.
- pixi env built (`pixi run` resolves `ntSynt`).
- FAI files for every input assembly.

## Procedure

### 1. Load the plan

```bash
run-plan=$(jq . "$RUN_DIR/run-plan.json")
# read ntsynt_args, assemblies, warning flags
```

### 2. Execute (from the plan, never re-derived)

```bash
mkdir -p "$RUN_DIR/output"
ARGS=$(jq -r '.ntsynt_args | to_entries | map(if (.value|type)=="array" then "--\(.key[2:]|gsub("-";"_")) \(.value|join(\" \"))" else "\(.key) \(.value)" end) | join(" ")' "$RUN_DIR/run-plan.json")
# Preferred: let the FASTA list drive it (order = genome order for later steps):
pixi run build/ntsynt-run 2>/dev/null || true
# then run, from the skill root, inside $RUN_DIR/output:
(cd "$RUN_DIR/output" && pixi run --manifest-path <skill-root>/pixi.toml \
  bash -c "ntSynt -d 2 -b 1000 --indel 50000 --merge 100000 --w_rounds 250 100 -p ntSynt -t 8 --fastas_list genome_file_list.tsv" 2>&1 | tee ntSynt.stderr.log)
```

The `-d` and cascade flags come from `run-plan.json` verbatim — the agent must not re-derive them. A `--fastas_list` file (one input path per line) is the cleanest input form; write it into `output/` if it does not already exist.

### 3. Verify (always)

```bash
BLOCKS="$RUN_DIR/output/ntSynt.synteny_blocks.tsv"
# non-empty, header-less 8-column TSV
[ -s "$BLOCKS" ] || exit 1
awk -F'\t' 'NF!=8{bad=1} END{exit bad}' "$BLOCKS" || { echo 'FAIL: unexpected column count' ; exit 1; }
# block-ID integrity: every block ID appears ≥ the number of compared genomes
cut -f1 "$BLOCKS" | sort | uniq -c | awk -v n="$(cat genome_file_list.tsv | wc -l)" '$1<n {bad=1} END{exit bad}' \
  || echo "WARN: some synteny blocks cover fewer than $n genomes (expected for ≥3-genome runs)"
```

Also verify the FAI files referenced by `run-plan.json` exist — viz + qc need them.

### 4. Write outputs

`run-done.json`: `{"blocks_tsv": "...", "n_blocks": <int>, "n_lines": <int>, "ntsynt_version": "<x>", "wall_minutes": <n>, "peak_ram_gb": <n|estimate>, "verdict": "PASS", "warnings": []}`.
`run-report.md`: standard table + command line as executed + stderr highlights.

## Interpretation Guidelines

- **PASS**: blocks TSV non-empty, 8 columns, reasonable block count.
- **PASS-WITH-WARNINGS**: blocks covering fewer genomes than the input set (expected for ≥3 genomes — the default is blocks shared by ALL genomes; `-d`-regime tweaks or relaxed `--merge` may fragment).
- **NO-GO**: empty TSV or non-zero exit → route to `debug/macrosynteny-debug`.

## Troubleshooting — Signature library

| Signature in stderr / log | Likely cause | Suggested fix |
| --- | --- | --- |
| `Snakemake ... Error ... Directory cannot be locked` | a previous ntSynt step is/was running in the same dir | wait for the lock release, or delete `output/.snakemake` of a dead previous run |
| `Killed` (SIGKILL, no OOM message) | Bloom filter RAM too small for genome set | increase `--hashes` (e.g. 5) or `--fpr` (e.g. 0.05); add swap; or chunk the comparison |
| `ValueError: w_rounds[0] must be >= w` | custom `-w` above the divergence-derived w_rounds | raise `-w` or lower the cascade's first w_round entry |
| `ntSynt: command not found` | pixi env not installed | `pixi install --manifest-path <skill-root>/pixi.toml`; then `pixi run ntSynt --help` |
| `FileNotFoundError: ...fai` | missing samtools faidx index | re-run preflight step 2b for that assembly |
| `mash dist: Distance exceeds the maximum` | sketch/seq divergence at the tool's cap — genomes very distant | see preflight SP4 (group regimes) |
| blocks TSV has only header line | divergence too low / too strict | SP2 |
| `seqtk: command not found` inside ntSynt steps | pixi env degraded | `pixi install` re-run (seqtk is an ntSynt dependency) |

## Verification

- [ ] `output/ntSynt.synteny_blocks.tsv` exists (non-empty, 8 columns).
- [ ] `output/run-done.json` verdict `PASS`/`PASS-WITH-WARNINGS`.
- [ ] `output/run-report.md` exists with the executed command line.
- [ ] stderr log retained (`output/ntSynt.stderr.log`).

## What NOT to do

- Do not re-derive `-d` or cascade flags here — they come from `run-plan.json`.
- Do not proceed to viz/qc with a `NO-GO`.
- Do not delete intermediates (`pre-collinear-merge` TSV, `.mx.dot`) without keeping a copy path recorded in run-done.json.

## Handoff

- On `PASS`/`PASS-WITH-WARNINGS` → hand off to `viz/funmacro-viz` (then `qc/macrosynteny-qc`; qc also consumes the same TSV directly if viz skipped).
- On `NO-GO` → `debug/macrosynteny-debug`.

Recommended message: "ntSynt run complete — N blocks detected (`output/ntSynt.synteny_blocks.tsv`). Next: invoke `viz/funmacro-viz` to bake the interactive HTML."