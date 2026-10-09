import { Store } from './Store.js';
import { Engine } from './Engine.js';
import { TrackRenderer } from '../renderers/TrackRenderer.js';
import { LinkRenderer } from '../renderers/LinkRenderer.js';
import { Tooltip } from '../renderers/Tooltip.js';
import { Parsers } from '../utils/Parsers.js';
import { ColorPalettes } from '../utils/ColorPalettes.js';
export class SyntenyViz {
    container;
    svg;
    linkLayer;
    trackLayer;
    store;
    state;
    config;
    tooltip;
    trackRenderer;
    linkRenderer;
    sceneGraph = { visibleSamples: [] };
    listeners;
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
        if (!this.listeners.has(event))
            this.listeners.set(event, []);
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
            await this.showDisclaimer("ℹ️ Inversion Detection", "We detected a 'strand' column in your link data, indicating inversions are encoded via strands. The parser will automatically twist corresponding synteny ribbons to represent inversions correctly.");
        }
        else if (hasInvertedBlocks) {
            await this.showDisclaimer("ℹ️ Inversion Detection", "We detected coordinate-reversed inversions (start > end) in your link data. The parser will automatically twist corresponding synteny ribbons to represent inversions correctly.");
        }
        const samples = [];
        let slot = 0;
        samplesMap.forEach((sInfo, id) => {
            const chroms = Array.from(sInfo.chroms.values()).map((c, i) => ({ ...c, x_index: i, genomicIndex: i }));
            samples.push({ id, name: id, slot: slot++, chroms, visualChroms: [] });
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
        }
        else {
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
        }
        else if (container) {
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
                if (!start)
                    start = timestamp;
                const progress = timestamp - start;
                this.renderLinks();
                if (progress < 400)
                    requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        }
        // Dynamic Sizing adjustment - Ensure we fit content
        const spacingTotal = Math.max(0, this.sceneGraph.visibleSamples.length - 1) * this.config.trackSpacing;
        const neededHeight = this.config.startY + spacingTotal + 100;
        // Calculate max horizontal content width
        const maxTrackWidth = d3.max(this.sceneGraph.visibleSamples, (s) => {
            if (!s.visualChroms.length)
                return 0;
            const last = s.visualChroms[s.visualChroms.length - 1];
            return (last.absX ?? 0) + (last.size * this.config.scale) + this.config.startX + 100;
        }) || this.config.width;
        this.config.height = Math.max(800, neededHeight);
        this.svg.attr("width", Math.max(this.config.width, maxTrackWidth));
        this.svg.attr("height", this.config.height);
        this.linkRenderer.render(this.sceneGraph.visibleSamples);
        this.trackRenderer.render(this.sceneGraph.visibleSamples, animate);
        this.renderScaleBar();
        this.emit('afterRender', this.sceneGraph);
    }
    renderLinks() {
        const scene = this.sceneGraph || Engine.calculateScene(this.state, this.config);
        this.linkRenderer.render(scene.visibleSamples);
    }
    renderScaleBar() {
        this.svg.selectAll(".scale-bar-group").remove();
        if (this.config.showScaleBar === false)
            return;
        if (!this.sceneGraph || this.sceneGraph.visibleSamples.length === 0)
            return;
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
            .attr("transform", `translate(${initialX}, ${initialY})`)
            .style("cursor", "move");
        // horizontal bar
        scaleBarGroup.append("line")
            .attr("x1", 0)
            .attr("y1", 0)
            .attr("x2", barWidth)
            .attr("y2", 0)
            .attr("stroke", "#334155")
            .attr("stroke-width", "2");
        // left tick
        scaleBarGroup.append("line")
            .attr("x1", 0)
            .attr("y1", -4)
            .attr("x2", 0)
            .attr("y2", 4)
            .attr("stroke", "#334155")
            .attr("stroke-width", "2");
        // right tick
        scaleBarGroup.append("line")
            .attr("x1", barWidth)
            .attr("y1", -4)
            .attr("x2", barWidth)
            .attr("y2", 4)
            .attr("stroke", "#334155")
            .attr("stroke-width", "2");
        const label = scaleBarMb >= 1.0
            ? `${scaleBarMb.toFixed(scaleBarMb % 1 === 0 ? 0 : 1)} Mb`
            : `${(scaleBarMb * 1000).toFixed(0)} kb`;
        scaleBarGroup.append("text")
            .attr("x", barWidth / 2)
            .attr("y", 18)
            .attr("text-anchor", "middle")
            .style("font-family", "'Inter', sans-serif")
            .style("font-size", "12px")
            .style("font-weight", "600")
            .style("fill", "#475569")
            .style("user-select", "none")
            .text(label);
        // Make it draggable
        const dragHandler = d3.drag()
            .on("drag", (event) => {
            const currentX = (this.state.scaleBarX !== null && this.state.scaleBarX !== undefined ? this.state.scaleBarX : this.config.startX) + event.dx;
            const currentY = (this.state.scaleBarY !== null && this.state.scaleBarY !== undefined ? this.state.scaleBarY : this.config.height - 50) + event.dy;
            this.state.scaleBarX = currentX;
            this.state.scaleBarY = currentY;
            scaleBarGroup.attr("transform", `translate(${currentX}, ${currentY})`);
        });
        scaleBarGroup.call(dragHandler);
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
                if (!block.linked)
                    return;
                const group = this.store.state.groupToIndex.get(block.group);
                if (!group)
                    return;
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
            }
            else {
                chromScores.push({ chrom, score: Infinity });
            }
        });
        chromScores.sort((a, b) => a.score - b.score);
        chromScores.forEach((item, index) => {
            item.chrom.x_index = index;
        });
        this.showToast(`Rearranged ${targetSample.name} to align with ${neighborSample.name}`);
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
            btn.on("mouseenter", function () { d3.select(this).style("background", "#2563eb"); })
                .on("mouseleave", function () { d3.select(this).style("background", "#3b82f6"); });
        });
    }
    _initResizeHandler() {
        const node = this.container.node();
        if (!node)
            return;
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.target === node) {
                    // contentRect.width is the inner content area (no padding/border)
                    this.config.width = entry.contentRect.width;
                    this.autoScaleToFit();
                }
            }
        });
        observer.observe(node);
    }
}
