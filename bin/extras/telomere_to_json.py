# telomere_to_json.py — vendored into the macrosynteny skill (v1.2.0)
# Provenance: user-authored helper summarizing tidkFind per-window telomeric-repeat TSV data
# (tidk) into per-scaffold telomere-signal JSON. Copied verbatim; header block added. GPL-3.0.
#!/usr/bin/env python3
import csv
import json
import sys
from pathlib import Path
from collections import defaultdict

TELOMERE_THRESHOLD = 100


def compute_scaffold_summary(rows, threshold=TELOMERE_THRESHOLD):
    windows = sorted(rows, key=lambda r: int(r["window"]))
    fwd_vals = [int(r["forward_repeat_number"]) for r in windows]
    rev_vals = [int(r["reverse_repeat_number"]) for r in windows]
    tot_vals = [f + r for f, r in zip(fwd_vals, rev_vals)]
    window_positions = [int(r["window"]) for r in windows]

    scaffold_id = windows[0]["id"]
    repeat_seq = windows[0]["telomeric_repeat"]

    scaffold_length = max(window_positions) if window_positions else 0
    num_windows = len(windows)

    if num_windows >= 2:
        diffs = [window_positions[i+1] - window_positions[i] for i in range(len(window_positions)-1)]
        window_size = sorted(diffs)[len(diffs)//2]
    else:
        window_size = scaffold_length if scaffold_length > 0 else 0

    first_n = min(10, num_windows)
    last_n = min(10, num_windows)

    start_max_total = max(tot_vals[:first_n]) if tot_vals[:first_n] else 0
    end_max_total = max(tot_vals[-last_n:]) if tot_vals[-last_n:] else 0

    telomere_detected = start_max_total >= threshold or end_max_total >= threshold

    return {
        "scaffold_id": scaffold_id,
        "scaffold_length_bp": scaffold_length,
        "window_size_bp": window_size,
        "num_windows": num_windows,
        "telomeric_repeat": repeat_seq,
        "telomere_signal": {
            "detected": telomere_detected,
            "threshold_used": threshold,
            "start_region": {
                "windows_checked": first_n,
                "max_total": start_max_total,
                "enriched": start_max_total >= threshold
            },
            "end_region": {
                "windows_checked": last_n,
                "max_total": end_max_total,
                "enriched": end_max_total >= threshold
            }
        }
    }


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <input.tsv>", file=sys.stderr)
        sys.exit(1)

    input_tsv = Path(sys.argv[1])
    if not input_tsv.exists():
        print(f"Error: {input_tsv} not found", file=sys.stderr)
        sys.exit(1)

    output_json = input_tsv.with_name(input_tsv.stem + "_summary.json")

    groups = defaultdict(list)
    with open(input_tsv) as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            groups[row["id"]].append(row)

    summaries = [compute_scaffold_summary(rows) for rows in groups.values()]
    summaries.sort(key=lambda s: s["scaffold_length_bp"], reverse=True)

    output = {
        "metadata": {
            "source_file": input_tsv.name,
            "num_scaffolds": len(summaries),
            "telomere_threshold": TELOMERE_THRESHOLD,
            "description": "Per-scaffold telomeric repeat summary from tidkFind output. "
                           "Telomere signal is flagged when any of the first/last 10 windows "
                           "have total repeats >= threshold (default 100)."
        },
        "scaffolds": summaries
    }

    with open(output_json, "w") as f:
        json.dump(output, f, indent=2)

    telomere_count = sum(1 for s in summaries if s["telomere_signal"]["detected"])
    print(f"Wrote {output_json}")
    print(f"  Scaffolds: {len(summaries)}, with telomere signal: {telomere_count}")


if __name__ == "__main__":
    main()
