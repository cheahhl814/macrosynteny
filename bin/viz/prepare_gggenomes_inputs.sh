#!/bin/bash
# prepare_gggenomes_inputs.sh — produce FunMacroSynteny/gggenomes-ready inputs
# from an ntSynt synteny_blocks.tsv, using the vendored upstream scripts
# (BirolLab/ntSynt, GPL-3) plus a python mlr shim (miller clashed with ntsynt).
#
# Usage: prepare_gggenomes_inputs.sh <synteny_blocks.tsv> <prefix> <length_threshold> \
#            <assembly_for_colour> <FAI> [<FAI> ...]
# FAI order defines genome order in the output.
set -euo pipefail

if [ $# -lt 6 ]; then
    echo "Usage: $(basename $0) <synteny blocks TSV> <prefix> <length threshold> <assembly to use for colour> <FAI> [<FAI> ...]"
    echo "NOTE: The order of FAI files will dictate the order of the genomes in the output."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

synteny_tsv=$1; shift
prefix=$1; shift
length_threshold=$1; shift
target_colour=$1; shift
fais="$@"

"${SCRIPT_DIR}/sort_ntsynt_blocks.py" --synteny_blocks "${synteny_tsv}" --sort_order ${fais} --fais > "${prefix}.synteny_blocks.sorted.tsv"

"${SCRIPT_DIR}/format_blocks_gggenomes.py" --fai ${fais} --prefix "${prefix}" --blocks "${prefix}.synteny_blocks.sorted.tsv" \
    --length "${length_threshold}" --colour "${target_colour}"

python3 "${SCRIPT_DIR}/sort_links_mlr_compat.py" "${prefix}.links.tsv"

echo "Wrote ${prefix}.links.tsv and ${prefix}.sequence_lengths.tsv (and ${prefix}.synteny_blocks.sorted.tsv)"