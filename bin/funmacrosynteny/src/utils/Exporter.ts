import type { SyntenyViz } from '../core/Core.js';

/**
 * Exporter.ts - FULL FIDELITY Standalone version in TypeScript.
 */

export class Exporter {
    static exportSVG(svgNode: SVGElement) {
        const clone = svgNode.cloneNode(true) as SVGElement;
        this._inlineStyles(clone);
        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(clone);
        if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        if (!source.match(/^<svg[^>]+xmlns\:xlink="http\:\/\/www\.w3\.org\/1999\/xlink"/)) source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
        this._download("data:image/svg+xml;charset=utf-8," + encodeURIComponent(source), "funmacrosynteny_export.svg");
    }

    static exportPNG(svgNode: SVGElement) {
        const dpi = 300, targetWidthCm = 18, pixelsPerInch = 300, cmPerInch = 2.54;
        const targetPixelWidth = Math.round((targetWidthCm / cmPerInch) * pixelsPerInch);
        const widthAttr = svgNode.getAttribute("width");
        const heightAttr = svgNode.getAttribute("height");
        const svgWidth = widthAttr ? parseFloat(widthAttr) : 800;
        const svgHeight = heightAttr ? parseFloat(heightAttr) : 600;
        const targetPixelHeight = Math.round(targetPixelWidth * (svgHeight / svgWidth));
        const clone = svgNode.cloneNode(true) as SVGElement;
        this._inlineStyles(clone);
        const serializer = new XMLSerializer(), svgData = serializer.serializeToString(clone);
        const canvas = document.createElement("canvas");
        canvas.width = targetPixelWidth; canvas.height = targetPixelHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            const img = new Image();
            const url = URL.createObjectURL(new Blob([svgData], { type: "image/svg+xml;charset=utf-8" }));
            img.onload = () => { ctx.drawImage(img, 0, 0, targetPixelWidth, targetPixelHeight); URL.revokeObjectURL(url); this._download(canvas.toDataURL("image/png"), "funmacrosynteny_export.png"); };
            img.src = url;
        }
    }

    static async exportHTML(viz: SyntenyViz) {
        const state = viz.state;
        const dataPayload = {
            samples: state.samples,
            groupToIndex: Array.from(state.groupToIndex.entries()),
            colors: state.colors,
            userColors: state.userColors,
            config: viz.config,
            refGenomeId: state.refGenomeId,
            hiddenGenomes: Array.from(state.hiddenGenomes || [])
        };

        const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Synteny Analysis Report</title>
    <script src="https://d3js.org/d3.v7.min.js"><\/script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <style>
:root {
    --bg-color: #f1f5f9;
    --text-color: #0f172a;
    --sidebar-bg: #ffffff;
    --chrom-gray: #e2e8f0;
    --accent: #3b82f6;
}

body {
    font-family: 'Inter', sans-serif;
    background: var(--bg-color);
    color: var(--text-color);
    margin: 0;
    display: flex;
    height: 100vh;
    overflow: hidden;
}

/* Sidebars */
#sidebar-left {
    width: 350px;
    background: #fff;
    border-right: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    z-index: 20;
    box-shadow: 4px 0 24px rgba(0,0,0,0.02);
    transition: margin 0.3s ease;
}
#sidebar-right { 
    border-left: 1px solid #e2e8f0; 
    background: #fff;
    width: 350px;
    display: flex;
    flex-direction: column;
    z-index: 20;
    box-shadow: -4px 0 24px rgba(0,0,0,0.02);
    transition: margin 0.3s ease;
}

#sidebar-left.hidden { margin-left: -350px; }
#sidebar-right.hidden { margin-right: -350px; }

.icon-btn {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.icon-btn:hover {
    background: #f1f5f9;
    color: #475569;
}

.sidebar-header {
    padding: 1.5rem;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.sidebar-content {
    padding: 1.5rem;
    flex-grow: 1;
    overflow-y: auto;
}

.config-section { margin-bottom: 2rem; }
.config-title { font-weight: 600; font-size: 13px; color: #64748b; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }

.color-item { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.color-item input { border: none; width: 32px; height: 32px; cursor: pointer; background: none; }

.toggle-tab {
    position: fixed;
    background: white;
    border: 1px solid #e2e8f0;
    padding: 20px 6px;
    cursor: pointer;
    z-index: 1001;
    font-size: 14px;
    color: #475569;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-tab.left { 
    left: 350px; 
    top: 50%; 
    transform: translateY(-50%); 
    border-left: none; 
    border-radius: 0 8px 8px 0; 
}
.toggle-tab.left.is-hidden { left: 0; }

.toggle-tab.right { 
    right: 350px; 
    top: 50%; 
    transform: translateY(-50%); 
    border-right: none; 
    border-radius: 8px 0 0 8px; 
}
.toggle-tab.right.is-hidden { right: 0; }

.toggle-tab:hover {
    background: #f8fafc;
    color: #3b82f6;
    padding-right: 12px;
    padding-left: 12px;
}

/* Main Viz */
#main {
    flex: 1 1 0;
    width: 0;
    position: relative;
    padding: 2rem;
    background: #fff;
    margin: 1.5rem;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    overflow: auto;
    min-width: 0;
    min-height: 0;
}

.sample-group { cursor: default; }
.sample-label { font-weight: 600; font-size: 13px; fill: #475569; cursor: ns-resize; }

.chrom-group { cursor: ew-resize; }
.chrom-bar { fill: var(--chrom-gray); stroke: #cbd5e1; stroke-width: 1px; }
.chrom-name { 
    font-size: 11px; fill: #1e293b; text-anchor: middle; font-weight: 600;
}
.chrom-label-bg { pointer-events: none; }

.block-rect { stroke: none; } /* NO BLACK LINE */

.connector { stroke-width: 0px; pointer-events: none; }

#tooltip {
    position: fixed;
    background: #0f172a;
    color: white;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 11px;
    pointer-events: none;
    opacity: 0;
    z-index: 9999;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255,255,255,0.1);
}
.genome-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.genome-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    background: #f8fafc;
    border: 1px solid transparent;
    margin-bottom: 0px;
}
.genome-item:hover {
    background: #f1f5f9;
}
.genome-item.active-visible {
    background: #f1f5f9;
    border-color: #cbd5e1;
}
.genome-item.is-ref {
    border-color: #f59e0b;
    background: #fffbef;
}
.genome-item span:not(.sidebar-drag-handle) {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ref-btn {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
    padding: 2px 4px;
    font-size: 9px;
    cursor: pointer;
    color: #64748b;
}
.ref-btn.active {
    background: #f59e0b;
    color: white;
    border-color: #f59e0b;
}

.control-row-complex {
    margin-bottom: 20px;
}
.control-row-complex label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #64748b;
    margin-bottom: 8px;
}
.complex-input {
    display: flex;
    align-items: center;
    gap: 12px;
}
.complex-input input[type="range"] {
    flex: 1;
}
.complex-input input[type="number"] {
    padding: 4px 8px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 12px;
    color: #1e293b;
    outline: none;
}
.complex-input input[type="number"]:focus {
    border-color: #3b82f6;
}

.control-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}
.control-row label {
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: #64748b;
}
.control-row input[type="range"] {
    width: 80px;
    cursor: pointer;
}

#toaster-container {
    position: fixed;
    top: 24px;
    right: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 9999;
    pointer-events: none;
}

.toast {
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(12px);
    color: white;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255,255,255,0.15);
    pointer-events: auto;
    cursor: default;
    transition: opacity 0.5s ease-out, transform 0.5s ease-out;
    animation: toastSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes toastSlideIn {
    from { opacity: 0; transform: translateX(100px); }
    to { opacity: 1; transform: translateX(0); }
}

/* Rename Input */
.rename-input-container {
    position: fixed;
    z-index: 10000;
    background: white;
    padding: 6px;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    border: 1px solid #e2e8f0;
    display: flex;
    gap: 8px;
    animation: fadeIn 0.1s ease-out;
}

.rename-input {
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    width: 150px;
}

.rename-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Context Menu */
.context-menu {
    position: fixed;
    z-index: 10000;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    padding: 4px 0;
    min-width: 160px;
    animation: fadeIn 0.1s ease-out;
}

.context-menu-item {
    padding: 8px 12px;
    font-size: 13px;
    color: #1e293b;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.1s;
}

