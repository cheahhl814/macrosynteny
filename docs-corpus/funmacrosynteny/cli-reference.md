<!-- Vendored FunMacroSynteny CLI captures, 2026-10-09 -->
usage: macrosynteny.py [-h] [-o OUTPUT] [--no-browser] tsv

Macrosynteny Visualization Tool

positional arguments:
  tsv                   Path to the .links.tsv file

options:
  -h, --help            show this help message and exit
  -o OUTPUT, --output OUTPUT
                        Output HTML file path
  --no-browser          Don't open the browser automatically

=== generate_links_tsv.py --help ===
usage: generate_links_tsv.py [-h] --links-tsv LINKS_TSV --sequence-lengths
                             SEQUENCE_LENGTHS

Generates a processed links TSV file from input links and sequence length
files. It preserves original block and sequence IDs for syntenic regions. Non-
syntenic regions explicitly defined in the input or inferred from gaps in
sequence coverage (compared to total sequence lengths) are assigned unique
'nonsyn_X' block IDs and 'null' for their second set of coordinates.

options:
  -h, --help            show this help message and exit
  --links-tsv LINKS_TSV
                        Path to the input links TSV file.
  --sequence-lengths SEQUENCE_LENGTHS
                        Path to the input sequence lengths TSV file.
