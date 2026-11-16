#!/usr/bin/env python3
# centromere_overlap.py — flag fusion junctions / fission gaps that coincide with
# centromere-candidate regions (soft contract with the centromere-prediction skill).
#
# Why: a Robertsonian-type fusion forms AT a centromere (acrocentric → metacentric), and a
# centromere can be the breaking point of a fission. Synteny + telomere evidence alone cannot
# see this; overlapping the breakpoints with centromere candidates adds the missing discriminator.
# A centromere-overlapping junction SUPPORTS a centric (Robertsonian-type) event; a junction
# far from any centromere candidate is interstitial. Absence of evidence (no centromere calls
# for that genome) is reported as 'na', never as 'no'.
#
# License: GPL-3.0 (consistent with the skill's vendored-asset licensing).

"""Report centromere-candidate overlap at candidate fusion junctions and fission gaps.

Reads:
  <analysis-dir>/normalized_block_genome_table.tsv  (from bin/analysis/analyze_macrosynteny.py)
  <analysis-dir>/analysis_metadata.tsv              (for reference_genome; optional if --reference-genome given)

Inputs (per genome, repeatable):
  --centromeres GENOME=PATH
    PATH must contain scaffold/seq_id, start, end columns (header or headerless; extra columns
    ignored). Directly compatible with centromere-prediction outputs:
      centromere_summary.tsv        (scaffold start end n_repeats)
      regions/candidate_regions.tsv (scaffold start end)
      satellite_main_blocks.tsv     (scaffold scaffold_len start end ...)
    Coordinates are used as 0-based half-open; a 1 bp register shift is immaterial here.

Writes: <analysis-dir>/centromere_overlap.tsv
  kind, genome, seq, frame, detail, gap_start, gap_end, gap_bp, centromere_overlap, centromere_source

  kind=fusion_junction: seq is the TARGET contig; frame=target; detail="RefLeft|RefRight";
      gap = coords on the target contig between the blocks flanking the reference-chromosome
      switch. Overlap is tested against the *target* genome's centromere candidates.
  kind=fission_gap:   seq is the REFERENCE chromosome; frame=reference; detail="fragLeft|fragRight";
      gap = coords on the reference chromosome between the two fragments. Overlap is tested
      against the *reference* genome's centromere candidates (--reference-genome or
      analysis_metadata.tsv's reference_genome).

  centromere_overlap: yes | no | na (na = no centromere file supplied for that genome)
Exit code 0 even when some genomes lack centromere data (those rows are 'na'); 2 on missing inputs.
"""

import argparse
import os
import sys

import pandas as pd

SCRIPTS_NOTE = "see centromere-prediction skill (results/centromere/centromere_summary.tsv)"


def stem(name: str) -> str:
    b = os.path.basename(str(name))
    if b.endswith(".fai"):
        b = b[:-4]
    if b.lower().endswith(".gz"):
        b = b[:-3]
    for ext in (".fasta", ".fna", ".ffn", ".fa"):
        if b.lower().endswith(ext):
            return b[: -len(ext)]
    return b


def norm_key(s: str) -> str:
    return stem(s).lower()


def read_centromeres(path):
    """Header-tolerant TSV reader -> {seq: [(start, end), ...]}."""
    with open(path) as fh:
        rows = [[c.strip() for c in l.rstrip("\n").split("\t")] for l in fh if l.strip()]
    if not rows:
        return {}

    def is_int(s):
        try:
            int(s)
            return True
        except ValueError:
            return False

    hdr = [c.strip().lower() for c in rows[0]]

    def col(names):
        for n in names:
            if n in hdr:
                return hdr.index(n)
        return None

    seq_c = col(["scaffold", "seq_id", "seq", "contig", "chr", "chrom", "sequence"])
    st_c = col(["start", "start_pos", "begin"])
    en_c = col(["end", "end_pos", "stop"])
    body = rows
    if seq_c is None:
        if len(rows[0]) >= 3 and is_int(rows[0][1]) and is_int(rows[0][2]):
            seq_c, st_c, en_c = 0, 1, 2
        else:
            sys.exit(f"error: cannot locate scaffold/start/end columns in {path}")
    elif st_c is None or en_c is None:
        int_cols = sorted(i for i, c in enumerate(hdr) if i != seq_c
                          and all(is_int(r[i]) for r in rows[1:]))
        if len(int_cols) < 2:
            sys.exit(f"error: cannot locate start/end columns in {path}")
        st_c, en_c = int_cols[0], int_cols[1]
    if rows[0] and not is_int(rows[0][st_c]):
        body = rows[1:]
    bands = {}
    for r in body:
        try:
            bands.setdefault(r[seq_c], []).append((int(r[st_c]), int(r[en_c])))
        except (ValueError, IndexError):
            continue
    return bands