.context-menu-item:hover {
    background: #f1f5f9;
    color: #3b82f6;
}

.context-menu-item.danger {
    color: #ef4444;
}

.context-menu-item.danger:hover {
    background: #fef2f2;
}

.context-menu-item.has-submenu::after {
    content: "▶";
    font-size: 10px;
    margin-left: auto;
    color: #94a3b8;
}

.submenu {
    position: absolute;
    left: 100%;
    top: 0;
    margin-left: -2px;
}

/* Export Panel */
#export-panel {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    padding: 8px 16px;
    border-radius: 40px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid rgba(255, 255, 255, 0.5);
    transition: transform 0.2s ease, opacity 0.2s ease;
}

#export-panel:hover {
    background: rgba(255, 255, 255, 0.95);
    transform: translateX(-50%) translateY(-2px);
}

.export-label {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-right: 4px;
}

.export-btn {
    padding: 6px 14px;
    border-radius: 20px;
    border: 1px solid #e2e8f0;
    background: white;
    color: #475569;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
}

.export-btn:hover {
    border-color: #3b82f6;
    color: #3b82f6;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
}

.export-btn.primary {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
}

.export-btn.primary:hover {
    background: #2563eb;
    border-color: #2563eb;
    color: white;
}

        #export-panel { display: none !important; }
        .config-section:first-child { display: none !important; }
    </style>
</head>
<body>
    <div id="toaster-container"></div>
    <button id="toggle-sidebar-left" class="toggle-tab left">⇇</button>
    <div id="sidebar-left" class="sidebar">
        <div class="sidebar-header"><strong>Report Configuration</strong></div>
        <div class="sidebar-content">
            <div class="config-section">
                <div class="config-title">Genomes</div>
                <div id="genome-list" class="genome-list"></div>
            </div>
            <div class="config-section">
                <div class="config-title">Layout</div>
                <div class="control-row">
                    <label>Labels</label>
                    <input type="checkbox" id="cfg-showLabels" checked>
                </div>
                <div class="control-row">
                    <label>Free-form</label>
                    <input type="checkbox" id="cfg-freeFormAlignment">
                </div>
                <div class="control-row-complex">
                    <label>Spacing</label>
                    <div class="complex-input">
                        <input type="range" id="cfg-trackSpacing-slider" min="50" max="400">
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div id="main">
        <div id="tooltip"></div>
        <div id="viz"></div>
    </div>

    <script id="baked-data" type="application/json">
        ${JSON.stringify(dataPayload)}
    <\/script>

    <script>
// --- src/core/Store.js ---
/**
 * Store.js - Manages the "Genomic Truth" and "UI State".
 */

class Store {
    constructor() {
        this.state = {
            samples: [],
            colors: {},
            hiddenGenomes: new Set(),
            refGenomeId: null,
            focusChroms: new Set(),
            minSyntenySize: 0,
            colorMode: "ref",
            groupToIndex: new Map(),
            userColors: {},
            draggedSample: null,
            draggedChrom: null,
            hoveredFocusChromId: null,
            strandMap: new Map(),
            freeFormAlignment: false
        };
    }

    setSamples(samples, groupToIndex, strandMap) {
        this.state.samples = samples;
        this.state.groupToIndex = groupToIndex;
        this.state.strandMap = strandMap || new Map();

        // Ensure refGenomeId is valid for the new samples
        const currentRefExists = samples.some(s => s.id === this.state.refGenomeId);
        if (samples.length > 0 && (!this.state.refGenomeId || !currentRefExists)) {
            this.state.refGenomeId = samples[0].id;
        }
    }

    updateColoring(colors) {
        this.state.colors = colors;
    }

    toggleHiddenGenome(id) {
        if (this.state.hiddenGenomes.has(id)) {
            this.state.hiddenGenomes.delete(id);
        } else {
            this.state.hiddenGenomes.add(id);
        }
    }

    toggleFocusChrom(id) {
        if (this.state.focusChroms.has(id)) {
            this.state.focusChroms.delete(id);
        } else {
            this.state.focusChroms.add(id);
        }
    }

    setRefGenome(id) {
        this.state.refGenomeId = id;
    }

    setMinSyntenySize(size) {
        this.state.minSyntenySize = size;
    }

    setColorMode(mode) {
        this.state.colorMode = mode;
    }

    setDraggedSample(sample) {
        this.state.draggedSample = sample;
    }

    setDraggedChrom(chrom) {
        this.state.draggedChrom = chrom;
    }

    renameGenome(id, name) {
        const sample = this.state.samples.find(s => s.id === id);
        if (sample) {
            sample.name = name;
        }
    }

    updateGroupColor(groupId, color) {
        this.state.userColors[groupId] = color;
        this.state.colors[groupId] = color;
    }
}


// --- src/core/Engine.js ---
/**
 * Engine.js - "Headless" layout and coordinate calculations.
 */

class Engine {
    /**
     * Calculates the scene graph based on the current state and configuration.
     */
    static calculateScene(state, config) {
        let visibleSamples = state.samples.filter(s => !state.hiddenGenomes.has(s.id));
        const weights = this.calculateWeights(state.groupToIndex);

        const focusSet = new Set(state.focusChroms);
        if (state.hoveredFocusChromId) {
            focusSet.add(state.hoveredFocusChromId);
        }

        visibleSamples.forEach(s => {
            s.visualChroms = s.chroms.filter(c => {
                if (focusSet.size === 0) {
                    if (state.minSyntenySize === 0) return true;
                    return state.samples.some(s2 => {
                        if (s.id === s2.id) return false;
                        return s2.chroms.some(c2 => {
                            const w = weights.get([c.id, c2.id].sort().join("||"));
                            return w !== undefined && w >= state.minSyntenySize;
                        });
                    });
                }
                if (focusSet.has(c.id)) return true;
                return Array.from(focusSet).some(fId => {
                    const w = weights.get([c.id, fId].sort().join("||"));
                    return w !== undefined && w >= state.minSyntenySize;
                });
            });
        });

        visibleSamples = visibleSamples.filter(s => s.visualChroms.length > 0);
        visibleSamples.sort((a,b) => a.slot - b.slot).forEach((s, i) => s.visualSlot = i);

        visibleSamples.forEach(sample => {
            let currentX = 0;
            sample.visualChroms.sort((a,b) => a.x_index - b.x_index).forEach(c => {
                if (state.freeFormAlignment && c.customOffsetBp !== undefined) {
                    c.absX = c.customOffsetBp * config.scale;
                } else {
                    c.absX = currentX;
                }
                currentX = c.absX + (c.size * config.scale) + config.chromMargin;
            });
        });

        return { visibleSamples };
    }

    /**
     * Compiles weights for genome pairs based on link data.
     */
    static calculateWeights(groupToIndex) {
        const weights = new Map();
        groupToIndex.forEach((members) => {
            for (let i = 0; i < members.length; i++) {
                for (let j = i + 1; j < members.length; j++) {
                    const m1 = members[i];
                    const m2 = members[j];
                    if (m1.chromId === m2.chromId) continue;
                    const key = [m1.chromId, m2.chromId].sort().join("||");
                    weights.set(key, (weights.get(key) || 0) + (m1.end - m1.start)); 
                }
            }
        });
        return weights;
    }

    /**
     * Determines optimal scale to fit current data.
     */
    static autoScaleToFit(state, config) {
        if (!state.samples.length) return config.scale;

        const scene = this.calculateScene(state, config);
        const availableWidth = config.width - config.startX - 100;
        if (scene.visibleSamples.length === 0) return config.scale;

        let bestScale = 0.0001;
        let scaleAssigned = false;

        scene.visibleSamples.forEach(s => {
            const seqSize = d3.sum(s.visualChroms, c => c.size);
            const marginSize = Math.max(0, s.visualChroms.length - 1) * config.chromMargin;

            if (seqSize > 0) {
                const scl = Math.max(0, availableWidth - marginSize) / seqSize;
                if (!scaleAssigned || scl < bestScale) {
                    bestScale = scl;
                    scaleAssigned = true;
                }
            }
        });

        return scaleAssigned ? Math.max(1e-10, bestScale) : config.scale;
    }

