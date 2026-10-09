<!-- Source: https://github.com/ZarulHanifah/FunMacroSynteny/tree/26a10c50a2295a031e68be9799da02a1ff993086 (NOTES.md, generate_links_tsv.py, macrosynteny.py, src/utils/Parsers.ts, test.links.tsv, tests/input_folder/tsvs/account_chrom_lengths/) -->
<!-- Fetched: 2026-10-09 -->
<!-- Role in this skill: input schemas + preprocessing notes for the FunMacroSynteny viewer -->

# FunMacroSynteny app notes

## 1. NOTES.md (verbatim — upstream dev to-do list, not user docs)

- Add scale bar
    - need ability to resize too using slider and textbox on the left sidebar
- Throw away chrom thickness - its kinda useless
- You know the braille 3x3 to indicate that something is draggable. Why dont we have that on:
    - Genome list on the left sidebar to rearrange the genomes on the display
    - The reference chromosomes on the right sidebar
- genome labels same size as chrom labels, including when resizing labels
- you know the emoji feature, lets do 16 emojis, 4x4, no need for names for the emojis. We have 3-4 now, come up with the rest with maybe something more useful: flag, alarm, good, perfect, cry, poor, interesting, magnifying glass, things like that
- Say I only focused on a few chroms... if I want to add another chrom to focused on, but after focusing, I dont exactly remember the name, I probably remembered the color and the rough syntenic pattern
    - Why dont we, when in focus mode, if I hover on another reference chrom on the right sidebar, it renders on display (without even selecting), and if I take my cursor off from hover, it removed that temporary display


## 2. `links.tsv` — the viewer's input (what `Parsers.parseTSV` reads)

Tab-separated, header row required, parsed with `d3.tsvParse` (**columns matched by name, order irrelevant**; extra columns such as `colour_block` are ignored by the viewer).

| Column | Required | Meaning |
|---|---|---|
| `block_id` | yes | Synteny group ID. Rows sharing a `block_id` are linked as one colour group. Row skipped if empty. |
| `bin_id` | yes | Genome/assembly name (one track per distinct value). Row skipped if empty. |
| `seq_id` | yes | Chromosome/contig name within `bin_id`. Row skipped if empty. |
| `start`, `end` | yes | Block coordinates on `bin_id`/`seq_id`. `min/max` taken, so `start > end` is tolerated. |
| `bin_id2`, `seq_id2` | for links | Partner genome + chromosome. Literal `null` (or empty) ⇒ unlinked / non-syntenic segment. |
| `start2`, `end2` | for links | Partner coordinates (`null` for non-syntenic rows). |
| `strand` | optional | `+`/`-` relative orientation of the link; `-` draws an inverted (twisted) ribbon. Missing ⇒ `+`. |

Viewer behaviours that matter when generating input:
- **Chromosome length = max `end` seen for that `seq_id`** — the viewer has no lengths file. Chromosomes appear truncated at their last block unless padded with non-syntenic rows to full length → that is what `generate_links_tsv.py` is for.
- A block for the same `block_id` on the same chromosome is de-duplicated (first coordinates win), so one block linked to two partners is written as two rows with the same `block_id` (see block `C` below).
- Link key is `block_id||bin_id||bin_id2`; strand is stored per pair of genomes.
- Pairwise rows only: a multi-genome block (e.g. ntSynt, one row per genome) must be expanded into pairwise rows (typically adjacent genomes in display order).

## 3. `sequence_lengths.tsv` — input to `generate_links_tsv.py` only

| Column | Required | Meaning |
|---|---|---|
| `bin_id` | yes | Genome name; must match `links.tsv` `bin_id` exactly (string compare). |
| `seq_id` | yes | Chromosome name; must match `links.tsv` `seq_id`. |
| `length` | yes | Chromosome length (bp). Parsed as `int(str(x).strip().replace("+",""))`. |
| `relative_orientation` | no | `+`/`-`; present in the test fixture but **not read** by the script. |

Note: in the upstream fixture the `Sample 2` rows are malformed (`1500000 +` — space instead of tab before the orientation). It still works only because the script strips `+` and whitespace from `length`. Emit proper tabs.

## 4. How `generate_links_tsv.py` processes them