def overlap(bands, seq, lo, hi):
    """-> ('yes', bp) / ('no', 0) for the given interval on seq."""
    hit = 0
    for s, e in bands.get(seq, []):
        ov = min(e, max(hi, lo + 1)) - max(s, lo)
        if ov > 0:
            hit += ov
    return ("yes", hit) if hit else ("no", 0)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run-dir", default=os.environ.get("RUN_DIR", "."), help="run root [RUN_DIR env or .]")
    ap.add_argument("--analysis-dir", help="default: <run-dir>/analysis")
    ap.add_argument("--centromeres", action="append", default=[], metavar="GENOME=PATH",
                    help="centromere candidates for one genome (repeatable); " + SCRIPTS_NOTE)
    ap.add_argument("--reference-genome", help="reference bin_id (default: from analysis_metadata.tsv)")
    ap.add_argument("--out", help="default: <analysis-dir>/centromere_overlap.tsv")
    a = ap.parse_args(argv)

    adir = a.analysis_dir or os.path.join(a.run_dir, "analysis")
    out = a.out or os.path.join(adir, "centromere_overlap.tsv")
    nb_path = os.path.join(adir, "normalized_block_genome_table.tsv")
    if not os.path.isfile(nb_path):
        sys.exit(f"error: {nb_path} not found (run the interpreter phase first)")

    nb = pd.read_csv(nb_path, sep="\t")
    ref_genome = a.reference_genome
    if not ref_genome:
        meta = os.path.join(adir, "analysis_metadata.tsv")
        if os.path.isfile(meta):
            m = pd.read_csv(meta, sep="\t")
            for col in ("reference_genome", "reference", "reference_bin_id"):
                if col in m.columns and len(m):
                    ref_genome = str(m[col].iloc[0])
                    break
    if not ref_genome:
        print("warning: reference genome unknown (no --reference-genome, no analysis_metadata.tsv); "
              "fission gaps will be reported as 'na'", file=sys.stderr)

    # ---- load centromere bands per declared genome ---------------------------
    bands, src = {}, {}
    key2genome = {norm_key(g): g for g in nb["bin_id"].unique()}
    for spec in a.centromeres:
        if "=" not in spec:
            sys.exit(f"error: --centromeres expects GENOME=PATH, got {spec!r}")
        gkey, path = spec.split("=", 1)
        g = key2genome.get(norm_key(gkey))
        if g is None:
            sys.exit(f"error: --centromeres genome {gkey!r} not in normalized table "
                     f"(known: {sorted(set(nb['bin_id']))})")
        if not os.path.isfile(path):
            sys.exit(f"error: centromere file not found: {path}")
        bands[g] = read_centromeres(path)
        src[g] = os.path.basename(path)

    def band_test(genome, seq, lo, hi):
        if genome not in bands:
            return "na", 0
        return overlap(bands[genome], seq, lo, hi)

    rows = []

    # ---- fusion junctions (target frame) ------------------------------------
    tgt = nb[nb["bin_id"] != ref_genome] if ref_genome else nb
    for (g, s), d in tgt.groupby(["bin_id", "seq_id"], sort=False):
        d = d.sort_values("start")
        prev = None
        for r in d.itertuples():
            if prev is not None and prev.reference_seq_id != r.reference_seq_id:
                lo, hi = int(prev.end), int(r.start)
                res, bp = band_test(g, s, min(lo, hi), max(lo, hi))
                rows.append(dict(kind="fusion_junction", genome=g, seq=s, frame="target",
                                 detail=f"{prev.reference_seq_id}|{r.reference_seq_id}",
                                 gap_start=min(lo, hi), gap_end=max(lo, hi),
                                 gap_bp=max(0, hi - lo), centromere_overlap=res,
                                 centromere_source=src.get(g, "") if res != "na" else ""))
            prev = r

    # ---- fission gaps (reference frame) --------------------------------------
    others = nb[nb["bin_id"] != ref_genome] if ref_genome else nb.iloc[0:0]
    if ref_genome:
        for (g, refseq), d in others.groupby(["bin_id", "reference_seq_id"], sort=False):
            frags = []
            for t, dd in d.groupby("seq_id"):
                frags.append((t, int(dd.reference_start.min()), int(dd.reference_end.max())))
            if len(frags) < 2:
                continue
            frags.sort(key=lambda x: x[1])
            for (t1, _s1, e1), (t2, s2, _e2) in zip(frags, frags[1:]):
                lo, hi = e1, s2
                res, bp = band_test(ref_genome, refseq, min(lo, hi), max(lo, hi))
                rows.append(dict(kind="fission_gap", genome=g, seq=refseq, frame="reference",
                                 detail=f"{t1}|{t2}",
                                 gap_start=min(lo, hi), gap_end=max(lo, hi),
                                 gap_bp=max(0, hi - lo), centromere_overlap=res,
                                 centromere_source=src.get(ref_genome, "") if res != "na" else ""))

    out_df = pd.DataFrame(rows, columns=["kind", "genome", "seq", "frame", "detail",
                                         "gap_start", "gap_end", "gap_bp",
                                         "centromere_overlap", "centromere_source"])
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    out_df.to_csv(out, sep="\t", index=False)
    if len(out_df):
        print(out_df.groupby(["kind", "centromere_overlap"]).size().to_string())
    else:
        print("no fusion junctions or fission gaps found (nothing to check)")
    print(f"wrote {out} ({len(out_df)} rows)")


if __name__ == "__main__":
    main()
