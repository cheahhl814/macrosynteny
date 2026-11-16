#!/usr/bin/env python3
# plot_ribbons.py — static, genome-scale synteny ribbon figures for the macrosynteny skill.
#
# Provenance: adapted from a user-authored study script ("ribbons.py", Betta macrosynteny
# workspace) into a standalone CLI for this skill. The layout algorithm (per-row sequence
# packing, shared px/bp scale, bezier ribbons between adjacent rows, block merging,
# reference-chromosome colouring) is kept; everything study-specific (hardcoded paths,
# species-name munging, slide-theme CSS variables, exec()-based wiring) was removed.
# Added over the original: tidk telomere end-caps, centromere-candidate bands fed by the
# centromere-prediction skill, --self-check, standalone SVG with inline styles.
# License: GPL-3.0 (consistent with the skill's vendored-asset licensing).
"""Static SVG ribbon plots of ntSynt synteny blocks.

Each row is a genome; sequences are drawn as bars coloured by which *reference*
chromosome their blocks align to; shared blocks between adjacent rows are drawn as
ribbons (strand flip flips the ribbon). Complements the interactive FunMacroSynteny
HTML (exploratory, genome-wide) and ntSynt-viz's built-in ribbon plots (genome order,
optional tree) with a curated, reference-chromosome-centric static figure for reports
and slides — plus telomere end-caps (tidk `*_ends.ends.tsv`) and centromere-candidate
bands (centromere-prediction outputs).

Example
-------
  pixi run --manifest-path <skill-root>/pixi.toml python3 bin/ribbons/plot_ribbons.py \\
    --blocks output/ntSynt.synteny_blocks.tsv \\
    --fai genomes/a.fa.fai genomes/b.fa.fai genomes/c.fa.fai \\
    --refs NC_000001.1,NC_000002.1 --out output/ribbons.svg

  # with telomere caps and centromere candidates from centromere-prediction:
    ... --telomere-dir "$RUN_DIR/telomere" \\
    --centromeres b=$RUN_DIR/results/centromere/centromere_summary.tsv \\
    --centromeres c=$RUN_DIR/results/centromere/regions/candidate_regions.tsv

Input contracts
---------------
blocks TSV : 8 columns, no header (ntsynt default): id, genome, seq_id, start, end, strand, support, status.
FAIs       : one per genome, in DISPLAY order. The first FAI is the reference whose
             chromosomes --refs selects. FAI order is the row order (override with --rows).
--telomere-dir : tidk `tidk ends -o X` output dir; per genome G the tool looks for
             `<stem(G)>*_ends.ends.tsv` (tidk names them `<prefix>_ends.ends.tsv`).
             Enriched = status present|wrong_strand (see docs-corpus/telomere-qc).
--centromeres GENOME=PATH (repeatable) :
             TSV with scaffold/seq_id, start, end columns (header or headerless). For
             centromere-prediction outputs: centromere_summary.tsv (scaffold start end ...)
             or regions/candidate_regions.tsv (scaffold start end) — both accepted.
             GENOME matched against the blocks' genome column (or its file stem).
Coordinates : inter-tool conventions differ by <1 bp; bands are drawn as-is (0-based, half-open assumed).
"""

import argparse
import os
import sys
import xml.etree.ElementTree as ET

import pandas as pd

PALETTE = ["#0d9488", "#f59e0b", "#e5634d", "#16a34a", "#2c4a7c", "#7c3aed", "#92400e", "#475569"]
CEN_COLOR = "#7f1d1d"   # centromere-candidate band
TEL_COLOR = "#0f172a"   # telomere end cap
BAR_BASE = "#cbd5e1"    # unaligned bar body
BAR_EDGE = "#94a3b8"
TXT = "#0f172a"
MUTED = "#64748b"

