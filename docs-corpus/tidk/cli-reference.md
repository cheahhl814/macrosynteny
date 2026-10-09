<!-- Verbatim --help capture, tidk (bioconda), fetched 2026-10-09 -->
<!-- Role: telomeric repeat search (tidk telomeric) for the optional scaffold-completeness QC check -->
A Telomere Identification Toolkit.

Usage: tidk [COMMAND]

Commands:
  build    Build the reference database of telomeric repeat sequences. This is required for the 'find' subcommand.
  find     Supply the name of a clade your organsim belongs to, and this submodule will find all telomeric repeat matches for that clade.
  explore  Use a range of kmer sizes to find potential telomeric repeats.
           One of either length, or minimum and maximum must be specified.
  ends     Call telomeres at both ends of each sequence, for telomere-to-telomere (T2T) assessment of an assembly.
  length   Measure telomere lengths from long reads (PacBio HiFi or ONT), using telomeres at read ends.
  search   Search the input genome with a specific telomeric repeat search string.
  plot     SVG plot of TSV generated from tidk search.
  help     Print this message or the help of the given subcommand(s)

Options:
  -h, --help     Print help
  -V, --version  Print version

## tidk telomeric --help
error: unrecognized subcommand 'telomeric'

Usage: tidk [COMMAND]

For more information, try '--help'.
