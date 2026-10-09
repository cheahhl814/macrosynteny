# Interpreter contract (analyze_macrosynteny.py)

Vendored from the user's Betta splendens-group macrosynteny workspace (ntSynt → ntSynt-viz → interpretation), verbatim. 989 lines, pandas-only, exits non-zero on contract violation.

## Inputs (4 required + 1 optional)

1. `<prefix>.links.tsv` — gggenomes-ordered ntSynt/ntSynt-viz links (block_id, seq_id, bin_id, start, end, seq_id2, bin_id2, start2, end2, strand[, colour_block]). Column order IS seq_id before bin_id (gggenomes form — NOT the FunMacroSynteny order).
2. `<prefix>.chrom-paint-feats.tsv` — ntSynt-viz output; columns block_id, seq_id, bin_id, start, end, colour_block.
3. `<prefix>.sequence_lengths.sorted.tsv` — columns bin_id, seq_id, length, relative_orientation.
4. `<prefix>.synteny_blocks.tsv` — raw ntSynt 8-column blocks (headerless read with synthetic names; columns block_id, bin_id, seq_id, start, end, strand, support_n, block_status).
5. Optional: `<prefix>.synteny_blocks.pre-collinear-merge` — enables pre-merge comparison.

## Constraints

- Genome order read from links.tsv as a simple linear chain (each genome ≤1 predecessor/successor; start = genome never in bin_id2).
- Reference genome = chain start; all fates/candidates are relative to it.
- Duplication guard: exactly one row per (block, genome) after de-duplication, else fail().
- block_status vocabulary: None, ori_change, id_change, inconsistent_order, indel (unexpected values warn + include).

## Thresholds (CLI)

--fusion-min-span-bp (default 1e6), --fusion-min-fraction (0.10), --translocation-min-span-bp (5e5).

## Outputs (20 tables to --output-dir)

analysis_metadata, block_completeness, candidate_fissions, candidate_fusions, candidate_inversions, candidate_translocations, candidate_translocation_switches, fission_architecture, fusion_architecture, indel_missingness_summary, normalized_block_genome_table, orientation_patterns_by_block, orientation_summary, per_species_block_span_summary, rearrangement_profile, rearrangement_summary, reference_chromosome_fate, reference_to_target_correspondence(.long), synteny_block_status_table, target_contig_origin.
