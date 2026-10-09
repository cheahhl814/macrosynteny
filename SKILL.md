---
name: macrosynteny
description: 'Multi-genome macrosynteny analysis: compute cross-assembly synteny blocks with ntSynt (Mash-derived divergence-aware parameters), format them into gggenomes/FunMacroSynteny interchange TSVs (links.tsv + sequence_lengths.tsv), produce an interactive single-file HTML visualization, and QC the blocks with de-novo block statistics. Handles whole-genome FASTA assemblies (2-10+ genomes). Version-aware stage routing with explicit Go/No-Go gates and signature-library debugging. Triggers: "macrosynteny", "synteny blocks", "ntSynt", "FunMacroSynteny", "compare assemblies".'
version: 1.1.0
updated: "2026-10-09"
triggers:
  - "macrosynteny"
  - "synteny blocks"
  - "ntSynt"
  - "FunMacroSynteny"
  - "compare assemblies"
  - "structural genomics"
  - "links.tsv"
---

# Multi-Genome Macrosynteny Analysis

> **v1.1.0.** Compute multi-genome macrosynteny blocks with **ntSynt** (minimizer-graph, divergence-aware), convert them to the interchange TSVs, visualize them interactively with **FunMacroSynteny** (single-file HTML), and validate the result with **de-novo block statistics** — in four gated phases.
>
> **Dependency skill: [biodb-fetch](https://github.com/cheahhl814/biodb-fetch)** — when genome assemblies are not local, Phase 1 retrieves them from NCBI (Datasets v2 genome endpoint) via biodb-fetch's manifest.tsv/contract_version contract (see §0.3b).

## Audience

This skill serves two simultaneous audiences:

- **AI Agents**: Triggered by the phrases in the frontmatter. The agent must follow the strict evidence chain (Preflight → Run → Viz → QC) with explicit Go/No-Go gates.
- **Human Users**: Read this as a guided pipeline; every phase's sub-skill explains what to run and what output to expect.

## When to Use This Skill

Use this skill when you need to:

- **Compare 2+ whole-genome assemblies** (isolate genomes, near-complete assemblies, or long-read assemblies up to Gbp scale) for shared macrosynteny blocks.
- **Visualize structural relationships** between assemblies as an interactive, publication-ready single-file HTML (drag-and-drop chromosome ordering, 300-DPI PNG / vector SVG export, collaborator-shareable).
- **Set ntSynt parameters from evidence** — the `-d` divergence parameter and its cascade (`--block_size`, `--indel`, `--merge`, `--w_rounds`) derived from actual Mash distances rather than guesses.

**Do NOT use this skill** if:

- You want **gene-level (micro)synteny** within orthologous gene neighborhoods — use BLAST/LiftOver/gene-family approaches; ntSynt works at whole-genome block scale from sequences alone.
- Your inputs are **short-read data** (FASTQ) — preflight rejects them; assemble first.
- You need generic database retrieval (reads, ID mapping, taxonomy, occurrence data) with no downstream synteny step — call **biodb-fetch** directly instead.

## 0. Orchestrator — detect stage, route to the right sub-skill

This SKILL.md is a **router**, not a doer. It does not duplicate logic from the sub-skills. Its job is to answer: **"what stage is the analysis at, and which sub-skill should be invoked next?"**

### 0.1 Locate the work directory

The analysis writes handoff files (see §B) to a work directory. Default: current working directory. Override with `RUN_DIR` env var.

```bash
RUN_DIR=${RUN_DIR:-$(pwd)}          # the analysis work dir (NOT this skill's dir)
```

### 0.2 Detect the user's stage

Try to detect automatically **before** asking:

```bash
# Stage detection ladder — first match wins
test -f "$RUN_DIR/report/macrosynteny-report.md" && STAGE="qc-done"
test -f "$RUN_DIR/report/qc-verdict.json"        && STAGE="qc"
test -f "$RUN_DIR/output/funmacrosynteny.html"   && STAGE="viz-done"
test -f "$RUN_DIR/output/links.tsv"              && STAGE="viz"
test -f "$RUN_DIR/output/ntSynt.synteny_blocks.tsv" && STAGE="qc"   # blocks exist, no viz yet
test -f "$RUN_DIR/run-plan.json"                 && STAGE="run"
test -f "$RUN_DIR/preflight.md"                  && STAGE="run"
: "${STAGE:=preflight}"
```

If auto-detection is ambiguous, ask the user one short question (see **SP0**).

### 0.5 Master ask-user stop point (SP0)

**SP0 — Entry-stage ambiguity.** If `$RUN_DIR` is empty AND no FASTA inputs were named, ask:
> "Which genome assemblies (FASTA, plain or gzipped) should be compared? At least 2 files."
Auto-pick `preflight` when FASTAs are in the work dir or were named in the prompt.

**Routing rule**: auto-pick the default when the evidence is unambiguous; ask only when the agent genuinely cannot decide.

### 0.3 Route to the right sub-skill

| Stage | Action |
| --- | --- |
| `preflight` | Invoke `preflight/macrosynteny-input-preflight`. Validates FASTAs (retrieving them via bio db fetch if absent — §0.3b), indexes them (`samtools faidx`), computes Mash distances, picks the `-d` parameter cascade, writes `preflight.md` + `run-plan.json`. |
| `run` | Invoke `build/ntsynt-run`. Executes ntSynt with the preflight-derived parameters. Writes `output/ntSynt.synteny_blocks.tsv`. |
| `viz` | Invoke `viz/funmacro-viz`. Converts blocks → `links.tsv` + `sequence_lengths.tsv` → single-file interactive HTML via the vendored FunMacroSynteny app. Writes `output/funmacrosynteny.html`. |
| `qc` | Invoke `qc/macrosynteny-qc`. Runs de-novo block statistics + sanity checks. Writes `report/macrosynteny-report.md`. |
| `qc-done` | Surface `$RUN_DIR/report/macrosynteny-report.md` to the user. |
| Any failure | Invoke `debug/macrosynteny-debug` with the failing command's stderr. |

**Do not skip preflight.** The `run` sub-skill refuses to execute without `run-plan.json` with verdict ≥ `GO-WITH-WARNINGS`.
**Do not skip qc.** Bare `synteny_blocks.tsv` files are not an answer — the QC report is the audit trail.

### 0.3b Dependency skill — biodb-fetch (optional genome retrieval)

Sometimes the genomes for a macrosynteny comparison live in a database, not on disk. When the user names accessions/taxa instead of FASTA paths, Phase 1 delegates retrieval to the **biodb-fetch** skill (https://github.com/cheahhl814/biodb-fetch) rather than fetching ad hoc:

```bash
# NCBI assembly retrieval via biodb-fetch (shared-store cached, manifest contract)
python3 <path-to-skills>/biodb-fetch/scripts/ncbi_datasets.py genome \
    --accession <ACCESSION> --outdir "$RUN_DIR/input/"
# Verify: <outdir>/manifest.tsv exists with a contract_version column; the FASTA payload path is a manifest row.
```

Rules: (1) consume payloads only after checking `contract_version` in the returned `manifest.tsv`; (2) retrieved FASTAs then flow through the normal preflight evidence steps (faidx, Mash, cascade) — no special-casing; (3) `run-plan.json` records which assemblies were retrieved and their manifest rows for provenance. biodb-fetch is a *sibling* skill — if it is not deployed, ask the user to install it; never fetch from NCBI inline.

## Update Check

This skill ships a self-update check comparing the deployed copy against upstream `github.com/cheahhl814/macrosynteny` via `git fetch` + SHA diff — no GitHub API call.

```bash
pixi run update-check
# Verdict legend (exit code in parens):
#   UP-TO-DATE       (0)  local HEAD matches origin/HEAD
#   LOCAL-AHEAD      (0)  unpushed local commits; no action needed
#   BEHIND-BY-N      (1)  upstream is N commits ahead → rsync from @skills/macrosynteny/
#   OFFLINE          (2)  git fetch failed; informational
#   NO-ORIGIN        (2)  no `origin` remote configured; informational
```

Full implementation: `bin/skill-update-check.py`.

### 0.4 The execution model

This skill ships **bash recipes** only (user-elected manual/agent-driven mode; no Nextflow runner). The pixi tasks are the entry points:

```bash
pixi run preflight   # usage reminder for the preflight sub-skill
pixi run run         # usage reminder for the run sub-skill
pixi run viz         # usage reminder for the viz sub-skill
pixi run qc          # usage reminder for the qc sub-skill
pixi run update-check
```

The actual work is driven by the agent reading each phase's sub-skill `Procedure` section and executing it in `$RUN_DIR`.

## A. Pipeline Architecture

Four sequential phases; the boundary between phases is the filesystem, not the agent's memory.

### Phase 1: Preflight (The Audit)

**Goal**: Validate the input FASTAs, compute Mash pairwise divergences, choose the ntSynt parameter cascade, and write `run-plan.json` + `preflight.md`.

- **Sub-skill**: `preflight/macrosynteny-input-preflight`
- **Must-Verify**: ≥2 readable (gzipped OK) FASTAs; `samtools faidx` succeeds; Mash sketch/dist runs; genome sizes sane.
- **Exit Gate**: `preflight.md` with verdict ≥ `GO-WITH-WARNINGS`; `run-plan.json` exists.

### Phase 2: Run (The Detection)

**Goal**: Execute ntSynt with the preflight-derived parameters — divergence `d`, block size, merge distance, w-rounds — and capture `ntSynt.synteny_blocks.tsv` plus stderr logs.

- **Sub-skill**: `build/ntsynt-run`
- **Must-Verify**: preflight verdict ≥ `GO-WITH-WARNINGS`; expected output files exist and are non-empty.
- **Exit Gate**: `output/ntSynt.synteny_blocks.tsv` (and `.mx.dot`, `.pre-collinear-merge.synteny_blocks.tsv` intermediates).

### Phase 3: Viz (The Interactive Visualization)

**Goal**: Convert the blocks into interchange TSVs (`links.tsv`, `sequence_lengths.tsv`) using the vendored ntSynt formatting scripts, then bake a single interactive HTML with the vendored FunMacroSynteny app.

- **Sub-skill**: `viz/funmacro-viz`
- **Must-Verify**: links.tsv parses (9 columns + optional strand); the baked HTML opens with data embedded.
- **Exit Gate**: `output/funmacrosynteny.html`.

### Phase 4: QC (The Report)

**Goal**: De-novo block statistics (vendored `denovo_synteny_block_stats.py`), block-count/orientation sanity checks, and a final verdict report.

- **Sub-skill**: `qc/macrosynteny-qc`
- **Must-Verify**: run + viz artifacts present; stats script consumed the TSV + FAIs without error.
- **Exit Gate**: `report/macrosynteny-report.md` with verdict `PASS` / `PASS-WITH-WARNINGS` / `NO-GO`.

## B. The Evidence Chain & Handoff Contract

| From → To | Artifact | Owner | Consumer |
| --- | --- | --- | --- |
| User → Preflight | FASTA assemblies | User | `preflight/macrosynteny-input-preflight` |
| Preflight → Run | `preflight.md` + `run-plan.json` (≥ GO-WITH-WARNINGS) | preflight sub-skill | `build/ntsynt-run` |
| Run → Viz | `output/ntSynt.synteny_blocks.tsv` + FAI files | `build/ntsynt-run` | `viz/funmacro-viz` |
| Run → QC | `output/ntSynt.synteny_blocks.tsv` + FAI files | `build/ntsynt-run` | `qc/macrosynteny-qc` |
| Viz → User | `output/funmacrosynteny.html` | `viz/funmacro-viz` | User (browser) |
| QC → User | `report/macrosynteny-report.md` | `qc/macrosynteny-qc` | User |
| Any phase → Debug | failing stderr + upstream artifacts | any | `debug/macrosynteny-debug` |

## C. Output contract — no artifact (orchestrator)

This router produces no file of its own. All artifacts are produced by the sub-skills:
`preflight.md`, `run-plan.json` (preflight); `output/ntSynt.synteny_blocks.tsv` (run); `output/links.tsv`, `output/sequence_lengths.tsv`, `output/funmacrosynteny.html` (viz); `report/macrosynteny-report.md` (qc); `debug-report.md` (debug).

## D. Go/No-Go Gates

The agent must stop and warn the user if:

- **Preflight `NO-GO`**: fewer than 2 valid assemblies, unreadable FASTAs, or genome sizes off by orders of magnitude.
- **Run failure**: ntSynt exits non-zero or produces an empty blocks TSV → `debug/macrosynteny-debug`.
- **QC `NO-GO`**: zero synteny blocks, or blocks covering a suspiciously small fraction of genomes relative to the Mash divergence.

## E. The scientific context (why this pipeline)

- **ntSynt** (Coombe et al., BMC Biology 2025, doi:10.1186/s12915-025-02455-w) computes synteny blocks shared by multiple genomes with a dynamic minimizer graph approach — no alignments, scales to Gbp genomes. The `-d` percent-divergence flag sets the whole parameter cascade (see the table in `docs-corpus/ntsynt/`).
- **FunMacroSynteny** turns the block TSV into an interactive browser view: drag-and-drop reordering, right-click chromosome reversal / focus mode / markers, neighbor-sense sorting, 300-DPI PNG + SVG export, and a single-file `.html` collaborator export.
- The **interchange TSVs** between them follow the gggenomes links format produced by ntSynt's `visualization_scripts/` (`links.tsv`: `block_id  bin_id  seq_id  start  end  bin_id2  seq_id2  start2  end2 [strand]`; `sequence_lengths.tsv`: `bin_id  seq_id  length  relative_orientation`).
- **Mash** estimates pairwise sequence divergence to set `-d` (e.g. human-vs-chimp ≈1.3%, mouse-vs-rat ≈12% per the README's table).

## F. Common follow-ups

| User says | What to do |
| --- | --- |
| "Show me the report" | `cat $RUN_DIR/report/macrosynteny-report.md` |
| "Re-visualize" | Invoke `viz/funmacro-viz` again (idempotent; reuses the same blocks TSV) |
| "Use a different genome order" | Re-run viz with FAIs in the preferred order (FAI order = genome order) |
| "Blocks look too few/fragmented" | Re-check `-d`/`--merge`/`--w_rounds` derivation in preflight; consult `docs-corpus/ntsynt/` parameter table |
| "Export for a collaborator" | In the FunMacroSynteny HTML: Export Hub → single-file `.html` (no server needed) |

## Verification

- [ ] Preflight was performed; `preflight.md` verdict ≥ `GO-WITH-WARNINGS`.
- [ ] Run completed; `output/ntSynt.synteny_blocks.tsv` exists and is non-empty.
- [ ] Viz completed; `output/funmacrosynteny.html` opens with data baked in.
- [ ] QC was performed; `report/macrosynteny-report.md` exists with verdict.

## Handoff pointers

After routing, state exactly which sub-skill was invoked and which file it will produce. Example: "Handing off to `preflight/macrosynteny-input-preflight` — it will write `preflight.md` + `run-plan.json` to your work dir."

## Provenance

Built with the [bioinfo-skill-creator](https://github.com/cheahhl814/bioinfo-skill-creator) meta-skill. Pattern adopted from [BettaMt-agents](https://github.com/cheahhl814/BettaMt-agents). Wraps [BirolLab/ntSynt](https://github.com/BirolLab/ntSynt) (GPL-3) and [ZarulHanifah/FunMacroSynteny](https://github.com/ZarulHanifah/FunMacroSynteny) (GPL-3).