```
python generate_links_tsv.py --links-tsv in.links.tsv --sequence-lengths in.sequence_lengths.tsv > out.links.tsv
```
(requires pandas; writes to stdout; a trailing blank line is printed.)

1. Reads both TSVs with pandas (`sep="\t"`); casts `bin_id`/`seq_id`(/`bin_id2`/`seq_id2`) to `str`.
2. **Pass 1** over link rows: records covered interval `(min, max)` of `start/end` per `(bin_id, seq_id)`.
   - If `bin_id2`, `seq_id2`, `start2`, `end2` are all non-null (NaN / `null` / empty count as null): syntenic row, `block_id` preserved; partner interval also recorded as covered.
   - Otherwise: explicit non-syntenic row, `block_id` **renamed** to `nonsyn_<n>`, partner fields set to `null`.
3. **Pass 2** per entry in the lengths file: merges covered intervals, emits a `nonsyn_<n>` row (`null` partner) for every internal gap (`last_end → next_start`) and for the trailing gap (`last_end → length`). Leading gap from 0 is included.
4. Output columns: `block_id bin_id seq_id start end bin_id2 seq_id2 start2 end2` (+ `strand` if input had it; `strand` kept for syntenic rows, `+` for nonsyn). **Any other input column (e.g. `colour_block`) is dropped.** Column order is normalised to the above.
5. Sorted by `bin_id, seq_id, start` (stable output; `nonsyn_<n>` numbering follows generation order, not sort order).
6. Chromosomes present only in the lengths file get one full-length `nonsyn` row; chromosomes only in `links.tsv` get no padding.

Then build the single-file viewer: `python macrosynteny.py out.links.tsv -o report.html --no-browser` (injects the TSV as `window.bakedData` into `macrosynteny.html`; template must sit next to the script).

## 5. Worked example (upstream fixtures, verbatim)

### Input `tests/input_folder/tsvs/account_chrom_lengths/simple_twoGenome_threeChrom.links.tsv`
```tsv
block_id	seq_id	bin_id	start	end	seq_id2	bin_id2	start2	end2	strand	colour_block
A	S1-C1	Sample 1	0	1000000	S2-C1	Sample 2	0	1000000	+	A
B	S1-C2	Sample 1	0	2000000	S2-C2	Sample 2	0	2000000	+	B
C	S1-C3	Sample 1	0	500000	S2-C3	Sample 2	0	500000	+	C
C	S1-C3	Sample 1	0	500000	S2-C2	Sample 2	2000000	2500000	+	C
```

### Input `tests/input_folder/tsvs/account_chrom_lengths/simple_twoGenome_threeChrom.sequence_lengths.sorted.tsv`
```tsv
bin_id	seq_id	length	relative_orientation
Sample 1	S1-C1	1000000	+
Sample 1	S1-C2	2500000	+
Sample 1	S1-C3	500000	+
Sample 2	S2-C1	1500000 +
Sample 2	S2-C2	3000000 +
Sample 2	S2-C3	1000000 +
```

### Viewer-ready `test.links.tsv` (repo root; matches the processed form of the inputs above — note column reorder, dropped `strand`/`colour_block` in this copy, and `nonsyn_*` padding rows)
```tsv
block_id	bin_id	seq_id	start	end	bin_id2	seq_id2	start2	end2
A	Sample 1	S1-C1	0	1000000	Sample 2	S2-C1	0	1000000
B	Sample 1	S1-C2	0	2000000	Sample 2	S2-C2	0	2000000
nonsyn_1	Sample 1	S1-C2	2000000	2500000	null	null	null	null
C	Sample 1	S1-C3	0	500000	Sample 2	S2-C3	0	500000
C	Sample 1	S1-C3	0	500000	Sample 2	S2-C2	2000000	2500000
nonsyn_2	Sample 2	S2-C1	1000000	1500000	null	null	null	null
nonsyn_3	Sample 2	S2-C2	2500000	3000000	null	null	null	null
nonsyn_4	Sample 2	S2-C3	500000	1000000	null	null	null	null

```

Not verified locally: `generate_links_tsv.py` was not executed (pandas not installed in this environment). Upstream script output on these inputs would additionally keep the `strand` column, since the input has one; `test.links.tsv` lacks it, so it was likely produced from a strand-less input or an earlier script version.
