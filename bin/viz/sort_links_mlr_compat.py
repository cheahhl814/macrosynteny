#!/usr/bin/env python3
"""Replicate `mlr --tsv sort -f strand -n block_id` (Miller) as a stdlib/pandas shim.

Upstream ntSynt's format_blocks_gggenomes.sh ends with:
    cat ${prefix}.links.tsv | mlr --tsv sort -f strand -n block_id > tmp && mv tmp ${prefix}.links.tsv
i.e. a stable TSV sort by `strand` (lexical) then `block_id` (numeric), header kept.
miller clashed with ntsynt in one pixi env, so this shim replaces it: run with
`python3 sort_links_mlr_compat.py <links.tsv>` (sorts in place via a tmp file).
"""
import argparse
import os
import sys

import pandas as pd


def main() -> None:
    ap = argparse.ArgumentParser(description="Sort a links.tsv by strand (lex) then block_id (numeric)")
    ap.add_argument("links_tsv", help="links TSV to sort in place")
    args = ap.parse_args()

    df = pd.read_csv(args.links_tsv, sep="\t", dtype={"strand": str, "block_id": str},
                    keep_default_na=False)
    columns = list(df.columns)
    if "strand" not in columns and "block_id" not in columns:
        sys.exit(f"ERROR: {args.links_tsv} lacks strand/block_id columns")
    df["_block_id_num"] = pd.to_numeric(df["block_id"], errors="coerce")
    df = df.sort_values(["strand", "_block_id_num"], kind="stable")
    df = df.drop(columns=["_block_id_num"])[columns]
    tmp = args.links_tsv + ".sorted.tmp"
    df.to_csv(tmp, sep="\t", index=False)
    os.replace(tmp, args.links_tsv)
    print(f"Sorted {args.links_tsv} (strand lex, block_id numeric) — {len(df)} lines")


if __name__ == "__main__":
    main()