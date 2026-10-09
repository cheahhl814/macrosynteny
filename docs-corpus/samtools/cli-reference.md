<!-- Verbatim capture, samtools 1.24, fetched 2026-10-09 -->
<!-- Role: faidx .fai generation (samtools faidx is the invocation) -->
## samtools (top level)
samtools 1.24
Using htslib 1.24
Copyright (C) 2026 Genome Research Ltd.

Program: samtools (Tools for alignments in the SAM format)
Version: 1.24 (using htslib 1.24)

Usage:   samtools <command> [options]

Commands:
  -- Indexing
     dict           create a sequence dictionary file
     faidx          index/extract FASTA
     fqidx          index/extract FASTQ
     index          index alignment

  -- Editing
     calmd          recalculate MD/NM tags and '=' bases
     fixmate        fix mate information
     reheader       replace BAM header
     targetcut      cut fosmid regions (for fosmid pool only)
     addreplacerg   adds or replaces RG tags
     markdup        mark duplicates
     ampliconclip   clip oligos from the end of reads

  -- File operations
     collate        shuffle and group alignments by name
     cat            concatenate BAMs
     consensus      produce a consensus Pileup/FASTA/FASTQ
     merge          merge sorted alignments
     mpileup        multi-way pileup
     sort           sort alignment file
     split          splits a file by read group
     quickcheck     quickly check if SAM/BAM/CRAM file appears intact
     fastq          converts a BAM to a FASTQ
     fasta          converts a BAM to a FASTA
     import         Converts FASTA or FASTQ files to SAM/BAM/CRAM
     reference      Generates a reference from aligned data
     reset          Reverts aligner changes in reads

  -- Statistics
     bedcov         read depth per BED region
     coverage       alignment depth and percent coverage
     depth          compute the depth
     flagstat       simple stats
     idxstats       BAM index stats
     cram-size      list CRAM Content-ID and Data-Series sizes
     phase          phase heterozygotes

## samtools faidx --help
Usage: samtools faidx <file.fa|file.fa.gz> [<reg> [...]]
Option: 
  -o, --output FILE        Write FASTA to file.
  -n, --length INT         Length of FASTA sequence line. [60]
  -c, --continue           Continue after trying to retrieve missing region.
  -r, --region-file FILE   File of regions.  Format is chr:from-to. One per line.
  -i, --reverse-complement Reverse complement sequences.
      --mark-strand TYPE   Add strand indicator to sequence name
                           TYPE = rc   for /rc on negative strand (default)
                                  no   for no strand indicator
                                  sign for (+) / (-)
                                  custom,<pos>,<neg> for custom indicator
      --fai-idx      FILE  name of the index file (default file.fa.fai).
      --gzi-idx      FILE  name of compressed file index (default file.fa.gz.gzi).
  -f, --fastq              File and index in FASTQ format.
  -h, --help               This message.
      --output-fmt-option OPT[=VAL]
               Specify a single output file format option in the form
               of OPTION or OPTION=VALUE
  -@, --threads INT
               Number of additional threads to use [0]
      --write-index
               Automatically index the output files [off]

See https://www.htslib.org/doc/samtools.html#GLOBAL_COMMAND_OPTIONS
for more details.
