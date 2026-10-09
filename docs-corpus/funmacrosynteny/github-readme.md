<!-- Source: https://github.com/ZarulHanifah/FunMacroSynteny/blob/26a10c50a2295a031e68be9799da02a1ff993086/README.md -->
<!-- Fetched: 2026-10-09 -->
<!-- Role in this skill: interactive single-file macrosynteny HTML viewer, consumes links.tsv -->

# FunMacroSynteny 🧬

View macrosynteny with fun! Transform your structural genomics analysis from static images into a dynamic, interactive experience.

![Demo](static/images/demo.png)

## Why FunMacroSynteny?

We took inspiration from traditional macrosynteny visualizations, which are great for:
- Comparing different assemblies or parameters.
- Assessing structural evolution between species.
- Identifying genomic rearrangements and damage.

**But static images are a dead end.** We created FunMacroSynteny because genomic analysis should be fluid, interactive, and—most importantly—fun.

## 🚀 Quick Start

1. **Serve the app**:
   `python -m http.server 8000`
2. **Load your data**: Open your browser to `localhost:8000` and load your `.links.tsv` file.
3. **Explore**: Drag, drop, and right-click to discover structural insights.

## ✨ Premium Features

### 🎮 Total Interactive Control
- **Fluid Drag-and-Drop**: Rearrange genomes or individual chromosomes instantly to find the best alignment.
- **Deep Context Menus**: Right-click any syntenic block or chromosome to:
  - 🎨 **Change Colors**: Pick custom colors for specific synteny groups.
  - 🔄 **Reverse Orientation**: Flip chromosomes on the fly.
  - 🎯 **Focus Mode**: Zero in on specific chromosomes to clear the noise.
  - 🏷️ **Add Markers**: Tag important regions with red flags or icons.

### 📏 Smart Alignment
- **Neighbor-Sense Sorting**: Don't waste time manual-sorting. Right-click a genome to automatically align its chromosomes based on its neighbors (above or below).

### 📸 Publication-Ready Exports
- **The Export Hub**: A dedicated panel for high-quality outputs:
  - **300 DPI PNG**: Perfectly sized (18cm width) for journals and posters.
  - **Vector SVG**: Fully editable vector files with embedded styles for Illustrator or Inkscape.

### 🌍 Interactive Reporting (The "Collaborator Mode")
- **One-File Portability**: Export your entire analysis as a **single `.html` file**. 
- **No Server Required**: Share this file with collaborators; they can open it in any browser and use the full interactive engine to explore your data without installing a thing.

## 🛠 Dependencies

- A modern web browser.
- (Optional) Python to serve the files locally.

## 🛠️ Developer Guide (TypeScript Workflow)

This project is built using TypeScript for robust type-safety and visual scaling logic, while utilizing native browser ES modules so it can run instantly without a complex bundler.

### How to Work with the Codebase:
1. **Always edit `.ts` files** (located under `src/`):
   Never edit the compiled `.js` files directly.
2. **Build the TypeScript files**:
   To compile the `.ts` files into `.js` files side-by-side:
   ```bash
   npm run build
   ```
3. **Use Watch Mode during development**:
   Keep the compiler running in the background. It will automatically recompile `.ts` files to `.js` whenever you save changes:
   ```bash
   npm run watch
   ```
4. **Git Commits**:
   Always commit both your `.ts` source files and the compiled `.js` files so that the application remains functional immediately upon cloning.

---
*Enjoy your genomic journey. Only when it is fun, do people truly want to check their genomes.*
