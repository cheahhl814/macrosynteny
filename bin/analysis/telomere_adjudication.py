#!/usr/bin/env python3
# telomere_adjudication.py — telomere-based verdicts for fusion/fission candidates.
#
# Provenance: adapted from a user-authored study script ("telomere_adjudication.py",
# Betta macrosynteny workspace). Study-specific hardcoding (absolute telomere dir,
# '<Genome>_genome.fna' name munging) was replaced by --run-dir/--telomere-dir and a
# generic stem-matching rule; logic and verdict thresholds are unchanged.
# License: GPL-3.0 (consistent with the skill's vendored-asset licensing).
"""Adjudicate candidate fusions/fissions with telomere evidence.

Biology: a real fusion/fission preserves telomere coherence (telomeres at the true
ends; none at the junction). A fragmentation artifact breaks at non-telomeric
assembly breaks. Sequences with no assessable terminal signal are inconclusive.

Reads (all inside the run dir by default):
  <analysis-dir>/normalized_block_genome_table.tsv   (from bin/analysis/analyze_macrosynteny.py)
  <analysis-dir>/candidate_fusions.tsv               (same)
  <analysis-dir>/candidate_fissions.tsv              (same)
  <telomere-dir>/<stem>*_ends.ends.tsv               (tidk ends, per genome; stem = FASTA name minus extensions)
  <telomere-dir>/<stem>*telomeric_repeat_windows.tsv (tidk search, per genome)

Writes:
  <analysis-dir>/telomere_adjudication.tsv
  Columns: candidate_table, candidate_id, target_or_reference, telomere_verdict, evidence
  verdicts: real | fragmentation | inconclusive

Genomes without telomere files are reported as inconclusive (per the skill contract:
missing evidence must never be scored as real/fragmentation).
"""

import argparse
import glob
import os
import sys

import pandas as pd

MIN_SEQ_LEN_DEFAULT = 50_000       # shorter contigs carry no assessable terminal signal
JUNCTION_MAX_REPEATS_DEFAULT = 100 # max telomeric repeats inside a junction gap to call it clean


def stem(name: str) -> str:
    b = os.path.basename(name)
    for ext in (".fai",):
        if b.endswith(ext):
            b = b[: -len(ext)]
    if b.lower().endswith(".gz"):
        b = b[:-3]
    for ext in (".fasta", ".fna", ".ffn", ".fa"):
        if b.lower().endswith(ext):
            return b[: -len(ext)]
    return b


def find_telomere_file(telomere_dir: str, genome: str, pattern: str):
    s = stem(genome)
    cands = glob.glob(os.path.join(telomere_dir, f"{s}*{pattern}")) + \
            glob.glob(os.path.join(telomere_dir, f"{s.lower()}*{pattern}"))
    if not cands:
        return None
    return sorted(set(cands), key=len)[0]


