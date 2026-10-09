# analyze_macrosynteny.py — vendored into the macrosynteny skill (v1.2.0)
# Provenance: user-authored analysis script developed in the user's Betta splendens-group
# macrosynteny workspace (ntSynt -> ntSynt-viz -> FunMacroSynteny study); copied verbatim
# (functions intact; only this header block added). Consumes ntSynt-viz output artifacts.
# License: GPL-3.0 (consistent with the skill's vendored-asset licensing).
#!/usr/bin/env python3

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd


FORWARD = "+"
REVERSE = "-"
SYNTENY_BLOCK_COLUMNS = [
    "block_id",
    "bin_id",
    "seq_id",
    "start",
    "end",
    "strand",
    "support_n",
    "block_status",
]
KNOWN_BLOCK_STATUSES = {"None", "ori_change", "id_change", "inconsistent_order", "indel"}


def flip_strand(strand: str) -> str:
    return FORWARD if strand == REVERSE else REVERSE


def infer_genome_order(links: pd.DataFrame) -> list[str]:
    edges = links[["bin_id", "bin_id2"]].drop_duplicates()
    sources = set(edges["bin_id"])
    targets = set(edges["bin_id2"])
    starts = list(sources - targets)
    if len(starts) != 1:
        raise ValueError(f"Expected exactly one start genome, found {starts}")

    next_map = dict(edges.itertuples(index=False, name=None))
    order = [starts[0]]
    while order[-1] in next_map:
        order.append(next_map[order[-1]])
    return order


def build_orientation_map(links: pd.DataFrame, genome_order: list[str]) -> pd.DataFrame:
    genome_rank = {genome: idx for idx, genome in enumerate(genome_order)}
    edges = (
        links[["block_id", "bin_id", "bin_id2", "strand"]]
        .drop_duplicates()
        .assign(genome_rank=lambda df: df["bin_id"].map(genome_rank))
        .sort_values(["block_id", "genome_rank"])
    )

    rows = []
    first_genome = genome_order[0]
    for block_id, block_edges in edges.groupby("block_id", sort=True):
        orientation = {first_genome: FORWARD}
        for row in block_edges.itertuples(index=False):
            current = orientation.get(row.bin_id)
            if current is None:
                raise ValueError(
                    f"Missing orientation seed for block {block_id} genome {row.bin_id}"
                )
            orientation[row.bin_id2] = current if row.strand == FORWARD else flip_strand(current)
        for genome in genome_order:
            if genome in orientation:
                rows.append(
                    {
                        "block_id": block_id,
                        "bin_id": genome,
                        "orientation_to_reference": orientation[genome],
                    }
                )
    return pd.DataFrame(rows)


def merge_intervals(group: pd.DataFrame) -> int:
    intervals = group[["start", "end"]].sort_values(["start", "end"]).itertuples(index=False)
    covered = 0
    current_start = None
    current_end = None

    for start, end in intervals:
        if current_start is None:
            current_start, current_end = start, end
            continue
        if start <= current_end + 1:
            current_end = max(current_end, end)
        else:
            covered += current_end - current_start + 1
            current_start, current_end = start, end

    if current_start is not None:
        covered += current_end - current_start + 1
    return covered


def write_tsv(df: pd.DataFrame, path: Path) -> None:
    df.to_csv(path, sep="\t", index=False)


def fail(message: str) -> None:
    raise SystemExit(message)


def warn(message: str) -> None:
    print(f"WARNING: {message}", file=sys.stderr)


def require_columns(df: pd.DataFrame, required: list[str], label: str) -> None:
    missing = [col for col in required if col not in df.columns]
    if missing:
        fail(f"{label} is missing required columns: {', '.join(missing)}")


def resolve_inputs(args: argparse.Namespace) -> tuple[Path, Path, Path, Path, Path | None]:
    if args.input_prefix:
        prefix = Path(args.input_prefix)
        base_dir = prefix.parent if str(prefix.parent) != "" else Path(".")
        stem = prefix.name
        synteny_default = base_dir / "macrosynteny.synteny_blocks.tsv"
        premerge_default = base_dir / "macrosynteny.pre-collinear-merge.synteny_blocks.tsv"
        return (
            base_dir / f"{stem}.links.tsv",
            base_dir / f"{stem}.chrom-paint-feats.tsv",
            base_dir / f"{stem}.sequence_lengths.sorted.tsv",
            Path(args.synteny_blocks) if args.synteny_blocks else synteny_default,
            Path(args.premerge_synteny_blocks) if args.premerge_synteny_blocks else premerge_default,
        )
    return (
        Path(args.links),
        Path(args.chrom_paint),
        Path(args.sequence_lengths),
        Path(args.synteny_blocks),
        Path(args.premerge_synteny_blocks) if args.premerge_synteny_blocks else None,
    )


def validate_linear_chain(links: pd.DataFrame) -> None:
    outgoing = links[["bin_id", "bin_id2"]].drop_duplicates()["bin_id"].value_counts()
    incoming = links[["bin_id", "bin_id2"]].drop_duplicates()["bin_id2"].value_counts()
    bad_outgoing = outgoing[outgoing > 1]
    bad_incoming = incoming[incoming > 1]
    if not bad_outgoing.empty or not bad_incoming.empty:
        fail(
            "links.tsv does not describe a simple linear genome order. "
            "This script currently expects each genome to have at most one predecessor and one successor."
        )


