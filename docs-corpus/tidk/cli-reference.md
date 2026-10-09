<!-- Verbatim --help capture, tidk (bioconda), fetched 2026-10-09 (v1.3.0 refresh) -->
<!-- Role: COMPULSORY telomere evidence in macrosynteny analysis (scaffold ends -> T2T context, fusion/fission adjudication) -->
## top level (subcommands)
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

## tidk search --help
Search the input genome with a specific telomeric repeat search string.

Usage: tidk search [OPTIONS] --string <STRING> --output <OUTPUT> --dir <DIR> <FASTA>

Arguments:
  <FASTA>  The input fasta file

Options:
  -s, --string <STRING>          The DNA string to query the genome with
  -w, --window [<WINDOW>]        Window size to calculate telomeric repeat counts in [default: 10000]
  -o, --output <OUTPUT>          Output filename for the TSVs (without extension)
  -d, --dir <DIR>                Output directory to write files to
  -e, --extension [<EXTENSION>]  The extension, defining the output type of the file [default: tsv] [possible values: tsv, bedgraph]
      --log                      Output a log file
  -h, --help                     Print help
  -V, --version                  Print version

## tidk ends --help
Call telomeres at both ends of each sequence, for telomere-to-telomere (T2T) assessment of an assembly.

Usage: tidk ends [OPTIONS] --output <OUTPUT> <FASTA>

Arguments:
  <FASTA>  The input fasta file

Options:
  -s, --string [<STRING>]
          The telomeric repeat unit, in any rotation or orientation. Discovered from the sequence ends if not given.
  -w, --window [<WINDOW>]
          Length of sequence to search at each end, in bp [default: 10000]
      --min-length [<MIN_LENGTH>]
          Minimum telomere length to call, in bp [default: 200]
      --max-offset [<MAX_OFFSET>]
          Maximum distance of a telomere from the sequence end, in bp. Telomeres further in are flagged as not_terminal [default: 1000]
      --min-sequence-length [<MIN_SEQUENCE_LENGTH>]
          Skip sequences shorter than this, in bp (e.g. unplaced scaffolds) [default: 0]
      --exact
          Only count runs of exactly identical repeats. By default runs may contain sequencing errors (substitutions and indels).
  -o, --output <OUTPUT>
          Output filename prefix
  -d, --dir [<DIR>]
          Output directory to write files to [default: .]
  -h, --help
          Print help
  -V, --version
          Print version

## tidk find --help
Supply the name of a clade your organsim belongs to, and this submodule will find all telomeric repeat matches for that clade.

Usage: tidk find [OPTIONS] [FASTA]

Arguments:
  [FASTA]  The input fasta file

Options:
  -w, --window [<WINDOW>]  Window size to calculate telomeric repeat counts in [default: 10000]
  -c, --clade <CLADE>      The clade of organism to identify telomeres in [possible values: Crassiclitellata, Hirudinida, Phyllodocida, Eucoccidiorida, Coleoptera, Hemiptera, Hymenoptera, Lepidoptera, Odonata, Orthoptera, Plecoptera, Symphypleona, Trichoptera, Cheilostomatida, Chlamydomonadales, Accipitriformes, Anura, Aplousobranchia, Caprimulgiformes, Carangiformes, Carcharhiniformes, Carnivora, Chiroptera, Cypriniformes, Labriformes, Perciformes, Phlebobranchia, Pleuronectiformes, Rodentia, Salmoniformes, Syngnathiformes, Actiniaria, Forcipulatida, Cardiida, Pectinida, Trochida, Venerida, Heteronemertea, Apiales, Asterales, Buxales, Caryophyllales, Fabales, Fagales, Hypnales, Lamiales, Malpighiales, Myrtales, Poales, Rosales, Sapindales, Solanales]
  -o, --output <OUTPUT>    Output filename for the TSVs (without extension)
  -d, --dir <DIR>          Output directory to write files to
  -p, --print              Print a table of clades, along with their telomeric sequences
      --log                Output a log file
  -h, --help               Print help
  -V, --version            Print version

## tidk explore --help
Use a range of kmer sizes to find potential telomeric repeats.
One of either length, or minimum and maximum must be specified.

Usage: tidk explore [OPTIONS] <FASTA>

Arguments:
  <FASTA>  The input fasta file

Options:
  -l, --length [<LENGTH>]        Length of substring
  -m, --minimum [<MINIMUM>]      Minimum length of substring [default: 5]
  -x, --maximum [<MAXIMUM>]      Maximum length of substring [default: 12]
  -t, --threshold [<THRESHOLD>]  Positions of repeats are only reported if they occur sequentially in a greater number than the threshold [default: 100]
      --distance [<DISTANCE>]    The distance from the end of the chromosome as a proportion of chromosome length. Must range from 0-0.5. [default: 0.01]
      --exact                    Only count runs of exactly identical repeats, as before version 0.3.0. By default runs may contain sequencing errors (substitutions and indels).
  -v, --verbose                  Print verbose output.
      --log                      Output a log file.
  -h, --help                     Print help
  -V, --version                  Print version
