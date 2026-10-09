# tidk ends — output formats + semantics (canary-verified 2026-10-09, tidk 0.3.0)

Invocation: `tidk ends -s <motif> -o <prefix> -d <dir> <FASTA>`; writes `<prefix>.ends.tsv`, `.ends.bed`, `.ends.json`.

ends.tsv columns: `id, sequence_length, side, status, telomere_start, telomere_end, telomere_length, offset, strand, window_limited`.
- `side` = start|end; `status` = present | absent | wrong_strand; `strand` = G-rich | C-rich.
- **wrong_strand = telomere PRESENT** on the reverse-complement strand (inverted end / misjoin hint). The JSON lists them under `wrong_strand: [{id, offset, side}]` (offset = bases from the sequence end the tract was found, up to `max_offset`).

ends.json counters: `sequences, t2t (both ends), one_end, no_ends, not_terminal[], t2t_ids[], error_tolerant, max_offset, min_length, window, unit, tidk_version` — cite `t2t/one_end/no_ends` per assembly in the qc report.

Adjudication usage (see `analysis/macrosynteny-interpret` §3): fusion candidates need both outer ends in {present, wrong_strand} and a telomere-clean junction; fission candidates need telomere-enriched ends AT the split boundary. `absent` at a candidate boundary = fragmentation artifact.