def read_synteny_blocks(path: Path) -> pd.DataFrame:
    synteny = pd.read_csv(path, sep="\t", header=None, names=SYNTENY_BLOCK_COLUMNS)
    require_columns(synteny, SYNTENY_BLOCK_COLUMNS, str(path))
    unexpected = sorted(set(synteny["block_status"].dropna()) - KNOWN_BLOCK_STATUSES)
    if unexpected:
        warn(
            f"{path.name} contains unexpected block_status values: {', '.join(unexpected)}. "
            "They will still be included in the status table but not in status-specific summaries."
        )
    return synteny


def summarize_run(group: pd.DataFrame, include_orientation_pattern: bool = False) -> dict[str, object]:
    ordered = group.sort_values(["start", "end", "block_id"])
    ref_spans = (
        ordered.dropna(subset=["reference_seq_id"])
        .groupby("reference_seq_id", sort=False)["span_bp"]
        .sum()
        .sort_values(ascending=False)
    )
    result: dict[str, object] = {
        "target_genome": ordered["bin_id"].iloc[0],
        "target_seq_id": ordered["seq_id"].iloc[0],
        "run_start": int(ordered["start"].min()),
        "run_end": int(ordered["end"].max()),
        "run_span_bp": int(ordered["end"].max() - ordered["start"].min() + 1),
        "n_blocks": int(ordered["block_id"].nunique()),
        "total_block_span_bp": int(ordered["span_bp"].sum()),
        "reference_seq_ids": ",".join(ref_spans.index.astype(str)),
        "dominant_reference_seq_id": ref_spans.index[0] if not ref_spans.empty else "",
        "support_n_sum": int(ordered["support_n"].sum()),
    }
    if include_orientation_pattern:
        result["orientation_pattern"] = "".join(
            ordered["orientation_to_reference"].fillna("?").astype(str).tolist()
        )
    return result


def collapse_status_runs(
    status_table: pd.DataFrame,
    status_value: str,
    include_orientation_pattern: bool = False,
) -> pd.DataFrame:
    subset = status_table.loc[
        (status_table["block_status"] == status_value)
        & (~status_table["is_reference_genome"])
    ].copy()
    if subset.empty:
        columns = [
            "target_genome",
            "target_seq_id",
            "run_start",
            "run_end",
            "run_span_bp",
            "n_blocks",
            "total_block_span_bp",
            "reference_seq_ids",
            "dominant_reference_seq_id",
            "support_n_sum",
        ]
        if include_orientation_pattern:
            columns.append("orientation_pattern")
        return pd.DataFrame(columns=columns)

    subset = subset.sort_values(["bin_id", "seq_id", "start", "end", "block_id"]).reset_index(drop=True)
    runs: list[dict[str, object]] = []
    current_rows: list[int] = []
    prev_genome = None
    prev_seq = None
    prev_end = None

    for idx, row in subset.iterrows():
        is_contiguous = (
            prev_genome == row["bin_id"]
            and prev_seq == row["seq_id"]
            and prev_end is not None
            and row["start"] <= prev_end + 1
        )
        if not current_rows or not is_contiguous:
            if current_rows:
                runs.append(
                    summarize_run(
                        subset.loc[current_rows],
                        include_orientation_pattern=include_orientation_pattern,
                    )
                )
            current_rows = [idx]
        else:
            current_rows.append(idx)
        prev_genome = row["bin_id"]
        prev_seq = row["seq_id"]
        prev_end = max(prev_end, row["end"]) if prev_end is not None and is_contiguous else row["end"]

    if current_rows:
        runs.append(
            summarize_run(
                subset.loc[current_rows],
                include_orientation_pattern=include_orientation_pattern,
            )
        )
    return pd.DataFrame(runs)


def build_reference_sequence_rank(seq_lengths: pd.DataFrame, reference_genome: str) -> dict[str, int]:
    reference_rows = seq_lengths.loc[seq_lengths["bin_id"] == reference_genome].reset_index(drop=True)
    return {
        row.seq_id: idx
        for idx, row in enumerate(reference_rows.itertuples(index=False), start=0)
    }


def adjacency_flag(reference_ids: list[str], reference_rank: dict[str, int]) -> bool:
    ranked = sorted(reference_rank.get(ref_id, 10**9) for ref_id in reference_ids if ref_id in reference_rank)
    if len(ranked) < 2:
        return False
    return all((b - a) == 1 for a, b in zip(ranked, ranked[1:]))


