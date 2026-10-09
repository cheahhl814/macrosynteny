<!-- Verbatim --help capture, ntsynt-viz (bioconda), fetched 2026-10-09 -->
<!-- Role: static ribbon plots + chromosome-painting features + est-distances (interpret phase input) -->
usage: ntsynt_viz.py [-h] --blocks BLOCKS --fais FAIS [FAIS ...]
                     [--name_conversion NAME_CONVERSION] [--tree TREE]
                     [--target-genome TARGET_GENOME] [--normalize]
                     [--indel INDEL] [--length LENGTH]
                     [--seq_length SEQ_LENGTH] [--keep KEEP [KEEP ...]]
                     [--centromeres CENTROMERES] [--haplotypes HAPLOTYPES]
                     [--order ORDER] [--prefix PREFIX]
                     [--format {png,pdf,svg}] [--scale SCALE]
                     [--height HEIGHT] [--width WIDTH] [--dpi DPI]
                     [--html-title HTML_TITLE] [--html-image HTML_IMAGE]
                     [--no-html] [--annotate-genome-info]
                     [--optimize-ordering] [--no-arrow]
                     [--ribbon_adjust RIBBON_ADJUST] [-f] [-n] [-v]

Visualizing multi-genome synteny

options:
  -h, --help            show this help message and exit

required arguments:
  --blocks BLOCKS       ntSynt-formatted synteny blocks TSV
  --fais FAIS [FAIS ...]
                        FAI files for all input genomes. Can be a list or a
                        file with one FAI path per line.

main plot formatting arguments:
  --name_conversion NAME_CONVERSION
                        TSV for converting names in the blocks TSV (old ->
                        new). IMPORTANT: new names cannot have spaces. If you
                        want to have spaces in the final ribbon plot, use the
                        special character '_'. All underscores in the new name
                        will be converted to spaces.
  --tree TREE           User-input tree file in newick format. If specified,
                        this tree will be plotted next to the output ribbon
                        plot, and used for ordering the assemblies. The names
                        in the newick file must match the new names if
                        --name_conversion is specified, or the genome file
                        names in the synteny blocks input file otherwise. If
                        not specified, the synteny blocks will be used to
                        estimate pairwise distances for the genome ordering
                        and associated tree.
  --target-genome TARGET_GENOME
                        Target genome. If specified, this genome will be at
                        the top of the ribbon plot, with ribbons coloured
                        based on its chromosomes and (if applicable) other
                        chromosomes normalized to it. If not specified, the
                        top genome will be arbitrary.
  --normalize           Normalize strand of chromosomes relative to the target
                        (top) genome in the ribbon plots
  --centromeres CENTROMERES
                        TSV file with centromere positions. Must have the
                        headers: bin_id,seq_id,start,end. bin_id must match
                        the new names from --name_conversion or the genome
                        names if --name_conversion is not specified. seq_id is
                        the chromosome name.
  --haplotypes HAPLOTYPES
                        File listing haplotype assembly names: TSV,
                        maternal/paternal assembly file names separated by
                        tabs.
  --order ORDER         Optional file specifying the order of genomes in the
                        ribbon plot. If supplied, will override synteny
                        distance-based ordering. If --tree supplied, the
                        ordering must be compatible with the phylogenetic
                        tree.

block filtering arguments:
  --indel INDEL         Indel size threshold [50000]
  --length LENGTH       Minimum synteny block length [100000]
  --seq_length SEQ_LENGTH
                        Minimum sequence length [500000]
  --keep KEEP [KEEP ...]
                        List of genome_name:chromosome to show in
                        visualization. All chromosomes with links to the
                        specified chromosomes will also be shown.

output arguments:
  --prefix PREFIX       Prefix for output files [ntSynt-viz_ribbon-plot]
  --format {png,pdf,svg}
                        Output format of plot [png]
  --scale SCALE         Length of scale bar in bases [100e6]
  --height HEIGHT       Height of plot in cm [20]
  --width WIDTH         Width of plot in cm [55]
  --dpi DPI             Resolution of output plot - png output only [300]
  --html-title HTML_TITLE
                        Title displayed above the interactive HTML ribbon
                        plot; supports <em> and <i> tags for italics
  --html-image HTML_IMAGE
                        PNG, JPEG, GIF, SVG, or WebP image displayed next to
                        the interactive HTML title
  --no-html             Do not output HTML ribbon plot
  --annotate-genome-info
                        Add annotations about number of sequences and genome
                        size to the right of each genome in the ribbon plot
  --optimize-ordering   Optimize tree-guided genome sorting using inversions.
                        Only use with strictly bifurcating trees.
  --no-arrow            Only used with --normalize; do not draw arrows
                        indicating reverse-complementation
  --ribbon_adjust RIBBON_ADJUST
                        Ratio for adjusting spacing beside ribbon plot.
                        Increase if ribbon plot labels are cut off, and
                        decrease to reduce the white space to the left of the
                        ribbon plot. By default, automatically estimated
                        [auto]

execution arguments:
  -f, --force           Force a re-run of the entire pipeline
  -n                    Dry-run for snakemake pipeline
  -v, --version         show program's version number and exit