    /**
     * Determines optimal track spacing to fit all genomes in view.
     */
    static autoScaleVertical(state, config, viewHeight) {
        const scene = this.calculateScene(state, config);
        const count = scene.visibleSamples.length;
        if (count <= 1) return config.trackSpacing;

        const effectiveHeight = viewHeight || config.height;
        const availableHeight = effectiveHeight - config.startY - 100;
        const idealSpacing = availableHeight / (count - 1);

        // Clamp between 60px (dense) and 200px (default sparse)
        return Math.max(60, Math.min(200, idealSpacing));
    }
}


// --- src/utils/Parsers.js ---
/**
 * Parsers.js - Logic for converting raw bioinformatics data into internal structures.
 */

class Parsers {
    /**
     * Parses a TSV string into samples and blocks.
     * @param {string} tsvText - The raw TSV data.
     * @returns {Object} { samplesMap, groupToIndex, detectedStrandColumn, hasInvertedBlocks }
    static parseTSV(tsvText) {
        const rows = d3.tsvParse(tsvText);
        const samplesMap = new Map();
        const groupToIndex = new Map();
        const strandMap = new Map();
        
        const detectedStrandColumn = !!(rows.columns && rows.columns.includes("strand"));
        let hasInvertedBlocks = false;

        rows.forEach(row => {
            const b1 = row.bin_id;
            const b2 = row.bin_id2;
            const s1 = row.seq_id;
            const seq2 = row.seq_id2;
            const gid = row.block_id;
            const hasLink = (b2 && b2 !== "null" && seq2 && seq2 !== "null");

            const touch = (bin, seq, st, en, block, isSecondBlock) => {
                if (!bin || bin === "null") return null;
                if (!samplesMap.has(bin)) samplesMap.set(bin, { id: bin, name: bin, chroms: new Map() });
                const sample = samplesMap.get(bin);
                const chromId = \`\${bin}||\${seq}\`;
                if (!sample.chroms.has(seq)) sample.chroms.set(seq, { id: chromId, name: seq, size: 0, blocks: [], sampleId: bin });
                const chrom = sample.chroms.get(seq);
                
                const startRaw = parseInt(st);
                const endRaw = parseInt(en);
                const startMin = Math.min(startRaw, endRaw);
                const endMax = Math.max(startRaw, endRaw);

                chrom.size = Math.max(chrom.size, endMax);

                let blockObj = chrom.blocks.find(b => b.group === block);
                if (blockObj) {
                    if (hasLink) {
                        blockObj.linked = true;
                        if (!groupToIndex.has(block)) groupToIndex.set(block, []);
                        const arr = groupToIndex.get(block);
                        if (!arr.includes(blockObj)) {
                            arr.push(blockObj);
                        }
                    }
                    return blockObj;
                }

                blockObj = {
                    group: block,
                    start: startMin,
                    end: endMax,
                    tsvStart: startMin,
                    tsvEnd: endMax,
                    inverted: false,
                    linked: hasLink,
                    sampleId: bin,
                    chromId: chromId
                };
                
                chrom.blocks.push(blockObj);

                if (hasLink) {
                    if (!groupToIndex.has(block)) groupToIndex.set(block, []);
                    groupToIndex.get(block).push(blockObj);
                }
                return blockObj;
            };

            touch(b1, s1, row.start, row.end, gid, false);
            if (hasLink) {
                touch(b2, seq2, row.start2, row.end2, gid, true);
                const linkKey = \`\${gid}||\${b1}||\${b2}\`;
                strandMap.set(linkKey, row.strand || "+");
                if (row.strand === "-") {
                    hasInvertedBlocks = true;
                }
            }
        });

        return { samplesMap, groupToIndex, detectedStrandColumn, hasInvertedBlocks, strandMap };
    }
}


// --- src/utils/ColorPalettes.js ---
/**
 * ColorPalettes.js - Reference-centric and global coloring logic.
 */

class ColorPalettes {
    /**
     * Applies color mapping based on the reference genome.
     */
    static applyReferenceColoring(state) {
        const ref = state.samples.find(s => s.id === state.refGenomeId);
        if (!ref) return {};

        const palette = d3.schemeCategory10.concat(d3.schemeAccent);
        const colors = {};
        ref.chroms.forEach((c, i) => {
            const color = palette[i % palette.length];
            c.blocks.forEach(b => {
                if (b.linked) colors[b.group] = color;
            });
        });
        return colors;
    }

    /**
     * Applies global color mapping for all linked blocks.
     */
    static applyGlobalColoring(state) {
        const palette = d3.schemeTableau10;
        let pIdx = 0;
        const colors = {};
        state.samples.forEach(s => 
            s.chroms.forEach(c => 
                c.blocks.forEach(b => {
                    if (b.linked && !colors[b.group]) {
                        colors[b.group] = palette[pIdx++ % palette.length];
                    }
                })
            )
        );
        return colors;
    }
}


// --- src/renderers/Tooltip.js ---
/**
 * Tooltip.js - Logic for showing/hiding tooltips.
 */

class Tooltip {
    constructor(selector = "#tooltip") {
        this.el = d3.select(selector).empty() ? 
            d3.select("body").append("div").attr("id", "tooltip").attr("class", "tooltip") : 
            d3.select(selector);
    }

    show(e, content) {
        this.el.style("display", "block")
            .style("opacity", 1)
            .html(content);
        this.move(e);
    }

    move(e) {
        const node = this.el.node();
        const tw = node.offsetWidth;
        const th = node.offsetHeight;
        
        let tx = e.clientX + 15;
        let ty = e.clientY + 15;
        
        // Overflow checks
        if (tx + tw > window.innerWidth - 20) tx = e.clientX - tw - 15;
        if (ty + th > window.innerHeight - 20) ty = e.clientY - th - 15;
        
        this.el.style("left", tx + "px").style("top", ty + "px");
    }

    hide() {
        this.el.style("display", "none").style("opacity", 0);
    }
}


// --- src/renderers/TrackRenderer.js ---
/**
 * TrackRenderer.js - Renders genomes, chromosomes, and handle drag interactions.
 */

class TrackRenderer {
    constructor(viz) {
        this.viz = viz;
        this.trackLayer = viz.trackLayer;
    }