def build_fusion_architecture(
    target_seq_ref_spans: pd.DataFrame,
    target_thresholds: pd.DataFrame,
    reference_rank: dict[str, int],
) -> pd.DataFrame:
    rows = []
    qualifying = (
        target_thresholds.groupby(["target_genome", "target_seq_id"], sort=False)["reference_seq_id"]
        .agg(lambda values: list(values))
        .to_dict()
    )
    for (target_genome, target_seq_id), group in target_seq_ref_spans.groupby(
        ["target_genome", "target_seq_id"], sort=False
    ):
        ordered = group.sort_values("total_span_bp", ascending=False).reset_index(drop=True)
        refs = ordered["reference_seq_id"].astype(str).tolist()
        dom = ordered.iloc[0]
        second = ordered.iloc[1] if len(ordered) > 1 else None
        qualifying_refs = qualifying.get((target_genome, target_seq_id), [])
        rows.append(
            {
                "target_genome": target_genome,
                "target_seq_id": target_seq_id,
                "seq_total_span_bp": int(dom["seq_total_span_bp"]),
                "n_reference_chromosomes": int(len(refs)),
                "dominant_reference_seq_id": dom["reference_seq_id"],
                "dominant_fraction": float(dom["seq_fraction"]),
                "second_reference_seq_id": "" if second is None else second["reference_seq_id"],
                "second_fraction": 0.0 if second is None else float(second["seq_fraction"]),
                "reference_seq_ids_ranked": ",".join(refs),
                "is_multi_reference_signal": len(qualifying_refs) >= 2,
                "is_adjacent_reference_combo": adjacency_flag(qualifying_refs, reference_rank),
            }
        )
    return pd.DataFrame(rows).sort_values(
        ["is_multi_reference_signal", "seq_total_span_bp", "dominant_fraction"],
        ascending=[False, False, False],
    )


def build_fission_architecture(
    ref_target_spans: pd.DataFrame,
    qualifying: pd.DataFrame,
) -> pd.DataFrame:
    rows = []
    qualifying_targets = (
        qualifying.groupby(["target_genome", "reference_seq_id"], sort=False)["target_seq_id"]
        .agg(lambda values: list(values))
        .to_dict()
    )
    for (target_genome, reference_seq_id), group in ref_target_spans.groupby(
        ["target_genome", "reference_seq_id"], sort=False
    ):
        ordered = group.sort_values("total_span_bp", ascending=False).reset_index(drop=True)
        targets = ordered["target_seq_id"].astype(str).tolist()
        dom = ordered.iloc[0]
        second = ordered.iloc[1] if len(ordered) > 1 else None
        qualifying_ids = qualifying_targets.get((target_genome, reference_seq_id), [])
        rows.append(
            {
                "target_genome": target_genome,
                "reference_seq_id": reference_seq_id,
                "reference_total_span_bp": int(dom["reference_total_span_bp"]),
                "n_target_sequences": int(len(targets)),
                "dominant_target_seq_id": dom["target_seq_id"],
                "dominant_fraction": float(dom["reference_fraction"]),
                "second_target_seq_id": "" if second is None else second["target_seq_id"],
                "second_fraction": 0.0 if second is None else float(second["reference_fraction"]),
                "target_seq_ids_ranked": ",".join(targets),
                "is_multi_target_signal": len(qualifying_ids) >= 2,
            }
        )
    return pd.DataFrame(rows).sort_values(
        ["is_multi_target_signal", "reference_total_span_bp", "dominant_fraction"],
        ascending=[False, False, False],
    )


def build_reference_chromosome_fate(
    fission_architecture: pd.DataFrame,
    inversion_runs: pd.DataFrame,
    corr_long: pd.DataFrame,
) -> pd.DataFrame:
    def explode_refs(df: pd.DataFrame, genome_col: str = "target_genome") -> pd.DataFrame:
        if df.empty:
            return pd.DataFrame(columns=[genome_col, "reference_seq_id"])
        exploded = df.assign(reference_seq_id=df["reference_seq_ids"].str.split(",")).explode("reference_seq_id")
        return exploded.loc[exploded["reference_seq_id"].astype(str) != "", [genome_col, "reference_seq_id"]].drop_duplicates()

    inv_flags = explode_refs(inversion_runs).assign(has_inversion_signal=True)

    recovered = (
        corr_long.groupby(["target_genome", "reference_seq_id"], sort=False)["total_span_bp"]
        .sum()
        .rename("total_recovered_span_bp")
        .reset_index()
    )

    fate = (
        fission_architecture.rename(
            columns={
                "dominant_target_seq_id": "dominant_target_seq_id",
                "dominant_fraction": "dominant_fraction",
                "n_target_sequences": "n_target_sequences_with_signal",
                "is_multi_target_signal": "is_fission_like",
            }
        )[
            [
                "target_genome",
                "reference_seq_id",
                "dominant_target_seq_id",
                "dominant_fraction",
                "n_target_sequences_with_signal",
                "is_fission_like",
            ]
        ]
        .merge(recovered, on=["target_genome", "reference_seq_id"], how="left")
        .merge(inv_flags, on=["target_genome", "reference_seq_id"], how="left")
        .fillna(
            {
                "has_inversion_signal": False,
            }
        )
    )
    return fate


