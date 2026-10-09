---
name: macrosynteny-debug
description: 'Failure interpreter for macrosynteny analysis phases: reads the failing stderr / empty output / NO-GO verdict and routes to the matching signature-library entry (ntSynt Snakemake locks, Bloom-filter OOM, FAI/mash issues, links.tsv malformation, FunMacroSynteny bake failures). Writes debug-report.md with verdict RECOVERABLE (re-run with the fix) or BLOCKED (user intervention). Triggers: "macrosynteny failed", "ntSynt error", "debug synteny".'
version: 1.0.0
updated: "2026-10-06"
triggers:
  - "macrosynteny failed"
  - "ntSynt error"
  - "debug synteny"
---

# Macrosynteny Debug

> **v1.0.0.** Interprets a failure anywhere in preflight → run → viz → qc and returns a concrete fix. Writes `debug-report.md`. Never runs heavy computations itself.

## 0. Inputs / Outputs contract

### Inputs (consumed)

| Path | Source | Required? |
| --- | --- | --- |
| Failing command's stderr (terminal or a log file in `$RUN_DIR/`) | upstream phase | yes |
| `$RUN_DIR/preflight.md` / `run-done.json` / `viz-done.json` / `qc-verdict.json` | upstream phases | as available |

### Outputs (produced)

| Path | Owner | Format | Notes |
| --- | --- | --- | --- |
| `$RUN_DIR/debug-report.md` | this skill | markdown | diagnosis + fix + verdict |

### Verdict gate

`RECOVERABLE` → caller re-runs the failed phase with the fix. `BLOCKED` → user must intervene.

## 0.5 Ask-User Stop Points

### SP1 — Signature not in library

| Trigger | Evidence check | Action |
| --- | --- | --- |
| No signature-library match, and 10 minutes of reading `docs-corpus/` + `--help` does not explain the error | Unknown failure mode | Ask the user, or (when delegating) surface the recommendation as a pane output and stop |

Auto-pick: none.

## Description

Matches failure signatures against the **combined signature library** of all four phases (the tables in each sub-skill's Troubleshooting section) plus the tool docs in `docs-corpus/`.

## Procedure

1. **Capture the failure**: the exact command, the stderr tail (≥ 30 lines), and which phase/artifact gate failed.
2. **Match a signature**: search all four sub-skill signature libraries (grep the error message's distinctive fragment).
3. **Investigate when unmatched** (bounded): reread the relevant `docs-corpus/<tool>/` entry; re-run the failing command with `-n` / `--dry-run` (ntSynt supports `--dry-run`); check for stale per-run state in `output/.snakemake`.
4. **Write `debug-report.md`**: signature matched (or NOT-MATCHED), root cause, the concrete fix (exact command), and verdict.

## Master signature library (cross-phase quick index)

| Signature | Phase | Root cause | Fix |
| --- | --- | --- | --- |
| `Snakemake ... Directory cannot be locked` | run | stale/parallel ntSynt runs sharing `output/` | clear `output/.snakemake` of dead runs; serialize runs |
| `Killed` mid-run | run | Bloom filter RAM | raise `--hashes`/`--fpr` (see run signature library) |
| empty `synteny_blocks.tsv` | run | divergence regime | SP2 of run sub-skill |
| `fai` missing | preflight/viz/qc | faidx not run | `samtools faidx` again |
| wrong column count in links.tsv | viz | upstream script/version mismatch | use the vendored scripts + wrapper only |
| `window.bakedData` empty / blank HTML | viz | baking consumed empty links.tsv | fix step 1 of viz first |
| divergence > 100 or nonsense | preflight | Mash distance misinterpretation | use divergence, not (1−identity) similarity (docs-corpus/mash) |
| `ModuleNotFoundError` in a vendored script | any | pixi env not installed | `pixi install` at the skill root |

Full per-phase tables live in each sub-skill's `Troubleshooting — Signature library` section; every phase ships ≥ 3 entries.

## Interpretation Guidelines

- **RECOVERABLE**: the fix is a command the agent (or user) can execute now.
- **BLOCKED**: data corruption, disk exhaustion, credentials, or an upstream bug — user must act.

## Troubleshooting — Signature library (meta)

| Signature in this sub-skill | Likely cause | Suggested fix |
| --- | --- | --- |
| No artifact found in any expected location | user pointed at the wrong `$RUN_DIR` | re-verify RUN_DIR with the orchestrator's ladder |
| Signature matched but fix fails again | the two signature entries compound | re-run diagnosis with both fixes applied; escalate to SP1 |

## Verification

- [ ] `$RUN_DIR/debug-report.md` exists with a verdict.
- [ ] Every claimed root-cause is backed by a quoted stderr fragment.

## What NOT to do

- Do not silently re-run the failed phase with a guessed fix.
- Do not mark `BLOCKED` for anything a single tool upgrade can fix.

## Handoff

`RECOVERABLE` → caller re-runs the failed phase; `BLOCKED` → report to the user with the exact blocker.