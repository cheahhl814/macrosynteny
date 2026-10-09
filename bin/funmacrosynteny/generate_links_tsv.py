import argparse
import pandas as pd
import sys

def merge_intervals(intervals):
    if not intervals:
        return []
    intervals.sort()
    merged = [intervals[0]]
    for current_start, current_end in intervals[1:]:
        last_merged_start, last_merged_end = merged[-1]
        if current_start <= last_merged_end:
            merged[-1] = (last_merged_start, max(last_merged_end, current_end))
        else:
            merged.append((current_start, current_end))
    return merged

def process_links_data(links_tsv_path, sequence_lengths_tsv_path):
    
    # Read sequence lengths
    try:
        seq_lengths_df = pd.read_csv(sequence_lengths_tsv_path, sep="	")
    except FileNotFoundError:
        print(f"Error: Sequence lengths file not found at {sequence_lengths_tsv_path}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading sequence lengths file {sequence_lengths_tsv_path}: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Ensure bin_id and seq_id are strings for consistent dictionary keys
    seq_lengths_df['bin_id'] = seq_lengths_df['bin_id'].astype(str)
    seq_lengths_df['seq_id'] = seq_lengths_df['seq_id'].astype(str)
    
    # Create a mapping for sequence lengths
    sequence_total_lengths = {}
    for _, row in seq_lengths_df.iterrows():
        sequence_total_lengths[(row["bin_id"], row["seq_id"])] = int(str(row["length"]).strip().replace("+", ""))

    # Read the links TSV file
    try:
        links_df = pd.read_csv(links_tsv_path, sep="	")
    except FileNotFoundError:
        print(f"Error: Links file not found at {links_tsv_path}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading links file {links_tsv_path}: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Ensure bin_id and seq_id are strings for consistent dictionary keys
    # Ensure bin_id and seq_id are strings for consistent dictionary keys
    links_df['bin_id'] = links_df['bin_id'].astype(str)
    links_df['seq_id'] = links_df['seq_id'].astype(str)
    if "bin_id2" in links_df.columns: # Check if column exists before converting
        links_df['bin_id2'] = links_df['bin_id2'].astype(str)
    if "seq_id2" in links_df.columns: # Check if column exists before converting
        links_df['seq_id2'] = links_df['seq_id2'].astype(str)

    has_strand = "strand" in links_df.columns
    output_rows = []
    non_syn_counter = 1

    # Dictionary to store covered regions for each (bin_id, seq_id) from the links file
    covered_regions = {}

    # Define the target columns
    output_columns = [
        "block_id", "bin_id", "seq_id", "start", "end",
        "bin_id2", "seq_id2", "start2", "end2"
    ]
    if has_strand:
        output_columns.append("strand")

    # First pass: Process existing syntenic/non-syntenic blocks from the links file
    for index, row in links_df.iterrows():
        block_id_in = row["block_id"]
        current_bin_id = row["bin_id"]
        current_seq_id = row["seq_id"]
        current_start = int(row["start"])
        current_end = int(row["end"])

        # Add covered region for the first genome (using min/max to support inverted coordinates)
        covered_regions.setdefault((current_bin_id, current_seq_id), []).append(
            (min(current_start, current_end), max(current_start, current_end))
        )

        # Check for syntenic block (presence of seq_id2 and bin_id2)
        seq_id2_in = row.get("seq_id2", None)
        bin_id2_in = row.get("bin_id2", None)
        start2_in = row.get("start2", None)
        end2_in = row.get("end2", None)

        # Convert potential pandas NaN or empty strings/"null" to None for easier checking
        if pd.isna(seq_id2_in) or str(seq_id2_in).lower() == "null" or str(seq_id2_in).strip() == "":
            seq_id2_in = None
        if pd.isna(bin_id2_in) or str(bin_id2_in).lower() == "null" or str(bin_id2_in).strip() == "":
            bin_id2_in = None
        
        # Convert start2_in and end2_in to int only if they are not None and not 'null'
        if pd.isna(start2_in) or str(start2_in).lower() == "null" or str(start2_in).strip() == "":
            start2_in_val = None
        else:
            start2_in_val = int(start2_in)

        if pd.isna(end2_in) or str(end2_in).lower() == "null" or str(end2_in).strip() == "":
            end2_in_val = None
        else:
            end2_in_val = int(end2_in)


        if seq_id2_in is not None and bin_id2_in is not None and start2_in_val is not None and end2_in_val is not None:
            # It's a syntenic block
            block_id_out = block_id_in # Preserve original block_id
            bin_id2_out = bin_id2_in
            seq_id2_out = seq_id2_in # Preserve original seq_id2
            start2_out = start2_in_val
            end2_out = end2_in_val

            # Add covered region for the second genome (using min/max to support inverted coordinates)
            covered_regions.setdefault((bin_id2_in, seq_id2_in), []).append(
                (min(start2_in_val, end2_in_val), max(start2_in_val, end2_in_val))
            )

            row_to_append = [
                block_id_out,
                current_bin_id,
                current_seq_id,
                current_start,
                current_end,
                bin_id2_out,
                seq_id2_out,
                start2_out,
                end2_out
            ]
            if has_strand:
                row_to_append.append(row.get("strand", "+"))
            output_rows.append(row_to_append)
        else:
            # It's an explicit non-syntenic block from the input file
            block_id_out = f"nonsyn_{non_syn_counter}"
            non_syn_counter += 1
            
            bin_id2_out, seq_id2_out, start2_out, end2_out = "null", "null", "null", "null"

            row_to_append = [
                block_id_out,
                current_bin_id,
                current_seq_id,
                current_start,
                current_end,
                bin_id2_out,
                seq_id2_out,
                start2_out,
                end2_out
            ]
            if has_strand:
                row_to_append.append("+")
            output_rows.append(row_to_append)

    # Second pass: Identify uncovered regions based on sequence lengths
    final_output_rows_with_uncovered = output_rows[:]
    
    for (bin_id, seq_id), total_length in sequence_total_lengths.items():
        intervals = covered_regions.get((bin_id, seq_id), [])
        merged = merge_intervals(intervals)
        
        last_covered_end = 0
        for start, end in merged:
            if start > last_covered_end:
                # Uncovered region found
                row_to_append = [
                    f"nonsyn_{non_syn_counter}", # New block_id
                    bin_id,
                    seq_id,
                    last_covered_end,
                    start, # End of uncovered region
                    "null", "null", "null", "null"
                ]
                if has_strand:
                    row_to_append.append("+")
                final_output_rows_with_uncovered.append(row_to_append)
                non_syn_counter += 1
            last_covered_end = max(last_covered_end, end)
        
        if last_covered_end < total_length:
            # Trailing uncovered region
            row_to_append = [
                f"nonsyn_{non_syn_counter}", # New block_id
                bin_id,
                seq_id,
                last_covered_end,
                total_length, # End of chromosome
                "null", "null", "null", "null"
            ]
            if has_strand:
                row_to_append.append("+")
            final_output_rows_with_uncovered.append(row_to_append)
            non_syn_counter += 1

    # Create DataFrame from final output rows
    output_df = pd.DataFrame(final_output_rows_with_uncovered, columns=output_columns)
    # Sort the output DataFrame to make the results predictable, primarily by bin_id, then seq_id, then start
    output_df = output_df.sort_values(by=["bin_id", "seq_id", "start"]).reset_index(drop=True)

    # Print to stdout
    print(output_df.to_csv(sep="	", index=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="""
        Generates a processed links TSV file from input links and sequence length files.
        It preserves original block and sequence IDs for syntenic regions. Non-syntenic regions
        explicitly defined in the input or inferred from gaps in sequence coverage (compared to
        total sequence lengths) are assigned unique 'nonsyn_X' block IDs and 'null' for their
        second set of coordinates.
        """
    )
    parser.add_argument(
        "--links-tsv",
        required=True,
        help="Path to the input links TSV file."
    )
    parser.add_argument(
        "--sequence-lengths",
        required=True,
        help="Path to the input sequence lengths TSV file."
    )

    args = parser.parse_args()
    process_links_data(args.links_tsv, args.sequence_lengths)