    render(visibleSamples, animate) {
        const { config, state } = this.viz;
        const duration = animate ? 300 : 0;

        const tracks = this.trackLayer.selectAll(".sample-group").data(visibleSamples, d => d.id);
        tracks.exit().remove();

        const tracksEnter = tracks.enter().append("g").attr("class", "sample-group")
            .attr("id", d => \`track-\${d.id.replace(/[^a-zA-Z0-9-]/g, '_')}\`);

        // Handles for drag and rename
        tracksEnter.append("rect").attr("class", "track-hit-area")
            .attr("x", -config.startX).attr("y", 0)
            .attr("width", config.startX).attr("height", config.chromHeight)
            .attr("fill", "rgba(0,0,0,0)")
            .style("cursor", "pointer")
            .on("contextmenu", (e, d) => {
                e.preventDefault();
                e.stopPropagation();
                this._showRenameInput(e, d);
            });

        tracksEnter.append("text").attr("class", "sample-label")
            .attr("x", -10).attr("y", config.chromHeight/2)
            .attr("text-anchor", "end").attr("dominant-baseline", "middle")
            .style("cursor", "pointer")
            .style("pointer-events", "none");

        const tracksMerged = tracks.merge(tracksEnter);

        // --- Track Dragging Logic ---
        tracksMerged.call(d3.drag()
            .on("start", (e, d) => {
                state.draggedSample = d;
                this.viz.tooltip.hide();
                const [mx, my] = d3.pointer(e, this.trackLayer.node());
                d.dragOffsetY = my - (config.startY + d.visualSlot * config.trackSpacing);
                d3.select(e.sourceEvent.target.parentNode).raise();
            })
            .on("drag", (e, d) => {
                const [mx, my] = d3.pointer(e, this.trackLayer.node());
                d.currentDragY = my - d.dragOffsetY;
                d3.select(document.getElementById(\`track-\${d.id.replace(/[^a-zA-Z0-9-]/g, '_')}\`)).attr("transform", \`translate(\${config.startX}, \${d.currentDragY})\`);

                state.samples.forEach(other => {
                    if (other === d) return;
                    const otherY = config.startY + other.visualSlot * config.trackSpacing;
                    if ((d.slot < other.slot && d.currentDragY > otherY - 40) || 
                        (d.slot > other.slot && d.currentDragY < otherY + 40)) {
                        const tmp = d.slot; d.slot = other.slot; other.slot = tmp;
                        this.viz.render(true);
                    }
                });
                this.viz.renderLinks(); 
            })
            .on("end", (e, d) => {
                state.draggedSample = null;
                this.viz.render();
            })
        );

        tracksMerged.select(".sample-label")
            .text(d => d.name)
            .attr("font-family", "'Inter', sans-serif")
            .attr("font-weight", "600")
            .attr("font-size", config.labelSize + "px")
            .attr("fill", "#475569");

        // Localized contextmenu for renaming
        tracksMerged.on("contextmenu", (e, d) => {
            // Only trigger if we aren't clicking a chromosome
            if (e.target.closest(".chrom-group")) return;

            e.preventDefault();
            e.stopPropagation();
            this._showRenameInput(e, d);
        });

        let selection = tracksMerged.filter(d => d !== state.draggedSample);
        if (animate) {
            selection.transition().duration(300)
                .attr("transform", d => \`translate(\${config.startX}, \${config.startY + d.visualSlot * config.trackSpacing})\`);
        } else {
            selection.attr("transform", d => \`translate(\${config.startX}, \${config.startY + d.visualSlot * config.trackSpacing})\`);
        }

        tracksMerged.filter(d => d === state.draggedSample)
            .attr("transform", d => \`translate(\${config.startX}, \${d.currentDragY})\`);

        tracksMerged.each((d, i, nodes) => {
            this._renderChromosomes(d3.select(nodes[i]), d, animate);
        });
    }

    _renderChromosomes(container, sample, animate) {
        const { config, state } = this.viz;
        const duration = animate ? 300 : 0;

        const chroms = container.selectAll(".chrom-group").data(sample.visualChroms, d => d.id);
        chroms.exit().remove();

        const chromsEnter = chroms.enter().append("g").attr("class", "chrom-group")
            .attr("id", d => \`chrom-\${d.id.replace(/[^a-zA-Z0-9-]/g, '_')}\`)
            .on("dblclick", (e, d) => {
                e.stopPropagation();
                d.inverted = !d.inverted;
                this.viz.render();
            })
            .on("contextmenu", (e, d) => {
                e.preventDefault();
                e.stopPropagation();
                this._showChromContextMenu(e, d);
            })
        const self = this;
        chromsEnter.call(d3.drag()
            .on("start", function(e, d) {
                state.draggedChrom = d;
                self.viz.tooltip.hide();
                const [mx] = d3.pointer(e, container.node());
                d.dragOffsetX = mx - d.absX;
                d3.select(this).raise();
            })
            .on("drag", (e, d) => {
                const [mx] = d3.pointer(e, container.node());
                d.currentDragX = mx - d.dragOffsetX;

                if (state.freeFormAlignment) {
                    const leftSiblings = sample.visualChroms.filter(other => other !== d && (other.x_index ?? 0) < (d.x_index ?? 0)).sort((a, b) => (b.x_index ?? 0) - (a.x_index ?? 0));
                    const rightSiblings = sample.visualChroms.filter(other => other !== d && (other.x_index ?? 0) > (d.x_index ?? 0)).sort((a, b) => (a.x_index ?? 0) - (b.x_index ?? 0));
                    const leftSib = leftSiblings[0];
                    const rightSib = rightSiblings[0];
                    const limitLeft = leftSib ? leftSib.absX + (leftSib.size * config.scale) + config.chromMargin : 0;
                    const limitRight = rightSib ? rightSib.absX - (d.size * config.scale) - config.chromMargin : Infinity;
                    d.currentDragX = Math.max(limitLeft, Math.min(limitRight, d.currentDragX));
                }

                d3.select(document.getElementById(\`chrom-\${d.id.replace(/[^a-zA-Z0-9-]/g, '_')}\`)).attr("transform", \`translate(\${d.currentDragX}, 0)\`);

                if (!state.freeFormAlignment) {
                    const center = d.currentDragX + (d.size * config.scale) / 2;
                    sample.visualChroms.forEach(other => {
                        if (other === d) return;
                        const otherCenter = other.absX + (other.size * config.scale) / 2;
                        if ((d.x_index < other.x_index && center > otherCenter) || 
                            (d.x_index > other.x_index && center < otherCenter)) {
                            const tmp = d.x_index; d.x_index = other.x_index; other.x_index = tmp;
                            this.viz.render(true);
                        }
                    });
                } else {
                    d.absX = d.currentDragX;
                }
                this.viz.renderLinks();
            })
            .on("end", (e, d) => {
                state.draggedChrom = null;
                if (state.freeFormAlignment) {
                    d.customOffsetBp = d.currentDragX / config.scale;
                }
                this.viz.render();
            })
        );

        chromsEnter.append("rect").attr("class", "chrom-bar")
            .attr("height", config.chromHeight).attr("rx", 4)
            .style("cursor", "pointer")
            .on("mouseover", (e, d) => {
                if (state.draggedChrom || state.draggedSample) {
                    this.viz.tooltip.hide();
                    return;
                }
                this.viz.tooltip.show(e, \`<strong>Chromosome: \${d.name}</strong><br>Total Size: \${d3.format(",")(d.size)} bp\`);
            })
            .on("mousemove", (e, d) => {
                if (state.draggedChrom || state.draggedSample) {
                    this.viz.tooltip.hide();
                    return;
                }
                const [mx] = d3.pointer(e);
                let pos = Math.round(mx / config.scale);
                if (d.inverted) pos = d.size - pos;
                pos = Math.max(0, Math.min(d.size, pos));

                // Find the gap range
                const sorted = [...d.blocks].sort((a,b) => a.start - b.start);
                let start = 0, end = d.size;
                for (const b of sorted) {
                    if (b.end <= pos) start = Math.max(start, b.end + 1); // Zarul edited here
                    if (b.start > pos) {
                        end = b.start - 1 ; // Zarul edited here
                        break;
                    }
                }

                this.viz.tooltip.show(e, \`
                    <strong>Chromosome: \${d.name}</strong><br>
                    <em>Non-syntenic region</em><br>
                    Start: \${start.toLocaleString()}<br>
                    End: \${end.toLocaleString()}<br>
                    Size: \${(end - start).toLocaleString()} bp
                \`);
            })
            .on("mouseout", () => this.viz.tooltip.hide());

        chromsEnter.append("rect").attr("class", "chrom-label-bg")
            .attr("fill", "rgba(255, 255, 255, 0.8)")
            .attr("rx", 3);
        chromsEnter.append("text").attr("class", "chrom-name")
            .attr("dominant-baseline", "hanging");

        const chromsMerged = chroms.merge(chromsEnter);
        
        const chromsT = chromsMerged.filter(d => d !== state.draggedChrom);
        if (animate) {
            chromsT.transition().duration(duration)
                .attr("transform", d => \`translate(\${d.absX}, 0)\`);
        } else {
            chromsT.attr("transform", d => \`translate(\${d.absX}, 0)\`);
        }

        chromsMerged.filter(d => d === state.draggedChrom)
            .attr("transform", d => \`translate(\${d.currentDragX}, 0)\`);

        chromsMerged.select(".chrom-bar")
            .attr("width", d => d.size * config.scale)
            .style("stroke-width", \`\${config.chromStrokeWidth}px\`)
            .style("stroke", config.chromStrokeWidth > 0 ? "black" : "#cbd5e1");
        
        chromsMerged.select(".chrom-name")
            .attr("x", d => (d.size * config.scale) / 2)
            .attr("y", config.chromHeight + (config.chromStrokeWidth / 2) + 8)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "hanging")
            .style("font-family", "'Inter', sans-serif")
            .style("font-size", \`\${config.labelSize}px\`)
            .style("font-weight", "600")
            .text(d => (d.marker ? d.marker + " " : "") + d.name + (d.inverted ? " (rev)" : ""))
            .attr("opacity", config.showLabels ? 1 : 0)
            .each(function(d) {
                const labelText = (d.marker ? d.marker + " " : "") + d.name + (d.inverted ? " (rev)" : "");
                const textWidth = TrackRenderer.measureText(labelText, \`600 \${config.labelSize}px 'Inter', sans-serif\`);
                const textHeight = config.labelSize * 1.2;
                
                d3.select(this.parentNode).select(".chrom-label-bg")
                    .attr("x", (d.size * config.scale) / 2 - textWidth / 2 - 6)
                    .attr("y", config.chromHeight + (config.chromStrokeWidth / 2) + 8 - 2)
                    .attr("width", textWidth + 12)
                    .attr("height", textHeight + 0)
                    .attr("opacity", config.showLabels ? 1 : 0);
            });

        this._renderBlocks(chromsMerged);
    }

    _renderBlocks(chromsContainer) {
        const { config, state, tooltip } = this.viz;
        const blocks = chromsContainer.selectAll(".block-rect").data(d => d.blocks);
        blocks.exit().remove();
        
        blocks.enter().append("rect").attr("class", "block-rect").attr("height", config.chromHeight)
            .on("mouseover", (e, b) => {
                e.stopPropagation();
                if (state.draggedChrom || state.draggedSample) {
                    tooltip.hide();
                    return;
                }
                const size = (b.end - b.start).toLocaleString();
                tooltip.show(e, \`<strong>\${b.chromId}</strong><br>Block: \${b.group}<br>Start: \${b.start.toLocaleString()}<br>End: \${b.end.toLocaleString()}<br>Size: \${size} bp<br>Inverted: \${b.inverted}\`);
            })
            .on("click", (e, b) => {
                e.stopPropagation();
                const size = (b.end - b.start).toLocaleString();
                this.viz.showToast(\`\${b.chromId}:\${b.start.toLocaleString()}-\${b.end.toLocaleString()} [Block \${b.group}, size = \${size} bp]\`);
            })
            .on("contextmenu", (e, b) => {
                e.preventDefault();
                e.stopPropagation();
                // Get the parent chromosome datum
                const chrom = d3.select(e.currentTarget.parentNode).datum();
                this._showChromContextMenu(e, chrom, b);
            })
            .on("mouseout", (e) => {
                e.stopPropagation();
                tooltip.hide();
            })
            .merge(blocks)
            .attr("x", (b, i, nodes) => {
                const chrom = d3.select(nodes[i].parentNode).datum();
                return chrom.inverted ? (chrom.size - b.end) * config.scale : b.start * config.scale;
            })
            .attr("width", b => (b.end - b.start) * config.scale)
            .attr("fill", b => b.linked ? (state.colors[b.group] || "#e2e8f0") : "#cbd5e1");
    }

    _showRenameInput(event, sample) {
        // Remove any existing rename inputs
        d3.selectAll(".rename-input-container").remove();

        const container = d3.select("body").append("div")
            .attr("class", "rename-input-container")
            .style("left", \`\${event.clientX}px\`)
            .style("top", \`\${event.clientY}px\`);

        const input = container.append("input")
            .attr("class", "rename-input")
            .attr("type", "text")
            .attr("value", sample.name);

        input.node().focus();
        input.node().select();

        const submit = () => {
            const newName = input.property("value").trim();
            if (newName && newName !== sample.name) {
                this.viz.renameGenome(sample.id, newName);
                this.viz.showToast(\`Renamed \${sample.id} to \${newName}\`);
            }
            container.remove();
        };

        input.on("keydown", (e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") container.remove();
        });

        // Close when clicking outside
        setTimeout(() => {
            d3.select(window).on("click.rename-closer", (e) => {
                if (!container.node().contains(e.target)) {
                    container.remove();
                    d3.select(window).on("click.rename-closer", null);
                }
            });
        }, 10);
    }

    _showChromContextMenu(event, d, b = null) {
        const { state } = this.viz;
        d3.selectAll(".context-menu").remove();

        const menu = d3.select("body").append("div")
            .attr("class", "context-menu")
            .style("left", \`\${event.clientX}px\`)
            .style("top", \`\${event.clientY}px\`);

        let submenu = null;
        const removeSubmenu = () => {
            if (submenu) {
                submenu.remove();
                submenu = null;
            }
        };

        // If a block was right-clicked, add the color option first
        if (b) {
            const colorItem = menu.append("div").attr("class", "context-menu-item")
                .style("border-bottom", "1px solid #f1f5f9")
                .style("margin-bottom", "4px")
                .style("background", "#f8fafc")
                .html(\`🎨 Change Color (Group \${b.group})\`);
            
            colorItem.on("mouseenter", removeSubmenu);
            colorItem.on("click", () => {
                const picker = d3.select("body").append("input")
                    .attr("type", "color")
                    .style("position", "fixed")
                    .style("opacity", 0)
                    .attr("value", this.viz.state.colors[b.group] || "#3b82f6");

                picker.on("input", () => {
                    this.viz.updateGroupColor(b.group, picker.property("value"));
                });

                picker.on("change", () => {
                    picker.remove();
                    menu.remove();
                });

                picker.node().click();
            });
        }

        // Option 1: Focus/Unfocus
        const isFocused = state.focusChroms.has(d.id);
        const focusItem = menu.append("div").attr("class", "context-menu-item")
            .html(\`🎯 \${isFocused ? 'Remove Focus' : 'Focus Chromosome'}\`);
        
        focusItem.on("mouseenter", removeSubmenu);
        focusItem.on("click", () => {
            if (d.sampleId !== state.refGenomeId) {
                this.viz.showToast(\`Your ref genome is \${state.refGenomeId}, pick chroms from \${state.refGenomeId}\`);
                menu.remove();
                return;
            }
            if (isFocused) state.focusChroms.delete(d.id);
            else state.focusChroms.add(d.id);

            this.viz.showToast(isFocused ? \`Focus removed for \${d.name}\` : \`Focused on \${d.name}\`);
            this.viz.emit('focusChanged');
            this.viz.autoScaleToFit();
            menu.remove();
        });

        // Option 1b: Select as Reference Genome
        const isRef = state.refGenomeId === d.sampleId;
        if (!isRef) {
            const refItem = menu.append("div").attr("class", "context-menu-item")
                .html(\`🧬 Select as Reference Genome\`);
            
            refItem.on("mouseenter", removeSubmenu);
            refItem.on("click", () => {
                this.viz.store.setRefGenome(d.sampleId);
                state.focusChroms.clear();
                if (state.colorMode === "ref") {
                    this.viz.applyColoring();
                }
                this.viz.showToast(\`Reference changed to: \${d.sampleId}\`);
                this.viz.emit('refChanged');
                this.viz.autoScaleToFit();
                menu.remove();
            });
        }

        // Option 2: Reverse Orientation
        const reverseItem = menu.append("div").attr("class", "context-menu-item")
            .html(\`🔄 \${d.inverted ? 'Restore Orientation' : 'Reverse Orientation'}\`);
        
        reverseItem.on("mouseenter", removeSubmenu);
        reverseItem.on("click", () => {
            d.inverted = !d.inverted;
            this.viz.showToast(\`\${d.inverted ? 'Reversed' : 'Restored'} orientation for \${d.name}\`);
            this.viz.render();
            menu.remove();
        });

        // Option 3: Align with Neighbors
        const visibleSamples = this.viz.sceneGraph.visibleSamples;
        const targetIdx = visibleSamples.findIndex(s => s.id === d.sampleId);
        
        if (targetIdx !== -1) {
            const neighbors = [];
            if (targetIdx > 0) neighbors.push({ type: 'Above', sample: visibleSamples[targetIdx - 1] });
            if (targetIdx < visibleSamples.length - 1) neighbors.push({ type: 'Below', sample: visibleSamples[targetIdx + 1] });

            neighbors.forEach(n => {
                const alignItem = menu.append("div").attr("class", "context-menu-item")
                    .html(\`📏 Align to \${n.sample.name} (\${n.type})\`);
                
                const node = alignItem.node();
                node.onmouseenter = () => removeSubmenu();
                node.onclick = (e) => {
                    e.stopPropagation();
                    console.log(\`Attempting align: \${d.sampleId} -> \${n.sample.id}\`);
                    try {
                        this.viz.sortChromosomesByNeighbor(d.sampleId, n.sample.id);
                        menu.remove();
                    } catch (err) {
                        console.error("Alignment error:", err);
                        this.viz.showToast("Alignment failed: " + err.message);
                    }
                };
            });
        }

        // Option 4: Markers (Submenu)
        const markerItem = menu.append("div")
            .attr("class", "context-menu-item has-submenu")
            .style("border-top", "1px solid #f1f5f9")
            .style("margin-top", "4px")
            .html(\`🏷️ Set Marker\`);

        markerItem.on("mouseenter", () => {
            removeSubmenu();
            submenu = menu.append("div").attr("class", "context-menu submenu")
                .style("width", "160px")
                .style("padding", "8px")
                .style("background", "rgba(255, 255, 255, 0.95)")
                .style("backdrop-filter", "blur(8px)")
                .style("border-radius", "8px")
                .style("border", "1px solid #e2e8f0");
            
            const gridContainer = submenu.append("div")
                .style("display", "grid")
                .style("grid-template-columns", "repeat(4, 1fr)")
                .style("gap", "6px")
                .style("margin-bottom", "8px");

            const markers = ["🚩", "🚨", "👍", "🌟", "😢", "💸", "🤔", "🔍", "📌", "❤️", "⚠️", "✅", "🧬", "🔬", "📍", "💬"];

            markers.forEach(emoji => {
                const cell = gridContainer.append("div")
                    .style("font-size", "18px")
                    .style("padding", "4px")
                    .style("cursor", "pointer")
                    .style("text-align", "center")
                    .style("user-select", "none")
                    .style("transition", "transform 0.1s ease-in-out")
                    .html(emoji);

                cell.on("mouseenter", function() {
                    d3.select(this).style("transform", "scale(1.25)");
                });
                cell.on("mouseleave", function() {
                    d3.select(this).style("transform", "scale(1)");
                });

                cell.on("click", (e) => {
                    e.stopPropagation();
                    d.marker = emoji;
                    this.viz.render();
                    menu.remove();
                    this.viz.showToast(\`Added \${emoji} to \${d.name}\`);
                });
            });

            const clearBtn = submenu.append("div")
                .attr("class", "context-menu-item")
                .style("text-align", "center")
                .style("border-top", "1px solid #f1f5f9")
                .style("padding-top", "6px")
                .style("color", "#ef4444")
                .style("font-weight", "500")
                .html("❌ Clear Marker");

            clearBtn.on("click", (e) => {
                e.stopPropagation();
                d.marker = null;
                this.viz.render();
                menu.remove();
                this.viz.showToast(\`Cleared marker for \${d.name}\`);
            });
        });

        // Close when clicking outside
        setTimeout(() => {
            d3.select(window).on("click.menu-closer", (e) => {
                if (!menu.node().contains(e.target)) {
                    menu.remove();
                    d3.select(window).on("click.menu-closer", null);
                }
            });
        }, 10);
    }

    static measureText(text, font) {
        if (!this.canvas) {
            this.canvas = document.createElement("canvas");
        }
        const context = this.canvas.getContext("2d");
        context.font = font;
        return context.measureText(text).width;
    }

}


// --- src/renderers/LinkRenderer.js ---
/**
 * LinkRenderer.js - Renders synteny ribbons between tracks.
 */

class LinkRenderer {
    constructor(viz) {
        this.viz = viz;
        this.linkLayer = viz.linkLayer;
    }

    render(visibleSamples) {
        const { state, config } = this.viz;
        const linksData = [];
        
        const getTrackY = (sampleId) => {
            const node = document.getElementById(\`track-\${sampleId.replace(/[^a-zA-Z0-9-]/g, '_')}\`);
            if (node) {
                const transform = d3.select(node).attr("transform");
                if (transform) {
                    const match = transform.match(/translate\\(([^,\\s]+)[,\\s]+([^)]+)\\)/);
                    if (match) return parseFloat(match[2]);
                }
            }
            const s = state.samples.find(sample => sample.id === sampleId);
            return config.startY + (s ? s.visualSlot : 0) * config.trackSpacing;
        };

        const getChromX = (sampleId, chromId) => {
            const node = document.getElementById(\`chrom-\${chromId.replace(/[^a-zA-Z0-9-]/g, '_')}\`);
            if (node) {
                const transform = d3.select(node).attr("transform");
                if (transform) {
                    const match = transform.match(/translate\\(([^,\\s]+)[,\\s]+([^)]+)\\)/);
                    if (match) return parseFloat(match[1]);
                }
            }
            const s = state.samples.find(sample => sample.id === sampleId);
            const c = s ? s.chroms.find(ch => ch.id === chromId) : null;
            return c ? c.absX : 0;
        };

        // O(n) Link Generation
        for (let i = 0; i < visibleSamples.length - 1; i++) {
            const s1 = visibleSamples[i];
            const s2 = visibleSamples[i+1];
            
            s1.visualChroms.forEach(c1 => {
                c1.blocks.forEach(b1 => {
                    if (!b1.linked) return;
                    const members = state.groupToIndex.get(b1.group);
                    if (!members) return;
                    const partners = members.filter(p => p.sampleId === s2.id);
                    
                    partners.forEach(b2 => {
                        const c2 = s2.visualChroms.find(vc => vc.id === b2.chromId);
                        if (!c2) return;

                        const y1 = getTrackY(s1.id) + config.chromHeight;
                        const y2 = getTrackY(s2.id);
                        
                        const x1_offset = getChromX(s1.id, c1.id);
                        const x2_offset = getChromX(s2.id, c2.id);

                        const getX = (chrom, offset, bp) => {
                            const base = config.startX + offset;
                            return chrom.inverted ? base + (chrom.size - bp) * config.scale : base + bp * config.scale;
                        };

                        const linkKey = \`\${b1.group}||\${b1.sampleId}||\${b2.sampleId}\`;
                        const strand = state.strandMap.get(linkKey) || "+";

                        if (strand === "-") {
                            linksData.push({
                                group: b1.group,
                                path: [
                                    [getX(c1, x1_offset, b1.tsvStart), y1],
                                    [getX(c1, x1_offset, b1.tsvEnd), y1],
                                    [getX(c2, x2_offset, b2.tsvStart), y2],
                                    [getX(c2, x2_offset, b2.tsvEnd), y2]
                                ]
                            });
                        } else {
                            linksData.push({
                                group: b1.group,
                                path: [
                                    [getX(c1, x1_offset, b1.tsvStart), y1],
                                    [getX(c1, x1_offset, b1.tsvEnd), y1],
                                    [getX(c2, x2_offset, b2.tsvEnd), y2],
                                    [getX(c2, x2_offset, b2.tsvStart), y2]
                                ]
                            });
                        }
                    });
                });
            });
        }

        const paths = this.linkLayer.selectAll(".connector").data(linksData);
        paths.exit().remove();
        paths.enter().append("path").attr("class", "connector")
            .merge(paths)
            .attr("fill", d => state.colors[d.group])
            .attr("opacity", 0.3)
            .attr("d", d => {
                const p = d3.path();
                p.moveTo(d.path[0][0], d.path[0][1]);
                p.lineTo(d.path[1][0], d.path[1][1]);
                p.lineTo(d.path[2][0], d.path[2][1]);
                p.lineTo(d.path[3][0], d.path[3][1]);
                p.closePath();
                return p.toString();
            });
    }
}


// --- src/core/Core.js ---
/**
 * Core.js - The main entry point and event coordinator.
 */
// import { Store } from './Store.js';
// import { Engine } from './Engine.js';
// import { TrackRenderer } from '../renderers/TrackRenderer.js';
// import { LinkRenderer } from '../renderers/LinkRenderer.js';
// import { Tooltip } from '../renderers/Tooltip.js';
// import { Parsers } from '../utils/Parsers.js';
// import { ColorPalettes } from '../utils/ColorPalettes.js';

class SyntenyViz {
    constructor(selector, config = {}) {
        this.container = d3.select(selector);
        const node = this.container.node();
        const initialWidth = node ? node.clientWidth - 64 : 800;
        const initialHeight = node ? node.clientHeight - 64 : 600;

        this.svg = this.container.select("svg").empty() ? this.container.append("svg") : this.container.select("svg");
        this.svg.attr("width", initialWidth).attr("height", initialHeight);

        // Setup layers
        this.linkLayer = this.svg.select(".links").empty() ? this.svg.append("g").attr("class", "links") : this.svg.select(".links");
        this.trackLayer = this.svg.select(".tracks").empty() ? this.svg.append("g").attr("class", "tracks") : this.svg.select(".tracks");

        this.store = new Store();
        this.state = this.store.state; // Convenience alias

        this.config = {
            ...{
                width: initialWidth,
                height: initialHeight,
                trackSpacing: 180,
                chromHeight: 25,
                chromMargin: 20,
                labelSize: 11,
                chromStrokeWidth: 1,
                scale: 0.0001,
                startX: 200,
                startY: 100,
                showLabels: true,
                zoom: 1.0,
                scaleBarMb: 1.0,
                showScaleBar: true
            },
            ...config
        };

        this.tooltip = new Tooltip();
        this.trackRenderer = new TrackRenderer(this);
        this.linkRenderer = new LinkRenderer(this);

        this.listeners = new Map();
        this._initResizeHandler();
    }

    // --- EVENT SYSTEM ---
    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(callback);
        return this;
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(data));
        }
    }

    use(plugin) {
        plugin.install(this);
        return this;
    }

    // --- DATA LOADING ---
    async loadTSV(file) {
        const text = await file.text();
        await this.setData(text);
    }

    async setData(tsvText) {
        const { samplesMap, groupToIndex, detectedStrandColumn, hasInvertedBlocks, strandMap } = Parsers.parseTSV(tsvText);

        if (detectedStrandColumn && hasInvertedBlocks) {
            await this.showDisclaimer(
                "ℹ️ Inversion Detection",
                "We detected a 'strand' column in your link data, indicating inversions are encoded via strands. The parser will automatically twist corresponding synteny ribbons to represent inversions correctly."
            );
        } else if (hasInvertedBlocks) {
            await this.showDisclaimer(
                "ℹ️ Inversion Detection",
                "We detected coordinate-reversed inversions (start > end) in your link data. The parser will automatically twist corresponding synteny ribbons to represent inversions correctly."
            );
        }

        const samples = [];
        let slot = 0;
        samplesMap.forEach((sInfo, id) => {
            const chroms = Array.from(sInfo.chroms.values()).map((c, i) => ({ ...c, x_index: i, genomicIndex: i }));
            samples.push({ id, name: id, slot: slot++, chroms });
        });

        this.store.setSamples(samples, groupToIndex, strandMap);
        this.emit('dataLoaded', samples);

        if (samples.length > 0) {
            this.applyColoring();
            // Wait for DOM to settle
            requestAnimationFrame(() => {
                this.autoScaleToFit();
            });
        }
    }

    // --- COMMANDS ---
    applyColoring() {
        let colors;
        if (this.state.colorMode === "ref") {
            colors = ColorPalettes.applyReferenceColoring(this.state);
        } else {
            colors = ColorPalettes.applyGlobalColoring(this.state);
        }

        // Apply user overrides
        Object.keys(this.state.userColors).forEach(groupId => {
            colors[groupId] = this.state.userColors[groupId];
        });

        this.store.updateColoring(colors);
        this.emit('colorChanged', colors);
        this.render(false);
    }

    updateGroupColor(groupId, color) {
        this.store.updateGroupColor(groupId, color);
        this.render(false);
    }

    autoScaleToFit() {
        const container = this.container.node();
        const parent = container ? container.parentNode : null;

        if (parent) {
            this.config.width = parent.clientWidth - 64;
        } else if (container) {
            this.config.width = container.clientWidth - 64;
        }

        // IMPORTANT: Use the scrollable PARENT (main) height for the fit calculation
        const viewHeight = parent ? parent.clientHeight : 800;

        if (viewHeight > 0) {
            this.config.height = viewHeight - 64;
        }

        const fitScale = Engine.autoScaleToFit(this.state, this.config);
        this.config.trackSpacing = Engine.autoScaleVertical(this.state, this.config, viewHeight);

        // Update the base "Perfect Fit" scale
        this.state.baseScale = fitScale;

        // Apply current zoom multiplier to the base scale
        this.config.scale = this.state.baseScale * (this.config.zoom || 1.0);

        this.emit('scaleChanged', this.config.scale);
        this.emit('spacingChanged', this.config.trackSpacing);
        this.render();
    }

    render(animate = true) {
        this.sceneGraph = Engine.calculateScene(this.state, this.config);

        // Hard limit check
        if (this.sceneGraph.visibleSamples.length > 15) {
            this.trackLayer.selectAll("*").remove();
            this.linkLayer.selectAll("*").remove();
            this.svg.append("text")
                .attr("class", "error-msg")
                .attr("x", this.config.width / 2)
                .attr("y", 200)
                .attr("text-anchor", "middle")
                .style("font-size", "24px")
                .style("fill", "#ef4444")
                .text("No, this is more than 15, this will not render");
            return;
        }
        this.svg.selectAll(".error-msg").remove();

        this.emit('beforeRender', this.sceneGraph);

        // Transition sync for edges
        if (animate) {
            let start = null;
            const step = (timestamp) => {
                if (!start) start = timestamp;
                const progress = timestamp - start;
                this.renderLinks();
                if (progress < 400) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        }

        // Dynamic Sizing adjustment - Ensure we fit content
        const spacingTotal = Math.max(0, this.sceneGraph.visibleSamples.length - 1) * this.config.trackSpacing;
        const neededHeight = this.config.startY + spacingTotal + 100;

        // Calculate max horizontal content width
        const maxTrackWidth = d3.max(this.sceneGraph.visibleSamples, s => {
            if (!s.visualChroms.length) return 0;
            const last = s.visualChroms[s.visualChroms.length - 1];
            return last.absX + (last.size * this.config.scale) + this.config.startX + 100;
        }) || this.config.width;

        this.config.height = Math.max(800, neededHeight);

        this.svg.attr("width", Math.max(this.config.width, maxTrackWidth));
        this.svg.attr("height", this.config.height);

        this.linkRenderer.render(this.sceneGraph.visibleSamples);
        this.trackRenderer.render(this.sceneGraph.visibleSamples, animate);

        this.renderScaleBar();
        this.emit('afterRender', this.sceneGraph);
    }

    renderScaleBar() {
        this.svg.selectAll(".scale-bar-group").remove();

        if (this.config.showScaleBar === false) return;
        if (!this.sceneGraph || this.sceneGraph.visibleSamples.length === 0) return;

        const scaleBarMb = this.config.scaleBarMb !== undefined ? this.config.scaleBarMb : 1.0;
        const scaleBarBp = scaleBarMb * 1000000;
        const barWidth = scaleBarBp * this.config.scale;

        const initialX = this.state.scaleBarX !== null && this.state.scaleBarX !== undefined 
            ? this.state.scaleBarX 
            : this.config.startX;
        const initialY = this.state.scaleBarY !== null && this.state.scaleBarY !== undefined 
            ? this.state.scaleBarY 
            : this.config.height - 50;

        const scaleBarGroup = this.svg.append("g")
            .attr("class", "scale-bar-group")
            .attr("transform", \`translate(\${initialX}, \${initialY})\`)
            .style("cursor", "move");

        // Scale bar path
        scaleBarGroup.append("path")
            .attr("d", \`M 0,-5 L 0,0 L \${barWidth},0 L \${barWidth},-5\`)
            .attr("fill", "none")
            .attr("stroke", "#475569")
            .attr("stroke-width", "2px");

        // Scale bar label
        const label = scaleBarMb >= 1.0 
            ? \`\${scaleBarMb.toFixed(scaleBarMb % 1 === 0 ? 0 : 1)} Mb\` 
            : \`\${(scaleBarMb * 1000).toFixed(0)} kb\`;

        scaleBarGroup.append("text")
            .attr("x", barWidth / 2)
            .attr("y", -10)
            .attr("text-anchor", "middle")
            .attr("font-family", "'Inter', sans-serif")
            .attr("font-size", "11px")
            .attr("font-weight", "600")
            .attr("fill", "#475569")
            .style("user-select", "none")
            .text(label);

        // Make it draggable
        const dragHandler = d3.drag()
            .on("drag", (event) => {
                const currentX = (this.state.scaleBarX !== null && this.state.scaleBarX !== undefined ? this.state.scaleBarX : this.config.startX) + event.dx;
                const currentY = (this.state.scaleBarY !== null && this.state.scaleBarY !== undefined ? this.state.scaleBarY : this.config.height - 50) + event.dy;
                
                this.state.scaleBarX = currentX;
                this.state.scaleBarY = currentY;
                
                scaleBarGroup.attr("transform", \`translate(\${currentX}, \${currentY})\`);
            });

        scaleBarGroup.call(dragHandler);
    }

    renderLinks() {
        const scene = this.sceneGraph || Engine.calculateScene(this.state, this.config);
        this.linkRenderer.render(scene.visibleSamples);
    }

    renameGenome(id, name) {
        this.store.renameGenome(id, name);
        this.emit('genomeRenamed', { id, name });
        this.render(false);
    }

    /**
     * Rearranges chromosomes of a target genome to align with a neighbor.
     */
    sortChromosomesByNeighbor(targetId, neighborId) {
        const targetSample = this.store.state.samples.find(s => s.id === targetId);
        const neighborSample = this.store.state.samples.find(s => s.id === neighborId);
        
        if (!targetSample || !neighborSample) {
            console.error("Samples not found", { targetId, neighborId });
            return;
        }

        // neighborSample.chroms is an array of chromosome objects
        const neighborChroms = [...neighborSample.chroms];
        neighborChroms.sort((a, b) => (a.x_index || 0) - (b.x_index || 0));

        const neighborOffsets = new Map();
        let currentX = 0;
        neighborChroms.forEach(c => {
            neighborOffsets.set(c.id, currentX);
            currentX += c.size * this.config.scale + this.config.chromMargin;
        });

        const chromScores = [];
        targetSample.chroms.forEach(chrom => {
            const positions = [];
            chrom.blocks.forEach(block => {
                if (!block.linked) return;
                const group = this.store.state.groupToIndex.get(block.group);
                if (!group) return;

                const neighborBlock = group.find(b => b.sampleId === neighborId);
                if (neighborBlock) {
                    const offset = neighborOffsets.get(neighborBlock.chromId);
                    if (offset !== undefined) {
                        const pos = offset + (neighborBlock.start * this.config.scale);
                        positions.push(pos);
                    }
                }
            });

            if (positions.length > 0) {
                positions.sort((a, b) => a - b);
                const median = positions[Math.floor(positions.length / 2)];
                chromScores.push({ chrom, score: median });
            } else {
                chromScores.push({ chrom, score: Infinity });
            }
        });

        chromScores.sort((a, b) => a.score - b.score);
        chromScores.forEach((item, index) => {
            item.chrom.x_index = index;
        });

        this.showToast(\`Rearranged \${targetSample.name} to align with \${neighborSample.name}\`);
        this.render(true);
    }

    showToast(msg) {
        this.emit('toast', msg);
    }

    showDisclaimer(title, message) {
        return new Promise((resolve) => {
            const overlay = d3.select("body").append("div")
                .attr("class", "disclaimer-overlay")
                .style("position", "fixed")
                .style("top", "0")
                .style("left", "0")
                .style("width", "100vw")
                .style("height", "100vh")
                .style("background", "rgba(15, 23, 42, 0.6)")
                .style("backdrop-filter", "blur(8px)")
                .style("-webkit-backdrop-filter", "blur(8px)")
                .style("display", "flex")
                .style("justify-content", "center")
                .style("align-items", "center")
                .style("z-index", "99999");

            const box = overlay.append("div")
                .attr("class", "disclaimer-box")
                .style("background", "white")
                .style("padding", "24px 32px")
                .style("border-radius", "16px")
                .style("max-width", "450px")
                .style("box-shadow", "0 25px 50px -12px rgba(0,0,0,0.25)")
                .style("border", "1px solid #e2e8f0")
                .style("text-align", "center")
                .style("font-family", "'Inter', sans-serif")
                .style("animation", "fadeIn 0.2s ease-out");

            box.append("h3")
                .style("margin", "0 0 12px 0")
                .style("color", "#0f172a")
                .style("font-size", "18px")
                .style("font-weight", "600")
                .text(title);

            box.append("p")
                .style("margin", "0 0 20px 0")
                .style("color", "#475569")
                .style("font-size", "13px")
                .style("line-height", "1.6")
                .text(message);

            const btn = box.append("button")
                .style("background", "#3b82f6")
                .style("color", "white")
                .style("border", "none")
                .style("padding", "8px 24px")
                .style("border-radius", "8px")
                .style("font-size", "13px")
                .style("font-weight", "600")
                .style("cursor", "pointer")
                .style("transition", "background 0.2s")
                .text("OK")
                .on("click", () => {
                    overlay.remove();
                    resolve();
                });

            btn.on("mouseenter", function() { d3.select(this).style("background", "#2563eb"); })
               .on("mouseleave", function() { d3.select(this).style("background", "#3b82f6"); });
        });
    }

    _initResizeHandler() {
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.target === this.container.node()) {
                    // contentRect.width is the inner content area (no padding/border)
                    this.config.width = entry.contentRect.width;
                    this.autoScaleToFit();
                }
            }
        });
        observer.observe(this.container.node());
    }
}



        const data = JSON.parse(document.getElementById('baked-data').textContent);
        
        class ReportSidebar {
            install(viz) {
                this.viz = viz;
                d3.select("#cfg-showLabels").on("change", (e) => { this.viz.config.showLabels = e.target.checked; this.viz.render(); });
                d3.select("#cfg-freeFormAlignment").on("change", (e) => {
                    this.viz.state.freeFormAlignment = e.target.checked;
                    if (!e.target.checked) {
                        this.viz.state.samples.forEach(s => {
                            s.chroms.forEach(c => {
                                delete c.customOffsetBp;
                            });
                        });
                    } else {
                        this.viz.state.samples.forEach(s => {
                            s.chroms.forEach(c => {
                                c.customOffsetBp = c.absX / this.viz.config.scale;
                            });
                        });
                    }
                    this.viz.render(true);
                });
                d3.select("#cfg-trackSpacing-slider").on("input", (e) => { this.viz.config.trackSpacing = +e.target.value; this.viz.render(); });
                
                const sidebar = d3.select("#sidebar-left");
                const btn = d3.select("#toggle-sidebar-left");
                btn.on("click", () => {
                    const hidden = sidebar.classed("hidden");
                    sidebar.classed("hidden", !hidden);
                    btn.classed("is-hidden", !hidden);
                    btn.text(hidden ? "⇇" : "⇉");
                });

                viz.on('afterRender', () => this.updateGenomeList());
            }
            updateGenomeList() {
                const list = d3.select("#genome-list");
                list.selectAll("*").remove();
                this.viz.state.samples.forEach(s => {
                    const row = list.append("div").attr("class", "genome-item");
                    const isHidden = this.viz.state.hiddenGenomes.has(s.id);
                    row.append("input").attr("type", "checkbox").property("checked", !isHidden).on("change", (e) => { 
                        this.viz.store.toggleHiddenGenome(s.id);
                        this.viz.render(); 
                    });
                    row.append("span").text(s.name);
                });
            }
        }

        const viz = new SyntenyViz("#viz");
        if (data.hiddenGenomes) data.hiddenGenomes.forEach(id => viz.store.state.hiddenGenomes.add(id));
        viz.store.setSamples(data.samples, new Map(data.groupToIndex));
        viz.store.state.colors = data.colors;
        viz.store.state.userColors = data.userColors;
        viz.store.state.refGenomeId = data.refGenomeId;
        viz.config = {...viz.config, ...data.config};
        
        const sidebar = new ReportSidebar();
        viz.use(sidebar);
        viz.render();
        sidebar.updateGenomeList();
    </script>
</body>
</html>`;

        const blob = new Blob([htmlTemplate], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "funmacrosynteny_report.html";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    static _inlineStyles(svgNode: SVGElement) {
        let cssText = "";
        try {
            for (let i = 0; i < document.styleSheets.length; i++) {
                const sheet = document.styleSheets[i];
                if (sheet.href && !sheet.href.includes("macrosynteny.css")) continue;
                const rules = sheet.cssRules || (sheet as any).rules;
                if (rules) {
                    for (let j = 0; j < rules.length; j++) cssText += rules[j].cssText + "\n";
                }
            }
        } catch (e) {}
        const style = document.createElement("style");
        style.setAttribute("type", "text/css");
        style.innerHTML = `<![CDATA[\n${cssText}\n]]>`;
        svgNode.insertBefore(style, svgNode.firstChild);
    }

    static _download(url: string, filename: string) {
        const link = document.createElement("a");
        link.href = url; link.download = filename;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
}