def load_genome(genome: str, telomere_dir: str):
    """-> (ends: dict[(seq, side)] -> status-enriched bool|None, windows: DataFrame|None)"""
    ends_f = find_telomere_file(telomere_dir, genome, "_ends.ends.tsv")
    win_f = find_telomere_file(telomere_dir, genome, "telomeric_repeat_windows.tsv")
    if not ends_f:
        return None, None, f"missing tidk ends file for {genome} in {telomere_dir}"
    e = pd.read_csv(ends_f, sep="\t")
    ends = {(r.id, r.side): r.status in ("present", "wrong_strand") for r in e.itertuples()}
    win = None
    if win_f:
        w = pd.read_csv(win_f, sep="\t")
        w["n"] = w["forward_repeat_number"] + w["reverse_repeat_number"]
        win = {k: v for k, v in w.groupby("id")}
    return ends, win, None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run-dir", default=os.environ.get("RUN_DIR", "."), help="analysis run root [RUN_DIR env or .]")
    ap.add_argument("--analysis-dir", help="default: <run-dir>/analysis")
    ap.add_argument("--telomere-dir", help="default: <run-dir>/telomere")
    ap.add_argument("--min-len", type=int, default=MIN_SEQ_LEN_DEFAULT,
                    help=f"sequences shorter than this are inconclusive [{MIN_SEQ_LEN_DEFAULT}]")
    ap.add_argument("--junction-max", type=int, default=JUNCTION_MAX_REPEATS_DEFAULT,
                    help=f"max telomeric repeats inside a junction gap to call it clean [{JUNCTION_MAX_REPEATS_DEFAULT}]")
    ap.add_argument("--out", help="default: <analysis-dir>/telomere_adjudication.tsv")
    a = ap.parse_args(argv)

    adir = a.analysis_dir or os.path.join(a.run_dir, "analysis")
    tdir = a.telomere_dir or os.path.join(a.run_dir, "telomere")
    out = a.out or os.path.join(adir, "telomere_adjudication.tsv")

    nb_path = os.path.join(adir, "normalized_block_genome_table.tsv")
    fus_path = os.path.join(adir, "candidate_fusions.tsv")
    fis_path = os.path.join(adir, "candidate_fissions.tsv")
    for p in (nb_path, fus_path, fis_path):
        if not os.path.isfile(p):
            sys.exit(f"error: required input missing: {p} (run the interpreter phase first)")

    nb = pd.read_csv(nb_path, sep="\t")
    fus = pd.read_csv(fus_path, sep="\t")
    fis = pd.read_csv(fis_path, sep="\t")

    slen = nb.drop_duplicates(["bin_id", "seq_id"]).set_index(["bin_id", "seq_id"])["sequence_length_bp"]

    genomes = list(nb["bin_id"].unique())
    telomere, problems = {}, {}
    for g in genomes:
        ends, win, err = load_genome(g, tdir)
        telomere[g] = (ends, win)
        if err:
            problems[g] = err

    def jcount(g, seq, lo, hi):
        """max per-window repeat count inside the (lo, hi) gap of seq; 0 if no data."""
        w = telomere[g][1].get(seq) if telomere[g][1] else None
        if w is None or hi <= lo:
            return 0
        m = w[(w.window > lo) & (w.window - 10000 < hi)]
        return int(m["n"].max()) if len(m) else 0

    def enriched(g, seq, side):
        ends = telomere[g][0]
        return ends is not None and ends.get((seq, side), False)

    rows = []

    # ---- fusions: a target sequence carries >=2 reference chromosomes ----------
    for (g, s), df in fus.groupby(["target_genome", "target_seq_id"]):
        if g in problems:
            rows.append(("candidate_fusions", f"{g}|{s}", s, "inconclusive", problems[g]))
            continue
        L = int(slen.get((g, s), 0))
        b = (nb[(nb.bin_id == g) & (nb.seq_id == s) & nb.reference_seq_id.isin(df.reference_seq_id)]
             .sort_values("start"))
        win_ok = telomere[g][1] is not None
        jm, jtxt, prev = 0, [], None
        for r in b.itertuples():
            if prev is not None and prev.reference_seq_id != r.reference_seq_id:
                c = jcount(g, s, prev.end, r.start)
                jm = max(jm, c)
                jtxt.append(f"{prev.end}-{r.start}:max{c}")
            prev = r
        st, en = enriched(g, s, "start"), enriched(g, s, "end")
        if L < a.min_len:
            v = "inconclusive"
        elif st and en:
            v = ("real" if jm < a.junction_max else "inconclusive") if win_ok else "inconclusive"
        else:
            v = "fragmentation"
        rows.append(("candidate_fusions", f"{g}|{s}", s, v,
                     f"start_enriched={st};end_enriched={en};junction_max_repeats={jm if win_ok else 'n/a'} [{';'.join(jtxt)}]{';junction_evidence=MISSING' if not win_ok else ''}"))

    # ---- fissions: a reference chromosome split across target sequences --------
    for (g, ref), df in fis.groupby(["target_genome", "reference_seq_id"]):
        if g in problems:
            for t in df.target_seq_id:
                rows.append(("candidate_fissions", f"{g}|{ref}", t, "inconclusive", problems[g]))
            continue
        frags = []
        for t in df.target_seq_id:
            b = nb[(nb.bin_id == g) & (nb.seq_id == t) & (nb.reference_seq_id == ref)]
            fwd = (b.span_bp * (b.orientation_to_reference == "+")).sum()
            rev = (b.span_bp * (b.orientation_to_reference == "-")).sum()
            ori = "+" if fwd >= rev else "-"
            frags.append((t, float(b.reference_start.mean()), ori, int(slen.get((g, t), 0))))
        frags.sort(key=lambda x: x[1])
        for i, (t, _pos, ori, L) in enumerate(frags):
            sides = []
            if i < len(frags) - 1:                      # ref-high side faces the next (downstream) fragment
                sides.append("end" if ori == "+" else "start")
            if i > 0:                                   # ref-low side faces the previous fragment
                sides.append("start" if ori == "+" else "end")
            ev = {x: enriched(g, t, x) for x in sides}
            if not sides:
                v = "inconclusive"  # single-fragment group: nothing to test (not a valid fission candidate)
            elif L < a.min_len:
                v = "inconclusive"
            elif all(ev.values()):
                v = "real"
            elif not any(ev.values()):
                v = "fragmentation"
            else:
                v = "inconclusive"
            rows.append(("candidate_fissions", f"{g}|{ref}", t, v, f"boundary_sides_enriched={ev}"))

    out_df = pd.DataFrame(rows, columns=["candidate_table", "candidate_id", "target_or_reference",
                                         "telomere_verdict", "evidence"])
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    out_df.to_csv(out, sep="\t", index=False)
    print(out_df.groupby(["candidate_table", "telomere_verdict"]).size().to_string())
    print(f"wrote {out} ({len(out_df)} rows)")
    if problems:
        print(f"warning: telomere evidence missing for {sorted(problems)} — see rows marked inconclusive",
              file=sys.stderr)


if __name__ == "__main__":
    main()