def build_target_contig_origin(
    fusion_architecture: pd.DataFrame,
    inversion_runs: pd.DataFrame,
) -> pd.DataFrame:
    def mark_presence(df: pd.DataFrame, flag_col: str) -> pd.DataFrame:
        if df.empty:
            return pd.DataFrame(columns=["target_genome", "target_seq_id", flag_col])
        return df[["target_genome", "target_seq_id"]].drop_duplicates().assign(**{flag_col: True})

    origin = (
        fusion_architecture.rename(
            columns={
                "dominant_reference_seq_id": "main_reference_seq_id",
                "dominant_fraction": "main_reference_fraction",
                "n_reference_chromosomes": "n_reference_chromosomes_with_signal",
                "seq_total_span_bp": "total_macrosyntenic_span_bp",
            }
        )[
            [
                "target_genome",
                "target_seq_id",
                "main_reference_seq_id",
                "main_reference_fraction",
                "n_reference_chromosomes_with_signal",
                "is_multi_reference_signal",
                "total_macrosyntenic_span_bp",
            ]
        ]
        .rename(columns={"is_multi_reference_signal": "is_fusion_like"})
        .merge(mark_presence(inversion_runs, "has_inversion_signal"), on=["target_genome", "target_seq_id"], how="left")
        .fillna({"has_inversion_signal": False})
    )
    return origin


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze ntSynt macrosynteny and write summary TSV tables.")
    parser.add_argument(
        "--input-prefix",
        default=None,
        help="Shared ntSynt_viz prefix, e.g. 'macrosynteny_viz' to resolve *.links.tsv, *.chrom-paint-feats.tsv and *.sequence_lengths.sorted.tsv",
    )
    parser.add_argument("--links", default="macrosynteny_viz.links.tsv")
    parser.add_argument("--chrom-paint", dest="chrom_paint", default="macrosynteny_viz.chrom-paint-feats.tsv")
    parser.add_argument("--sequence-lengths", dest="sequence_lengths", default="macrosynteny_viz.sequence_lengths.sorted.tsv")
    parser.add_argument("--synteny-blocks", default="macrosynteny.synteny_blocks.tsv")
    parser.add_argument("--premerge-synteny-blocks", default=None)
    parser.add_argument("--output-dir", default="macrosynteny_ai_analysis")
    parser.add_argument("--fusion-min-span-bp", type=int, default=1_000_000)
    parser.add_argument("--fusion-min-fraction", type=float, default=0.10)
    parser.add_argument("--translocation-min-span-bp", type=int, default=500_000)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    links_path, chrom_path, seq_lengths_path, synteny_blocks_path, premerge_path = resolve_inputs(args)
    required_paths = [links_path, chrom_path, seq_lengths_path, synteny_blocks_path]
    for path in required_paths:
        if not path.exists():
            fail(f"Required input file not found: {path}")
    if premerge_path is not None and not premerge_path.exists():
        warn(f"Optional premerge synteny block file not found: {premerge_path}")
        premerge_path = None

    links = pd.read_csv(links_path, sep="\t")
    chrom = pd.read_csv(chrom_path, sep="\t")
    seq_lengths = pd.read_csv(seq_lengths_path, sep="\t")
    synteny_blocks = read_synteny_blocks(synteny_blocks_path)

    require_columns(
        links,
        ["block_id", "seq_id", "bin_id", "start", "end", "seq_id2", "bin_id2", "start2", "end2", "strand"],
        str(links_path),
    )
    require_columns(
        chrom,
        ["block_id", "seq_id", "bin_id", "start", "end", "colour_block"],
        str(chrom_path),
    )
    require_columns(
        seq_lengths,
        ["bin_id", "seq_id", "length", "relative_orientation"],
        str(seq_lengths_path),
    )
    validate_linear_chain(links)

    genome_order = infer_genome_order(links)
    genome_rank = {genome: idx for idx, genome in enumerate(genome_order)}
    reference_genome = genome_order[0]
    reference_rank = build_reference_sequence_rank(seq_lengths, reference_genome)

    normalized = (
        chrom.drop_duplicates(["block_id", "bin_id", "seq_id", "start", "end", "colour_block"])
        .assign(span_bp=lambda df: df["end"] - df["start"] + 1)
        .merge(build_orientation_map(links, genome_order), on=["block_id", "bin_id"], how="left")
        .merge(
            seq_lengths.rename(
                columns={
                    "length": "sequence_length_bp",
                    "relative_orientation": "sequence_relative_orientation",
                }
            ),
            on=["bin_id", "seq_id"],
            how="left",
        )
        .assign(genome_rank=lambda df: df["bin_id"].map(genome_rank))
        .sort_values(["block_id", "genome_rank", "seq_id", "start"])
        .reset_index(drop=True)
    )

    duplicate_pairs = normalized.groupby(["block_id", "bin_id"]).size()
    duplicate_pairs = duplicate_pairs[duplicate_pairs > 1]
    if not duplicate_pairs.empty:
        preview = ", ".join(
            f"{block_id}/{bin_id}({count})"
            for (block_id, bin_id), count in duplicate_pairs.head(10).items()
        )
        fail(
            "Normalized table is not one row per block per genome after de-duplication. "
            f"Examples: {preview}"
        )

    missing_seq_lengths = normalized["sequence_length_bp"].isna().sum()
    if missing_seq_lengths > 0:
        warn(
            f"{missing_seq_lengths} row(s) in the normalized table have no matching entry in "
            f"{seq_lengths_path.name}; sequence_length_bp and coverage metrics will be NaN for those rows."
        )

    missing_orientation = normalized["orientation_to_reference"].isna().sum()
    if missing_orientation > 0:
        fail(
            f"{missing_orientation} row(s) have no inferred orientation_to_reference. "
            "This revision requires complete orientation mapping for orientation-based summaries."
        )

    ref_coords = normalized.loc[
        normalized["bin_id"] == reference_genome,
        ["block_id", "seq_id", "start", "end", "span_bp"],
    ].rename(
        columns={
            "seq_id": "reference_seq_id",
            "start": "reference_start",
            "end": "reference_end",
            "span_bp": "reference_span_bp",
        }
    )
    normalized = normalized.merge(ref_coords, on="block_id", how="left")
    normalized["block_is_reference_anchored"] = normalized["reference_seq_id"].notna()
    write_tsv(normalized, output_dir / "normalized_block_genome_table.tsv")

    raw_status_table = (
        synteny_blocks.assign(
            span_bp=lambda df: df["end"] - df["start"] + 1,
            genome_rank=lambda df: df["bin_id"].map(genome_rank),
            is_reference_genome=lambda df: df["bin_id"] == reference_genome,
        )
        .merge(
            normalized[
                [
                    "block_id",
                    "bin_id",
                    "reference_seq_id",
                    "reference_start",
                    "reference_end",
                    "orientation_to_reference",
                    "block_is_reference_anchored",
                ]
            ].drop_duplicates(["block_id", "bin_id"]),
            on=["block_id", "bin_id"],
            how="left",
        )
        .sort_values(["genome_rank", "seq_id", "start", "end", "block_id"])
        .reset_index(drop=True)
    )
    raw_status_table["reference_seq_id"] = raw_status_table["reference_seq_id"].fillna("")
    raw_status_table["orientation_to_reference"] = raw_status_table["orientation_to_reference"].fillna("")
    write_tsv(raw_status_table, output_dir / "synteny_block_status_table.tsv")

    all_block_ids = pd.Index(sorted(set(chrom["block_id"]).union(set(links["block_id"]))))
    completeness = (
        normalized.groupby("block_id", sort=True)
        .agg(
            n_genomes_present=("bin_id", "nunique"),
            total_block_span_bp=("span_bp", "sum"),
            reference_seq_id=("reference_seq_id", "first"),
            reference_start=("reference_start", "first"),
            reference_end=("reference_end", "first"),
            block_is_reference_anchored=("block_is_reference_anchored", "any"),
        )
        .reindex(all_block_ids, fill_value=0)
        .rename_axis("block_id")
        .reset_index()
    )
    block_genomes = normalized.groupby("block_id")["bin_id"].agg(lambda values: set(values)).to_dict()
    completeness["missing_genomes"] = completeness["block_id"].map(
        lambda block_id: ",".join([g for g in genome_order if g not in block_genomes.get(block_id, set())])
    )
    completeness["is_complete"] = completeness["n_genomes_present"] == len(genome_order)
    write_tsv(completeness, output_dir / "block_completeness.tsv")

    assembly_lengths = (
        seq_lengths.groupby("bin_id", sort=False)["length"].sum().rename("assembly_length_bp").reset_index()
    )
    covered_bp = (
        normalized.groupby(["bin_id", "seq_id"], sort=False)
        .apply(merge_intervals, include_groups=False)
        .rename("covered_bp")
        .reset_index()
    )
    species_covered = covered_bp.groupby("bin_id", sort=False)["covered_bp"].sum().reset_index()
    species_summary = (
        normalized.groupby("bin_id", sort=False)
        .agg(
            n_blocks=("block_id", "nunique"),
            n_sequences_touched=("seq_id", "nunique"),
            total_block_span_bp=("span_bp", "sum"),
            mean_block_span_bp=("span_bp", "mean"),
            median_block_span_bp=("span_bp", "median"),
            min_block_span_bp=("span_bp", "min"),
            max_block_span_bp=("span_bp", "max"),
        )
        .reset_index()
        .merge(species_covered, on="bin_id", how="left")
        .merge(assembly_lengths, on="bin_id", how="left")
    )
    species_summary["covered_fraction_of_assembly"] = (
        species_summary["covered_bp"] / species_summary["assembly_length_bp"]
    )
    species_summary["redundant_span_fraction"] = (
        species_summary["total_block_span_bp"] / species_summary["covered_bp"]
    )
    write_tsv(species_summary, output_dir / "per_species_block_span_summary.tsv")

    orientation_summary = (
        normalized.groupby(["bin_id", "orientation_to_reference"], sort=False)
        .size()
        .rename("n_blocks")
        .reset_index()
        .pivot(index="bin_id", columns="orientation_to_reference", values="n_blocks")
        .fillna(0)
        .reset_index()
    )
    for strand in [FORWARD, REVERSE]:
        if strand not in orientation_summary.columns:
            orientation_summary[strand] = 0
    orientation_summary = orientation_summary.rename(
        columns={FORWARD: "forward_blocks", REVERSE: "reverse_blocks"}
    )
    orientation_summary["total_blocks"] = (
        orientation_summary["forward_blocks"] + orientation_summary["reverse_blocks"]
    )
    orientation_summary["reverse_fraction"] = orientation_summary["reverse_blocks"] / orientation_summary["total_blocks"]
    write_tsv(orientation_summary, output_dir / "orientation_summary.tsv")

    orientation_patterns = (
        normalized.sort_values(["block_id", "genome_rank"])
        .groupby("block_id", sort=True)
        .agg(
            reference_seq_id=("reference_seq_id", "first"),
            orientation_pattern=("orientation_to_reference", lambda values: "".join(values)),
            n_reverse=("orientation_to_reference", lambda values: sum(v == REVERSE for v in values)),
            n_genomes_in_pattern=("orientation_to_reference", "size"),
        )
        .reset_index()
    )
    orientation_patterns["all_forward"] = orientation_patterns["n_reverse"] == 0
    write_tsv(orientation_patterns, output_dir / "orientation_patterns_by_block.tsv")

    correspondence_long = (
        normalized.loc[normalized["bin_id"] != reference_genome]
        .groupby(["reference_seq_id", "bin_id", "seq_id"], sort=False)
        .agg(
            n_blocks=("block_id", "nunique"),
            total_span_bp=("span_bp", "sum"),
            mean_span_bp=("span_bp", "mean"),
        )
        .reset_index()
        .rename(columns={"bin_id": "target_genome", "seq_id": "target_seq_id"})
        .sort_values(["target_genome", "reference_seq_id", "total_span_bp"], ascending=[True, True, False])
    )
    write_tsv(correspondence_long, output_dir / "reference_to_target_correspondence.long.tsv")

    for target_genome, genome_df in correspondence_long.groupby("target_genome", sort=False):
        matrix = (
            genome_df.pivot_table(
                index="reference_seq_id",
                columns="target_seq_id",
                values="total_span_bp",
                aggfunc="sum",
                fill_value=0,
            )
            .reset_index()
        )
        safe_name = target_genome.replace("/", "_")
        write_tsv(matrix, output_dir / f"reference_to_target_correspondence.{safe_name}.matrix.tsv")

    normalized["block_midpoint"] = ((normalized["start"] + normalized["end"]) / 2).round(1)
    normalized["reference_midpoint"] = (
        (normalized["reference_start"] + normalized["reference_end"]) / 2
    ).round(1)

    block_breaks = normalized.loc[normalized["bin_id"] != reference_genome].copy()
    block_breaks = block_breaks.sort_values(["bin_id", "seq_id", "start"]).rename(
        columns={"bin_id": "target_genome", "seq_id": "target_seq_id"}
    )
    block_breaks["prev_reference_seq_id"] = block_breaks.groupby(
        ["target_genome", "target_seq_id"], sort=False
    )["reference_seq_id"].shift(1)
    block_breaks["prev_reference_end"] = block_breaks.groupby(
        ["target_genome", "target_seq_id"], sort=False
    )["reference_end"].shift(1)
    translocation_candidates = block_breaks.loc[
        block_breaks["prev_reference_seq_id"].notna()
        & (block_breaks["reference_seq_id"] != block_breaks["prev_reference_seq_id"])
        & (block_breaks["span_bp"] >= args.translocation_min_span_bp)
    ].copy()
    translocation_columns = [
        "target_genome",
        "target_seq_id",
        "block_id",
        "reference_seq_id",
        "reference_start",
        "reference_end",
        "span_bp",
        "prev_reference_seq_id",
        "prev_reference_end",
    ]
    translocation_candidates = translocation_candidates[translocation_columns].sort_values(
        ["target_genome", "target_seq_id", "block_id"]
    )
    write_tsv(translocation_candidates, output_dir / "candidate_translocations.tsv")
    write_tsv(translocation_candidates, output_dir / "candidate_translocation_switches.tsv")

    status_non_reference = raw_status_table.loc[~raw_status_table["is_reference_genome"]].copy()
    inversion_runs = collapse_status_runs(status_non_reference, "ori_change", include_orientation_pattern=True)
    write_tsv(inversion_runs, output_dir / "candidate_inversions.tsv")

    target_seq_ref_spans = (
        normalized.loc[normalized["bin_id"] != reference_genome]
        .groupby(["bin_id", "seq_id", "reference_seq_id"], sort=False)
        .agg(total_span_bp=("span_bp", "sum"), n_blocks=("block_id", "nunique"))
        .reset_index()
        .rename(columns={"bin_id": "target_genome", "seq_id": "target_seq_id"})
    )
    seq_totals = (
        target_seq_ref_spans.groupby(["target_genome", "target_seq_id"], sort=False)["total_span_bp"]
        .sum()
        .rename("seq_total_span_bp")
        .reset_index()
    )
    target_seq_ref_spans = target_seq_ref_spans.merge(seq_totals, on=["target_genome", "target_seq_id"], how="left")
    target_seq_ref_spans["seq_fraction"] = (
        target_seq_ref_spans["total_span_bp"] / target_seq_ref_spans["seq_total_span_bp"]
    )
    fusion_candidates = target_seq_ref_spans.loc[
        (target_seq_ref_spans["total_span_bp"] >= args.fusion_min_span_bp)
        & (target_seq_ref_spans["seq_fraction"] >= args.fusion_min_fraction)
    ].copy()
    fusion_candidate_counts = (
        fusion_candidates.groupby(["target_genome", "target_seq_id"], sort=False)
        .agg(
            n_reference_chromosomes=("reference_seq_id", "nunique"),
            seq_total_span_bp=("seq_total_span_bp", "first"),
        )
        .reset_index()
    )
    fusion_candidate_counts = fusion_candidate_counts.loc[
        fusion_candidate_counts["n_reference_chromosomes"] >= 2
    ]
    fusion_candidates = fusion_candidates.merge(
        fusion_candidate_counts,
        on=["target_genome", "target_seq_id", "seq_total_span_bp"],
        how="inner",
    ).sort_values(["target_genome", "target_seq_id", "total_span_bp"], ascending=[True, True, False])
    write_tsv(fusion_candidates, output_dir / "candidate_fusions.tsv")

    ref_target_spans = (
        normalized.loc[normalized["bin_id"] != reference_genome]
        .groupby(["bin_id", "reference_seq_id", "seq_id"], sort=False)
        .agg(total_span_bp=("span_bp", "sum"), n_blocks=("block_id", "nunique"))
        .reset_index()
        .rename(columns={"bin_id": "target_genome", "seq_id": "target_seq_id"})
    )
    ref_totals = (
        ref_target_spans.groupby(["target_genome", "reference_seq_id"], sort=False)["total_span_bp"]
        .sum()
        .rename("reference_total_span_bp")
        .reset_index()
    )
    ref_target_spans = ref_target_spans.merge(
        ref_totals, on=["target_genome", "reference_seq_id"], how="left"
    )
    ref_target_spans["reference_fraction"] = (
        ref_target_spans["total_span_bp"] / ref_target_spans["reference_total_span_bp"]
    )
    fission_candidates = ref_target_spans.loc[
        (ref_target_spans["total_span_bp"] >= args.fusion_min_span_bp)
        & (ref_target_spans["reference_fraction"] >= args.fusion_min_fraction)
    ].copy()
    fission_candidate_counts = (
        fission_candidates.groupby(["target_genome", "reference_seq_id"], sort=False)
        .agg(
            n_target_sequences=("target_seq_id", "nunique"),
            reference_total_span_bp=("reference_total_span_bp", "first"),
        )
        .reset_index()
    )
    fission_candidate_counts = fission_candidate_counts.loc[
        fission_candidate_counts["n_target_sequences"] >= 2
    ]
    fission_candidates = fission_candidates.merge(
        fission_candidate_counts,
        on=["target_genome", "reference_seq_id", "reference_total_span_bp"],
        how="inner",
    ).sort_values(["target_genome", "reference_seq_id", "total_span_bp"], ascending=[True, True, False])
    write_tsv(fission_candidates, output_dir / "candidate_fissions.tsv")

    fusion_architecture = build_fusion_architecture(
        target_seq_ref_spans,
        fusion_candidates,
        reference_rank,
    )
    fission_architecture = build_fission_architecture(
        ref_target_spans,
        fission_candidates,
    )
    write_tsv(fusion_architecture, output_dir / "fusion_architecture.tsv")
    write_tsv(fission_architecture, output_dir / "fission_architecture.tsv")

    reference_chromosome_fate = build_reference_chromosome_fate(
        fission_architecture,
        inversion_runs,
        correspondence_long,
    )
    target_contig_origin = build_target_contig_origin(
        fusion_architecture,
        inversion_runs,
    )
    write_tsv(reference_chromosome_fate, output_dir / "reference_chromosome_fate.tsv")
    write_tsv(target_contig_origin, output_dir / "target_contig_origin.tsv")

    missing_ref_blocks = normalized.loc[normalized["bin_id"] == reference_genome, ["block_id", "reference_seq_id"]]
    present_nonref = normalized.loc[normalized["bin_id"] != reference_genome, ["block_id", "bin_id"]].drop_duplicates()
    indel_by_genome = (
        status_non_reference.loc[status_non_reference["block_status"] == "indel"]
        .groupby("bin_id", sort=False)
        .agg(
            n_indel_blocks=("block_id", "nunique"),
            total_indel_block_span_bp=("span_bp", "sum"),
        )
        .reset_index()
        .rename(columns={"bin_id": "target_genome"})
    )
    missing_rows = []
    for target_genome in genome_order[1:]:
        present_blocks = set(present_nonref.loc[present_nonref["bin_id"] == target_genome, "block_id"])
        missing = missing_ref_blocks.loc[~missing_ref_blocks["block_id"].isin(present_blocks)].copy()
        missing_rows.append(
            {
                "target_genome": target_genome,
                "n_missing_blocks_from_reference": int(missing["block_id"].nunique()),
                "missing_block_fraction": float(
                    missing["block_id"].nunique() / max(1, missing_ref_blocks["block_id"].nunique())
                ),
                "missing_reference_chromosomes_count": int(
                    missing.loc[missing["reference_seq_id"].notna(), "reference_seq_id"].nunique()
                ),
            }
        )
    indel_missingness = (
        pd.DataFrame(missing_rows)
        .merge(indel_by_genome, on="target_genome", how="left")
        .fillna({"n_indel_blocks": 0, "total_indel_block_span_bp": 0})
    )
    indel_missingness["n_indel_blocks"] = indel_missingness["n_indel_blocks"].astype(int)
    indel_missingness["total_indel_block_span_bp"] = indel_missingness["total_indel_block_span_bp"].astype(int)
    write_tsv(indel_missingness, output_dir / "indel_missingness_summary.tsv")

    inversion_profile = (
        inversion_runs.groupby("target_genome", sort=False)
        .agg(
            n_inversion_runs=("target_seq_id", "size"),
            bp_in_inversion_runs=("total_block_span_bp", "sum"),
        )
        .reset_index()
    )
    translocation_counts = (
        translocation_candidates.groupby("target_genome", sort=False)
        .size()
        .rename("n_candidate_translocation_switches")
        .reset_index()
    )
    fusion_counts = (
        fusion_architecture.loc[fusion_architecture["is_multi_reference_signal"]]
        .groupby("target_genome", sort=False)
        .size()
        .rename("n_fusion_like_sequences")
        .reset_index()
    )
    fission_counts = (
        fission_architecture.loc[fission_architecture["is_multi_target_signal"]]
        .groupby("target_genome", sort=False)
        .size()
        .rename("n_fission_like_reference_chromosomes")
        .reset_index()
    )
    rearrangement_profile = (
        species_summary.rename(columns={"bin_id": "target_genome"})
        .loc[lambda df: df["target_genome"] != reference_genome]
        .merge(
            orientation_summary.rename(columns={"bin_id": "target_genome"})[
                ["target_genome", "reverse_fraction", "forward_blocks", "reverse_blocks", "total_blocks"]
            ],
            on="target_genome",
            how="left",
        )
        .merge(inversion_profile, on="target_genome", how="left")
        .merge(translocation_counts, on="target_genome", how="left")
        .merge(fusion_counts, on="target_genome", how="left")
        .merge(fission_counts, on="target_genome", how="left")
        .merge(indel_missingness, on="target_genome", how="left")
        .fillna(0)
    )
    int_cols = [
        "n_blocks",
        "n_sequences_touched",
        "total_block_span_bp",
        "covered_bp",
        "assembly_length_bp",
        "forward_blocks",
        "reverse_blocks",
        "total_blocks",
        "n_inversion_runs",
        "bp_in_inversion_runs",
        "n_candidate_translocation_switches",
        "n_fusion_like_sequences",
        "n_fission_like_reference_chromosomes",
        "n_indel_blocks",
        "total_indel_block_span_bp",
        "n_missing_blocks_from_reference",
        "missing_reference_chromosomes_count",
    ]
    for col in int_cols:
        rearrangement_profile[col] = rearrangement_profile[col].astype(int)
    rearrangement_profile = rearrangement_profile.sort_values(
        "reverse_fraction", ascending=False
    )
    write_tsv(rearrangement_profile, output_dir / "rearrangement_profile.tsv")

    rearrangement_summary = rearrangement_profile[
        [
            "target_genome",
            "forward_blocks",
            "reverse_blocks",
            "total_blocks",
            "reverse_fraction",
            "n_candidate_translocation_switches",
            "n_fusion_like_sequences",
            "n_fission_like_reference_chromosomes",
        ]
    ].rename(columns={"n_candidate_translocation_switches": "n_candidate_translocations"})
    rearrangement_summary["n_target_sequences_with_multi_reference_signal"] = rearrangement_profile[
        "n_fusion_like_sequences"
    ]
    rearrangement_summary["n_reference_chromosomes_with_multi_target_signal"] = rearrangement_profile[
        "n_fission_like_reference_chromosomes"
    ]
    write_tsv(rearrangement_summary, output_dir / "rearrangement_summary.tsv")

    metadata = pd.DataFrame(
        [
            {"key": "reference_genome", "value": reference_genome},
            {"key": "genome_order", "value": ",".join(genome_order)},
            {"key": "n_blocks", "value": str(normalized["block_id"].nunique())},
            {"key": "n_genomes", "value": str(len(genome_order))},
            {"key": "links_path", "value": str(links_path)},
            {"key": "chrom_paint_path", "value": str(chrom_path)},
            {"key": "sequence_lengths_path", "value": str(seq_lengths_path)},
            {"key": "synteny_blocks_path", "value": str(synteny_blocks_path)},
            {"key": "premerge_synteny_blocks_path", "value": "" if premerge_path is None else str(premerge_path)},
            {"key": "fusion_min_span_bp", "value": str(args.fusion_min_span_bp)},
            {"key": "fusion_min_fraction", "value": str(args.fusion_min_fraction)},
            {"key": "translocation_min_span_bp", "value": str(args.translocation_min_span_bp)},
        ]
    )
    write_tsv(metadata, output_dir / "analysis_metadata.tsv")


if __name__ == "__main__":
    main()
