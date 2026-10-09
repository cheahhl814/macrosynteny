<!-- Verbatim --help capture, mash 2.3, fetched 2026-10-09 -->
<!-- Role: pairwise divergence estimation to set ntSynt -d (mash sketch + mash dist are the invocations) -->
## mash (top level)

Mash version 2.3

Type 'mash --license' for license and copyright information.

Usage:

  mash <command> [options] [arguments ...]

Commands:

  bounds
  Print a table of Mash error bounds.

  dist
  Estimate the distance of query sequences to references.

  info
  Display information about sketch files.

  paste
  Create a single sketch file from multiple sketch files.

  screen
  Determine whether query sequences are within a larger mixture of sequences.

  sketch
  Create sketches (reduced representations for fast operations).

  taxscreen
  Create Kraken-style taxonomic report based on mash screen.

  triangle
  Estimate a lower-triangular distance matrix.


## mash sketch --help

Version: 2.3

Usage:

  mash sketch [options] <input> [<input>] ...

Description:

  Create a sketch file, which is a reduced representation of a sequence or set of sequences (based on min-hashes) that can be used for fast distance estimations. Inputs can be fasta or fastq files (gzipped or not), and "-" can be given to read from standard input. Input files can also be files of file names (see -l). For output, one sketch file will be generated, but it can have multiple sketches within it, divided by sequences or files (see -i). By default, the output file name will be the first input file with a '.msh' extension, or 'stdin.msh' if standard input is used (see -o).

Options:

  Option     Description (range) [default]

  -h         Help

  -p <int>   Parallelism. This many threads will be spawned for processing. [1]

...Input...

  -l         List input. Lines in each <input> specify paths to sequence files,
             one per line.

...Output...

  -o <path>  Output prefix (first input file used if unspecified). The suffix
             '.msh' will be appended.

...Sketching...

  -I <path>  ID field for sketch of reads (instead of first sequence ID).

  -C <path>  Comment for a sketch of reads (instead of first sequence comment).

  -k <int>   K-mer size. Hashes will be based on strings of this many
             nucleotides. Canonical nucleotides are used by default (see
             Alphabet options below). (1-32) [21]

  -s <int>   Sketch size. Each sketch will have at most this many non-redundant
             min-hashes. [1000]

  -i         Sketch individual sequences, rather than whole files, e.g. for
             multi-fastas of single-chromosome genomes or pair-wise gene
             comparisons.

  -S <int>   Seed to provide to the hash function. (0-4294967296) [42]

  -w <num>   Probability threshold for warning about low k-mer size. (0-1)
             [0.01]

  -r         Input is a read set. See Reads options below. Incompatible with -i.

...Sketching (reads)...

  -b <size>  Use a Bloom filter of this size (raw bytes or with K/M/G/T) to
             filter out unique k-mers. This is useful if exact filtering with -m
             uses too much memory. However, some unique k-mers may pass
             erroneously, and copies cannot be counted beyond 2. Implies -r.

  -m <int>   Minimum copies of each k-mer required to pass noise filter for
             reads. Implies -r. [1]

  -c <num>   Target coverage. Sketching will conclude if this coverage is
             reached before the end of the input file (estimated by average
             k-mer multiplicity). Implies -r.

  -g <size>  Genome size (raw bases or with K/M/G/T). If specified, will be used
             for p-value calculation instead of an estimated size from k-mer
             content. Implies -r.

...Sketching (alphabet)...

  -n         Preserve strand (by default, strand is ignored by using canonical
             DNA k-mers, which are alphabetical minima of forward-reverse
             pairs). Implied if an alphabet is specified with -a or -z.

  -a         Use amino acid alphabet (A-Z, except BJOUXZ). Implies -n, -k 9.

  -z <text>  Alphabet to base hashes on (case ignored by default; see -Z).
             K-mers with other characters will be ignored. Implies -n.

  -Z         Preserve case in k-mers and alphabet (case is ignored by default).
             Sequence letters whose case is not in the current alphabet will be
             skipped when sketching.


## mash dist --help

Version: 2.3

Usage:

  mash dist [options] <reference> <query> [<query>] ...

Description:

  Estimate the distance of each query sequence to the reference. Both the reference and queries can be fasta or fastq, gzipped or not, or Mash sketch files (.msh) with matching k-mer sizes. Query files can also be files of file names (see -l). Whole files are compared by default (see -i). The output fields are [reference-ID, query-ID, distance, p-value, shared-hashes].

Options:

  Option     Description (range) [default]

  -h         Help

  -p <int>   Parallelism. This many threads will be spawned for processing. [1]

...Input...

  -l         List input. Lines in each <query> specify paths to sequence files,
             one per line. The reference file is not affected.

...Output...

  -t         Table output (will not report p-values, but fields will be blank if
             they do not meet the p-value threshold).

  -v <num>   Maximum p-value to report. (0-1) [1.0]

  -d <num>   Maximum distance to report. (0-1) [1.0]

  -C         Show comment fields with reference/query names (denoted with ':').
             (0-1) [1.0]

...Sketching...

  -k <int>   K-mer size. Hashes will be based on strings of this many
             nucleotides. Canonical nucleotides are used by default (see
             Alphabet options below). (1-32) [21]

  -s <int>   Sketch size. Each sketch will have at most this many non-redundant
             min-hashes. [1000]

  -i         Sketch individual sequences, rather than whole files, e.g. for
             multi-fastas of single-chromosome genomes or pair-wise gene
             comparisons.

  -S <int>   Seed to provide to the hash function. (0-4294967296) [42]

  -w <num>   Probability threshold for warning about low k-mer size. (0-1)
             [0.01]

  -r         Input is a read set. See Reads options below. Incompatible with -i.

...Sketching (reads)...

  -b <size>  Use a Bloom filter of this size (raw bytes or with K/M/G/T) to
             filter out unique k-mers. This is useful if exact filtering with -m
             uses too much memory. However, some unique k-mers may pass
             erroneously, and copies cannot be counted beyond 2. Implies -r.

  -m <int>   Minimum copies of each k-mer required to pass noise filter for
             reads. Implies -r. [1]

  -c <num>   Target coverage. Sketching will conclude if this coverage is
             reached before the end of the input file (estimated by average
             k-mer multiplicity). Implies -r.

  -g <size>  Genome size (raw bases or with K/M/G/T). If specified, will be used
             for p-value calculation instead of an estimated size from k-mer
             content. Implies -r.

...Sketching (alphabet)...

  -n         Preserve strand (by default, strand is ignored by using canonical
             DNA k-mers, which are alphabetical minima of forward-reverse
             pairs). Implied if an alphabet is specified with -a or -z.

  -a         Use amino acid alphabet (A-Z, except BJOUXZ). Implies -n, -k 9.

  -z <text>  Alphabet to base hashes on (case ignored by default; see -Z).
             K-mers with other characters will be ignored. Implies -n.

  -Z         Preserve case in k-mers and alphabet (case is ignored by default).
             Sequence letters whose case is not in the current alphabet will be
             skipped when sketching.