BLOCK_COLS = ["id", "g", "s", "st", "en", "strand", "sup", "x"]


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def stem(name):
    """basename with .fai / .gz / .fa(fasta,fna,fna,ffn) extensions stripped."""
    b = os.path.basename(name)
    if b.endswith(".fai"):
        b = b[:-4]
    low = b.lower()
    if low.endswith(".gz"):
        b = b[:-3]
        low = b.lower()
    for ext in (".fasta", ".fna", ".ffn", ".fa"):
        if low.endswith(ext):
            return b[: -len(ext)]
    return b


def norm_key(s):
    return stem(str(s)).lower()


def read_fai(path):
    fai = {}
    with open(path) as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) >= 2:
                fai[p[0]] = int(p[1])
    if not fai:
        sys.exit(f"error: empty FAI {path}")
    return fai


def match_telomere(telomere_dir, stem_key):
    if not telomere_dir or not os.path.isdir(telomere_dir):
        return None
    cands = [f for f in os.listdir(telomere_dir)
             if f.startswith(stem_key) and f.endswith("_ends.ends.tsv")]
    if not cands:  # fall back to any *_ends.ends.tsv mentioning the key (loose match)
        cands = [f for f in os.listdir(telomere_dir)
                 if f.endswith("_ends.ends.tsv") and stem_key in f.lower()]
    if not cands:
        return None
    cands.sort(key=len)
    return os.path.join(telomere_dir, cands[0])


def read_telomere_ends(path):
    """-> set of (seq_id, side) with enriched telomere, side in {'start','end'}."""
    enriched = set()
    with open(path) as fh:
        rows = [l.rstrip("\n").split("\t") for l in fh if l.strip()]
    if rows and rows[0][0].lower() == "id":
        rows = rows[1:]
    for r in rows:
        if len(r) < 4:
            continue
        seq, side, status = r[0], r[2].lower(), r[3].lower()
        if status in ("present", "wrong_strand") and side in ("start", "end"):
            enriched.add((seq, side))
    return enriched


def read_centromeres(path):
    """Header-tolerant reader: returns list of (seq, start, end) ints."""
    with open(path) as fh:
        rows = [l.rstrip("\n").split("\t") for l in fh if l.strip()]
    if not rows:
        return []
    hdr = [c.strip().lower() for c in rows[0]]
    def col(names):
        for n in names:
            if n in hdr:
                return hdr.index(n)
        return None
    def is_int(s):
        try:
            int(s); return True
        except ValueError:
            return False
    seq_c = col(["scaffold", "seq_id", "seq", "contig", "chr", "chrom", "sequence"])
    st_c = col(["start", "start_pos", "begin"])
    en_c = col(["end", "end_pos", "stop"])
    body = rows
    if seq_c is None:  # headerless 3-col: scaffold start end
        if len(rows[0]) >= 3 and is_int(rows[0][1]) and is_int(rows[0][2]):
            seq_c, st_c, en_c = 0, 1, 2
        else:
            sys.exit(f"error: cannot locate scaffold/start/end columns in {path}")
    elif st_c is None or en_c is None:
        int_cols = [i for i, c in enumerate(hdr) if i != seq_c and all(is_int(r[i]) for r in rows[1:])]
        if len(int_cols) >= 2:
            # prefer column order start,end after the scaffold column
            int_cols.sort()
            st_c, en_c = int_cols[0], int_cols[1]
        else:
            sys.exit(f"error: cannot locate start/end columns in {path}")
    if rows[0] and not is_int(rows[0][st_c]):
        body = rows[1:]
    out = []
    for r in body:
        try:
            out.append((r[seq_c], int(r[st_c]), int(r[en_c])))
        except (ValueError, IndexError):
            continue
    return out


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--blocks", required=True, help="ntSynt synteny_blocks.tsv (8 cols, no header)")
    p.add_argument("--fai", required=True, nargs="+", help="FAI per genome, in display order; first = reference")
    p.add_argument("--refs", required=True, help="reference sequence ids to show, comma-separated (order = legend order)")
    p.add_argument("--rows", help="comma-separated subset/order of genomes (default: --fai order)")
    p.add_argument("--labels", help="two-column TSV: genome name<TAB>display label")
    p.add_argument("--ref-label", action="append", default=[], metavar="REF=LABEL",
                   help="rename a reference in the legend (repeatable)")
    p.add_argument("--min-mb", type=float, default=1.0, help="minimum per-sequence block span to draw [1.0]")
    p.add_argument("--merge-kb", type=float, default=400, help="merge same-reference spans separated by < this [400]")
    p.add_argument("--max-width", type=float, default=620, help="max bar-row width in px [620]")
    p.add_argument("--gap", type=float, default=12, help="gap between sequences in a row, px [12]")
    p.add_argument("--bar-height", type=float, default=15)
    p.add_argument("--telomere-dir", help="dir with tidk tidk-ends output (<stem>*_ends.ends.tsv)")
    p.add_argument("--centromeres", action="append", default=[], metavar="GENOME=TSV",
                   help="centromere candidates for one genome (repeatable); "
                        "accepts centromere-prediction's centromere_summary.tsv / candidate_regions.tsv / satellite_main_blocks.tsv")
    p.add_argument("--title", help="optional figure title")
    p.add_argument("--out", default="ribbon.svg")
    p.add_argument("--self-check", action="store_true", help="verify bar widths and ribbon anchors after layout; nonzero exit on mismatch")
    return p.parse_args(argv)


