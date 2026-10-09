<!-- Verbatim --help capture, ntSynt, fetched 2026-10-09 -->
<!-- Role: see docs-corpus/ntsynt/README.md -->
usage: ntSynt [-h] [--fastas_list FASTAS_LIST] -d DIVERGENCE [-p PREFIX]
              [-k K] [-w W] [-t T] [--fpr FPR] [--hashes HASHES]
              [-b BLOCK_SIZE] [--merge MERGE]
              [--w_rounds W_ROUNDS [W_ROUNDS ...]] [--indel INDEL] [-n]
              [--benchmark] [-f] [--dev] [-v]
              [fastas ...]

ntSynt: Multi-genome synteny detection using minimizer graphs

positional arguments:
  fastas                Input genome fasta files

options:
  -h, --help            show this help message and exit
  --fastas_list FASTAS_LIST
                        File listing input genome fasta files, one per line
  -d DIVERGENCE, --divergence DIVERGENCE
                        Approx. maximum percent sequence divergence between input genomes (Ex. -d 1 for 1% divergence).
                        This will be used to set --indel, --merge, --w_rounds, --block_size
                        See below for default values - You can also set any of those parameters yourself, which will override these settings.
  -p PREFIX, --prefix PREFIX
                        Prefix for ntSynt output files [ntSynt.k<k>.w<w>]
  -k K                  Minimizer k-mer size [24]
  -w W                  Minimizer window size [1000]
  -t T                  Number of threads [12]
  --fpr FPR             False positive rate for Bloom filter creation [0.025]
  --hashes HASHES       Number of hash functions for Bloom filter creation [3]
  -b BLOCK_SIZE, --block_size BLOCK_SIZE
                        Minimum synteny block size (bp)
  --merge MERGE         Maximum distance between collinear synteny blocks for merging (bp). 
                        Can also specify a multiple of the window size (ex. 3w)
  --w_rounds W_ROUNDS [W_ROUNDS ...]
                        List of decreasing window sizes for synteny block refinement
  --indel INDEL         Threshold for indel detection (bp)
  -n, --dry-run         Print out the commands that will be executed
  --benchmark           Store benchmarks for each step of the ntSynt pipeline
  -f, --force           Run all ntSynt steps, regardless of existing output files
  --dev                 Run in developer mode to retain intermediate files, log verbose output
  -v, --version         show program's version number and exit

Default parameter settings for divergence values:
< 1% divergence:	--block_size 500 --indel 10000 --merge 10000 --w_rounds 100 10
1% - 10% divergence:	--block_size 1000 --indel 50000 --merge 100000 --w_rounds 250 100
> 10% divergence:	--block_size 10000 --indel 100000 --merge 1000000 --w_rounds 500 250
If any of these parameters are set manually, those values will override the above.

If you have any questions about ntSynt, please create a GitHub issue: https://github.com/BirolLab/ntSynt
