#!/usr/bin/env python3
"""Convert a gggenomes-format links.tsv (from ntSynt's format_blocks_gggenomes.py) into
FunMacroSynteny's expected input schema.

The two schemas differ (evidence: docs-corpus/funmacrosynteny/app-notes.md):

  gggenomes (ntSynt):  block_id  seq_id  bin_id  start  end  seq_id2  bin_id2  start2  end2  strand?  block_ori?  colour_block?
  FunMacroSynteny:     block_id  bin_id  seq_id  start  end  bin_id2  seq_id2  start2  end2 [strand]

i.e. bin_id/seq_id swap places, and FunMacroSynteny tolerates at most the optional
strand column. This script reorders the columns, keeps strand when present, and
passes any other columns through to `--extra-cols` on demand (default: dropped).

Usage: links_gggenomes_to_funmacro.py <links.tsv> [<out.tsv>] [--extra-cols block_ori,colour_block]
"""
import argparse
import sys

import pandas as pd


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("links_tsv")
    ap.add_argument("out_tsv", nargs="?", help="default: stdout")
    ap.add_argument("--extra-cols", default="", help="comma-separated extra columns to keep after strand")
    args = ap.parse_args()

    df = pd.read_csv(args.links_tsv, sep="\t", dtype=str, keep_default_na=False)
    missing = [c for c in ["block_id", "bin_id", "seq_id", "start", "end",
                           "bin_id2", "seq_id2", "start2", "end2"] if c not in df.columns]
    if missing:
        sys.exit(f"ERROR: missing columns {missing} — is this a FunMacroSynteny-native links.tsv already?")
    # gggenomes layout: bin_id sits with seq_id swapped; detect which layout we got
    if {"seq_id", "bin_id"} <= set(df.columns) and "bin_id" not in df.columns[[0]].tolist() and df.columns.tolist()[1:3] == ["seq_id", "bin_id"]:
        # raw block tsv shape (ntSynt 8-col): bin_id absent — nothing to do here
        pass
    need_swap = df.columns.tolist()[1:3] == ["seq_id", "bin_id"] or df.columns.tolist()[1:3] == ["seq_id2", "bin_id2"]
    if not need_swap:
        # already FunMacroSynteny-shaped (bin_id before seq_id) — pass through
        out_cols = [c for c in ["block_id", "bin_id", "seq_id", "start", "end",
                                "bin_id2", "seq_id2", "start2", "end2", "strand",
                                *(c.strip() for c in args.extra_cols.split(",") if c.strip())]
                    if c in df.columns]
        df[out_cols].to_csv(args.out_tsv or sys.stdout, sep="\t", index=False)
        return
    out = df.copy()
    gg = df.columns.tolist()
    # locate pairs: first genome = (seq_id, bin_id) at positions 1,2
    a_seq, a_bin = gg[1], gg[2]
    a_start, a_end = gg[3], gg[4]
    b_seq, b_bin = next(c for c in gg[5:] if "seq_id2" in c), next(c for c in gg[5:] if "bin_id2" in c)
    b_start, b_end = next(c for c in gg[5:] if c.endswith("2") and "start" in c), next(c for c in gg[5:] if c.endswith("2") and "end" in c)
    # normalize numeric coords: FunMacroSynteny wants each pair sorted (start<=end)
    a0 = out[a_start].astype(int); a1 = out[a_end].astype(int)
    b0 = out[b_start].astype(int); b1 = out[b_end].astype(int)
    out["start"], out["end"] = pd.concat([a0, a1], axis=1).min(axis=1), pd.concat([a0, a1], axis=1).max(axis=1)
    out["start2"], out["end2"] = pd.concat([b0, b1], axis=1).min(axis=1), pd.concat([b0, b1], axis=1).max(axis=1)
    out["bin_id"], out["seq_id"] = df[a_bin], df[a_seq]
    out["bin_id2"], out["seq_id2"] = df[b_bin], df[b_seq]
    keep = (["block_id", "bin_id", "seq_id", "start", "end", "bin_id2", "seq_id2", "start2", "end2"]
            + (["strand"] if "strand" in out.columns else [])
            + [c.strip() for c in args.extra_cols.split(",") if c.strip() and c.strip() in out.columns])
    out[keep].to_csv(args.out_tsv or sys.stdout, sep="\t", index=False)


if __name__ == "__main__":
    main()