def main(argv=None):
    a = parse_args(argv)

    refs = [r.strip() for r in a.refs.split(",") if r.strip()]
    if not refs:
        sys.exit("error: --refs must list at least one reference sequence")

    # ---- genomes: fai order, display order, name resolution ------------------
    genome_fai = {os.path.basename(f): f for f in a.fai}
    gstem = {f: stem(f) for f in a.fai}                     # fai path -> display stem
    blocks = pd.read_csv(a.blocks, sep="\t", header=None, names=BLOCK_COLS,
                         usecols=list(range(8)), dtype={"st": "int64", "en": "int64", "strand": "str"})
    bad = int((blocks["st"] >= blocks["en"]).sum())
    if bad:
        print(f"warning: dropped {bad} block rows with start >= end", file=sys.stderr)
        blocks = blocks[blocks["st"] < blocks["en"]]
    # resolve each distinct blocks-'g' value to one of our genomes
    key_to_fai = {}
    for f in a.fai:
        for k in {f, os.path.basename(f), gstem[f], norm_key(f)}:
            key_to_fai.setdefault(k, f)
    g_map = {}
    for g in blocks["g"].astype(str).unique():
        f = key_to_fai.get(g) or key_to_fai.get(os.path.basename(g)) or key_to_fai.get(norm_key(g))
        if f is None:
            sys.exit(f"error: blocks genome {g!r} matches none of the --fai files "
                     f"(known stems: {sorted(set(gstem.values()))})")
        g_map[g] = f
    blocks["row"] = blocks["g"].map(lambda g: gstem[g_map[g]])

    fai_lens = {gstem[f]: read_fai(f) for f in a.fai}
    order = [gstem[f] for f in a.fai]
    reference = order[0]  # first --fai defines the reference, regardless of --rows display order
    if a.rows:
        want = [r.strip() for r in a.rows.split(",") if r.strip()]
        bad = [r for r in want if r not in fai_lens]
        if bad:
            sys.exit(f"error: --rows {bad} not among --fai genomes {order}")
        if reference not in want:
            print(f"note: --rows excludes the reference ({reference}); ribbons are reference-anchored, "
                  f"but the reference row will not be drawn", file=sys.stderr)
        order = want
    ref_fai_path = next(f for f in a.fai if gstem[f] == reference)
    ref_seqs = set(read_fai(ref_fai_path))
    missing_refs = [r for r in refs if r not in ref_seqs]
    if missing_refs:
        sys.exit(f"error: --refs {missing_refs} not found in reference FASTA index ({reference}); "
                 f"first seqs: {list(ref_seqs)[:10]}")

    ref_idx = {r: i for i, r in enumerate(refs)}
    ref_of_block = blocks[blocks["row"] == reference].set_index("id")["s"].to_dict()
    blocks = blocks[blocks["id"].isin(ref_of_block)].copy()
    blocks["rs"] = blocks["id"].map(ref_of_block)
    blocks = blocks[blocks["rs"].isin(refs)]
    blocks["span"] = blocks["en"] - blocks["st"]

    # ---- per-row layout ------------------------------------------------------
    min_span = a.min_mb * 1e6
    rows = []
    for g in order:
        sub = blocks[blocks["row"] == g]
        fai = fai_lens[g]
        keep = []
        for s, d in sub.groupby("s"):
            tot = d["span"].sum()
            if tot < min_span or s not in fai:
                continue
            dom = d.groupby("rs")["span"].sum().idxmax()
            dref = d[d["rs"] == dom]
            keep.append((ref_idx[dom], float(dref["st"].mean()), s, fai[s]))
        if not keep:
            print(f"warning: no reference-aligned sequences kept for {g} (dropped from figure)",
                  file=sys.stderr)
            continue
        keep.sort(key=lambda t: (t[0], t[1], t[2]))
        rows.append({"genome": g, "seqs": [(s, ln) for _, _, s, ln in keep]})
    if len(rows) < 2:
        sys.exit("error: fewer than 2 genomes have reference-aligned sequences to draw")

    ML, GAP, BH = 118, a.gap, a.bar_height
    sc = min((a.max_width - (len(r["seqs"]) - 1) * GAP) / sum(l for _, l in r["seqs"]) for r in rows)
    n = len(rows)
    step = min(96.0, max(30.0, (450 - 78 - 46) / max(n - 1, 1)))
    top, footer = 78, 46
    H = int(top + (n - 1) * step + BH + footer)
    W = int(ML + a.max_width + 30)

    for r in rows:
        x = float(ML)
        off = {}
        for s, ln in r["seqs"]:
            off[s] = x
            x += ln * sc + GAP
        r["xoff"] = off
    ypos = {r["genome"]: top + i * step for i, r in enumerate(rows)}

    # ---- labels --------------------------------------------------------------
    labels, ref_labels = {}, {}
    if a.labels:
        with open(a.labels) as fh:
            for line in fh:
                p = line.rstrip("\n").split("\t")
                if len(p) >= 2 and p[0]:
                    labels[norm_key(p[0])] = p[1]
    for item in a.ref_label:
        k, _, v = item.partition("=")
        if not v:
            sys.exit(f"error: --ref-label expects CHROM=LABEL, got {item!r}")
        ref_labels[k] = v

    # ---- telomeres + centromeres --------------------------------------------
    tel = {}
    for r in rows:
        p = match_telomere(a.telomere_dir, norm_key(r["genome"])) if a.telomere_dir else None
        if p:
            tel[r["genome"]] = read_telomere_ends(p)
        elif a.telomere_dir:
            print(f"warning: no tidk *_ends.ends.tsv found for {r['genome']} in {a.telomere_dir}", file=sys.stderr)
    cent = {r["genome"]: {} for r in rows}  # genome -> seq -> [(start, end)]
    cent_src = []
    for spec in a.centromeres:
        if "=" not in spec:
            sys.exit(f"error: --centromeres expects GENOME=PATH, got {spec!r}")
        gkey, path = spec.split("=", 1)
        hit = [r["genome"] for r in rows
               if r["genome"] == gkey or norm_key(gkey) == norm_key(r["genome"])]
        if not hit:
            sys.exit(f"error: --centromeres genome {gkey!r} not among displayed genomes "
                     f"({[r['genome'] for r in rows]})")
        if not os.path.isfile(path):
            sys.exit(f"error: centromeres file not found: {path}")
        for seq, st_, en_ in read_centromeres(path):
            cent[hit[0]].setdefault(seq, []).append((st_, en_))
        cent_src.append(os.path.basename(path))

    # ---- SVG ------------------------------------------------------------------
    P = []  # parts
    P.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" '
             f'aria-label="synteny ribbon plot"><title>synteny ribbon plot</title>')
    P.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#ffffff"/>')
    P.append('<style>text{font-family:Helvetica,Arial,sans-serif;fill:%s}</style>' % TXT)
    legend_y = 12
    if a.title:
        P.append(f'<text x="{W/2:.0f}" y="20" text-anchor="middle" font-size="15" font-weight="700">{esc(a.title)}</text>')
        legend_y = 34

    lx = 14
    for i, r in enumerate(refs):
        lab = ref_labels.get(r, r)
        P.append(f'<rect x="{lx}" y="12" width="16" height="12" rx="2" fill="{PALETTE[i % len(PALETTE)]}" fill-opacity="0.85"/>')
        P.append(f'<text x="{lx + 21}" y="22" font-size="12" font-weight="600">{esc(lab)}</text>')
        lx += 30 + 7.2 * len(lab) + 14
    if tel:
        P.append(f'<rect x="{lx}" y="{legend_y - 1}" width="5" height="14" fill="{TEL_COLOR}"/>')
        P.append(f'<text x="{lx + 10}" y="{legend_y + 10}" font-size="12" fill="{MUTED}">telomere end</text>')
        lx += 130
    if any(cent.values()):
        P.append(f'<rect x="{lx}" y="{legend_y}" width="16" height="12" fill="{CEN_COLOR}" fill-opacity="0.55"/>')
        P.append(f'<text x="{lx + 21}" y="{legend_y + 10}" font-size="12" fill="{MUTED}">centromere candidate</text>')

    ribbons, bars = [], []
    block_index = blocks.set_index("id")
    for ri, row in enumerate(rows):
        g = row["genome"]
        y = ypos[g]
        P.append(f'<text x="{ML - 10}" y="{y + BH - 2:.1f}" text-anchor="end" font-size="13" font-weight="600">{esc(labels.get(norm_key(g), g))}</text>')
        sub = blocks[blocks["row"] == g]
        for s, ln in row["seqs"]:
            x0 = row["xoff"][s]
            w = ln * sc
            bars.append(f'<rect x="{x0:.1f}" y="{y:.1f}" width="{w:.1f}" height="{BH}" rx="3" '
                        f'fill="{BAR_BASE}" stroke="{BAR_EDGE}" stroke-width="1"/>')
            d = sub[sub["s"] == s].sort_values("st")
            cur = None  # [ref_idx, seg_start, seg_end]
            for r_ in d.itertuples():
                ri2 = ref_idx.get(r_.rs)
                if cur and cur[0] == ri2 and r_.st - cur[2] <= a.merge_kb * 1000:
                    cur[2] = r_.en
                    continue
                if cur:
                    bars.append(_seg(cur, x0, y, sc, BH))
                cur = [ri2, r_.st, r_.en] if ri2 is not None else None
            if cur:
                bars.append(_seg(cur, x0, y, sc, BH))
            # telomere caps
            for side, xx in (("start", x0 - 1), ("end", x0 + w - 4)):
                if (s, side) in tel.get(g, set()):
                    bars.append(f'<rect x="{xx:.1f}" y="{y - 3:.1f}" width="5" height="{BH + 6}" fill="{TEL_COLOR}"/>')
            # centromere candidates
            for cstart, cend in cent.get(g, {}).get(s, []):
                if cend < 0 or cstart > ln:
                    continue
                cx0 = x0 + max(cstart, 0) * sc
                cw = max((min(cend, ln) - max(cstart, 0)) * sc, 1.5)
                bars.append(f'<rect x="{cx0:.1f}" y="{y:.1f}" width="{cw:.1f}" height="{BH}" '
                            f'fill="{CEN_COLOR}" fill-opacity="0.55" stroke="#450a0a" stroke-width="0.6"/>')
            if w > 34:
                bars.append(f'<text x="{x0 + w / 2:.1f}" y="{y + BH + 13:.1f}" text-anchor="middle" '
                            f'font-size="11" fill="{MUTED}">{esc(s)}</text>')
    # ribbons between adjacent rows
    for i in range(len(rows) - 1):
        ra, rc = rows[i], rows[i + 1]
        da = blocks[blocks["row"] == ra["genome"]].set_index("id")
        dc = blocks[blocks["row"] == rc["genome"]].set_index("id")
        ya, yc = ypos[ra["genome"]] + BH, ypos[rc["genome"]]
        ym = (ya + yc) / 2
        for bid in da.index.intersection(dc.index):
            ra_ = da.loc[bid]; rc_ = dc.loc[bid]
            if ra_.s not in ra["xoff"] or rc_.s not in rc["xoff"]:
                continue
            a0 = ra["xoff"][ra_.s] + ra_.st * sc
            a1 = ra["xoff"][ra_.s] + ra_.en * sc
            c0 = rc["xoff"][rc_.s] + rc_.st * sc
            c1 = rc["xoff"][rc_.s] + rc_.en * sc
            if ra_.strand != rc_.strand:
                c0, c1 = c1, c0
            col = PALETTE[ref_idx[ra_.rs] % len(PALETTE)]
            ribbons.append(
                f'<path d="M{a0:.1f} {ya:.1f} C{a0:.1f} {ym:.1f} {c0:.1f} {ym:.1f} {c0:.1f} {yc:.1f} '
                f'L{c1:.1f} {yc:.1f} C{c1:.1f} {ym:.1f} {a1:.1f} {ym:.1f} {a1:.1f} {ya:.1f} Z" '
                f'fill="{col}" fill-opacity="0.45"/>')

    P.extend(ribbons)
    P.extend(bars)
    foot = (f"Shared blocks only; reference-aligned spans &lt; {a.min_mb:g} Mb omitted; "
            f"same-reference spans &lt; {a.merge_kb:g} kb merged")
    if cent_src:
        foot += f"; centromere candidates: {esc(', '.join(sorted(set(cent_src))))}"
    P.append(f'<text x="14" y="{H - 12}" font-size="11" fill="{MUTED}">{foot}</text>')
    P.append("</svg>")
    svg = "\n".join(P)

    if a.self_check:
        errs = []
        fresh = {r["genome"]: read_fai(f) for r, f in
                 ((r, f) for r in rows for f in a.fai if stem(f) == r["genome"])}
        for r in rows:
            x = float(ML)
            for s, ln in r["seqs"]:
                if fresh[r["genome"]].get(s) != ln:
                    errs.append(f"length mismatch {r['genome']}:{s}: fai {fresh[r['genome']].get(s)} != layout {ln}")
                if abs(r["xoff"][s] - x) > 0.01:
                    errs.append(f"bar offset drift on {r['genome']}:{s}: {r['xoff'][s]:.2f} != {x:.2f}")
                x += ln * sc + a.gap
        try:
            root = ET.fromstring(svg)
            n_rect = len(root.findall(".//{http://www.w3.org/2000/svg}rect"))
            if n_rect == 0:
                errs.append("no rect elements in SVG")
        except ET.ParseError as e:
            errs.append(f"SVG failed to parse: {e}")
        if errs:
            sys.exit("self-check FAILED:\n  " + "\n  ".join(errs))
        print(f"self-check OK: {sum(len(r['seqs']) for r in rows)} bars, "
              f"{len(ribbons)} ribbons, {len(rows)} rows, scale {sc:.3e} px/bp", file=sys.stderr)

    with open(a.out, "w") as fh:
        fh.write(svg)
    print(f"wrote {a.out} ({len(rows)} genomes, {len(ribbons)} ribbons, scale {sc:.3e} px/bp)", file=sys.stderr)


def _seg(cur, x0, y, sc, bh):
    ri, st, en = cur
    return (f'<rect x="{x0 + st * sc:.1f}" y="{y:.1f}" width="{max((en - st) * sc, 0.8):.1f}" '
            f'height="{bh}" fill="{PALETTE[ri % len(PALETTE)]}" fill-opacity="0.85"/>')


if __name__ == "__main__":
    main()
