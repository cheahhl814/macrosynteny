#!/usr/bin/env python3
import argparse
import os
import webbrowser
import sys

def main():
    parser = argparse.ArgumentParser(description="Macrosynteny Visualization Tool")
    parser.add_argument("tsv", help="Path to the .links.tsv file")
    parser.add_argument("-o", "--output", help="Output HTML file path", default="macrosynteny_viz.html")
    parser.add_argument("--no-browser", action="store_true", help="Don't open the browser automatically")
    
    args = parser.parse_args()

    if not os.path.exists(args.tsv):
        print(f"Error: file {args.tsv} not found.")
        sys.exit(1)

    # 1. Read the TSV data
    try:
        with open(args.tsv, "r") as f:
            tsv_content = f.read()
    except Exception as e:
        print(f"Error reading TSV: {e}")
        sys.exit(1)

    # 2. Find the template (macrosynteny.html)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(script_dir, "macrosynteny.html")
    
    if not os.path.exists(template_path):
        print(f"Error: Template {template_path} not found.")
        sys.exit(1)

    with open(template_path, "r") as f:
        html_template = f.read()

    # 3. Inject the data
    # We escape backticks in the TSV strictly to keep the template literal valid
    escaped_tsv = tsv_content.replace("`", "\\`").replace("${", "\\${")
    
    baked_script = f"""
    <script>
        window.bakedData = `{escaped_tsv}`;
    </script>
    """
    
    # Insert the baked data before the closure of </head> or start of <body>
    final_html = html_template.replace("</title>", f"</title>{baked_script}")

    # 4. Write the output
    try:
        with open(args.output, "w") as f:
            f.write(final_html)
        print(f"Successfully generated visualization: {args.output}")
    except Exception as e:
        print(f"Error writing output HTML: {e}")
        sys.exit(1)

    # 5. Open browser
    if not args.no_browser:
        webbrowser.open(f"file://{os.path.abspath(args.output)}")

if __name__ == "__main__":
    main()
