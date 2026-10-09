# Multi-Genome Macrosynteny Analysis

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](#-installation)
[![Type](https://img.shields.io/badge/type-agent%20skill-blueviolet)](#-installation)
[![Built with](https://img.shields.io/badge/built%20with-bioinfo--skill--creator-orange)](https://github.com/cheahhl814/bioinfo-skill-creator)

Compute multi-genome macrosynteny blocks from genome assemblies with ntSynt (minimizer-graph, divergence-aware parameters set via Mash), format them for interchange (links.tsv + sequence_lengths.tsv), visualize interactively with FunMacroSynteny (single-file HTML), and qc the blocks with de-novo block statistics.

**Repository**: https://github.com/cheahhl814/macrosynteny

> [!NOTE]
> Current version: **v1.0.0** (updated 2026-10-06).

## Contents

- [Installation](#-installation)
- [Usage](#-usage)
- [Pipeline overview](#-pipeline-overview)
- [Tools](#-tools)
- [Update check](#-update-check)
- [Repository layout](#-repository-layout)
- [Hard guarantees](#-hard-guarantees)
- [Provenance](#-provenance)

## 🚀 Installation

This is an **agent skill**, not a user-facing library. The recommended install path is to let your AI agent import it.

**Option A — give your agent this prompt (recommended):**

```text
Install the macrosynteny skill from
https://github.com/cheahhl814/macrosynteny —
clone it into your agent's skills directory (the path your agent watches
for skills) and run `pixi install` from that directory. Then read the
skill's SKILL.md to understand its phases and the Input/Output contract
for each. Confirm when the environment is ready.
```

**Option B — manual install:**

```bash
git clone https://github.com/cheahhl814/macrosynteny.git
cd macrosynteny
pixi install
```

> [!TIP]
> `pixi install` resolves every pinned tool from `pixi.toml` (channels: conda-forge, bioconda) into an isolated `.pixi/` environment — no system-wide installs, no version conflicts with other skills.

## 💡 Usage

The skill is designed to be driven by an AI agent: the agent reads the master `SKILL.md`, detects the current phase from the filesystem state of your run directory, and routes to the right sub-skill.

### Natural-language prompts that trigger the skill

```text
macrosynteny
synteny blocks
ntSynt
FunMacroSynteny
compare assemblies
download genomes then compare assemblies
```

> [!NOTE]
> **Dependency skill** — [biodb-fetch](https://github.com/cheahhl814/biodb-fetch). When the assemblies are not local, the preflight phase retrieves them from NCBI (Datasets v2 genome endpoint) via biodb-fetch's cached, manifest.tsv/contract_version-gated fetch. Install it alongside this skill; the preflight tells you when it is needed.

### Manual phase execution

If you prefer to drive the phases yourself (or want to re-run a single phase):

```bash
# Set your run directory (all phase artifacts land here)
RUN_DIR=/path/to/run-dir

pixi run preflight   # Phase 1 — validate inputs, write preflight.md + params.json
pixi run run         # Phase 2 — execute the workflow (after preflight ≥ GO)
pixi run qc          # Phase 3 — build the final report (after run completes)
pixi run debug       # On failure — interpret stderr via the signature library
pixi run battle-test # Verify the skill's structural integrity
```

> [!IMPORTANT]
> Each phase has an explicit **Inputs/Outputs contract** at the top of its sub-skill `SKILL.md`. If the upstream artifact is missing (e.g. you run `run` before `preflight` passed), the sub-skill refuses to proceed and tells you which phase to run first. Phases are gated on purpose — don't skip them.

## 🔬 Pipeline overview

The analysis follows a phased evidence chain. Each phase consumes the artifacts of the previous phase and gates progression with a Go/No-Go check.

| # | Phase | Goal | Sub-skill | Artifact produced |
|:--|:------|:-----|:----------|:------------------|
| **1** | **Preflight** | Validate assemblies, run Mash, derive the -d cascade | `preflight/` | `$RUN_DIR/preflight.md + run-plan.json` |
| **2** | **Build** | Execute ntSynt with the plan's parameters | `build/` | `$RUN_DIR/output/ntSynt.synteny_blocks.tsv` |
| **3** | **Viz** | Convert blocks to interchange TSVs + bake the interactive HTML | `viz/` | `$RUN_DIR/output/funmacrosynteny.html` |
| **4** | **Qc** | De-novo block statistics + final verdict report | `qc/` | `$RUN_DIR/report/macrosynteny-report.md` |
| **5** | **Debug** | Interpret failures via the signature library | `debug/` | `$RUN_DIR/debug-report.md` |

> [!TIP]
> Read each sub-skill's `SKILL.md` for the full procedure, its ask-user stop points, and its signature library (stderr pattern → cause → fix).

**Genomes not local?** Phase 1 delegates retrieval to [biodb-fetch](https://github.com/cheahhl814/biodb-fetch) (`scripts/ncbi_datasets.py genome --accession <ACCESSION>`), verifies the `contract_version` in the returned `manifest.tsv`, then treats the fetched FASTAs like any other input. Retrieved payloads are recorded in `run-plan.json` for provenance.

## 🧰 Tools

All tools are resolved from conda-forge/bioconda via the pinned `pixi.toml`.

| Tool | Version | Role |
|:-----|:--------|:-----|
| `ntsynt` | * | synteny-block detection (core) |
| `mash` | * | pairwise divergence estimation to set ntSynt -d |
| `samtools` | * | faidx .fai generation for formatting + stats |
| `seqtk` | * | FASTA utilities (ntSynt dependency) |
| `snakemake-minimal` | * | re-execution/inspection of ntSynt internal pipeline |
| `python` | 3.12 | glue scripts (formatting, FunMacroSynteny server) |
| `pandas` | * | links.tsv / sequence_lengths.tsv interchange handling |
| `numpy` | * | numeric ops in format/stats scripts |

Tool usage is grounded in the offline `docs-corpus/` snapshots (version-matched `--help`/`man` captures, upstream repo docs, and web docs as fallback) — the agent reads these instead of guessing flags.

## 🔄 Update check

Every skill built with [bioinfo-skill-creator](https://github.com/cheahhl814/bioinfo-skill-creator) ships a self-update check that compares the deployed git SHA against this upstream repo via `git fetch` — no GitHub API call, no extra dependencies.

```bash
pixi run update-check
```

| Verdict | Exit | Meaning |
|:--------|:-----|:--------|
| `UP-TO-DATE` | 0 | Local HEAD matches origin/HEAD |
| `LOCAL-AHEAD` | 0 | Unpushed local commits; no action needed |
| `BEHIND-BY-N` | 1 | Upstream is N commits ahead → re-pull/re-sync from this repo |
| `OFFLINE` | 2 | `git fetch` failed; informational only |
| `NO-ORIGIN` | 2 | No `origin` remote configured; informational only |

## 📁 Repository layout

```text
macrosynteny/
├── SKILL.md                 # Master orchestrator (router — start here)
├── README.md                # This file
├── pixi.toml                # Pinned tool environment (pixi install)
├── docs-corpus/             # Offline snapshots of upstream tool docs
│   ├── ntsynt/
│   ├── mash/
│   ├── samtools/
│   ├── seqtk/
│   ├── snakemake-minimal/
│   ├── python/
│   ├── pandas/
│   ├── numpy/
│   └── funmacrosynteny/
├── preflight/               # Phase 1 sub-skill (input + divergence preflight)
├── build/                   # Phase 2 sub-skill (ntSynt execution)
├── viz/                     # Phase 3 sub-skill (interchange TSVs + HTML bake)
├── qc/                      # Phase 4 sub-skill (block statistics + report)
├── debug/                   # Failure interpreter (signature library)
├── bin/
│   ├── skill-update-check.py  # Self-update check (pixi run update-check)
│   ├── viz/                   # Vendored ntSynt formatting scripts (GPL-3)
│   ├── stats/                 # Vendored de-novo block statistics script (GPL-3)
│   └── funmacrosynteny/       # Vendored FunMacroSynteny web app (GPL-3)
└── test-data/               # Deterministic fixtures + MANIFEST.tsv
```

## 🔒 Hard guarantees

- **Filesystem evidence chain** — every phase emits the artifact the next phase consumes; the boundary between phases is the filesystem, not agent memory.
- **Docs-grounded tool usage** — tool flags come from `docs-corpus/`, never from the agent's memory.
- **Explicit stop points** — ambiguous decisions are surfaced to you as *Evidence + Recommend + Options*, not auto-picked.
- **Reproducible environments** — every tool is pinned in `pixi.toml` and resolved via pixi;
- **GPL-3 vendored assets** — the FunMacroSynteny app and ntSynt helper scripts ship with their upstream `LICENSE` files and pinned upstream commits (see `params.json: vendor_assets`).

## 🚀 Nextflow runner

This skill does not currently ship a Nextflow runner. For cohort/HPC execution, wrap the `pixi run` tasks in a workflow scheduler of your choice.

## Provenance

Built with the [bioinfo-skill-creator](https://github.com/cheahhl814/bioinfo-skill-creator) meta-skill (v1.1.0), following the AiX-BIO skill convention (preflight → build → debug → battle-test evidence chain). Pattern adopted from:

- **BettaMt-agents** — https://github.com/cheahhl814/BettaMt-agents
- **bacterial-genome-analysis** — https://github.com/cheahhl814/bacterial-genome-analysis
- **amr-gene-screening** — https://github.com/cheahhl814/amr-gene-screening

## License

Released under the GPL-3.0 License — see the license file in this repository for details.