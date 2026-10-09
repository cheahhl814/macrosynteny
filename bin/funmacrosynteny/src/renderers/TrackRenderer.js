export class TrackRenderer {
    viz;
    trackLayer;
    static canvas = null;
    constructor(viz) {
        this.viz = viz;
        this.trackLayer = viz.trackLayer;
    }
    render(visibleSamples, animate) {
        const { config, state } = this.viz;
        const duration = animate ? 300 : 0;
        const tracks = this.trackLayer.selectAll(".sample-group").data(visibleSamples, (d) => d.id);
        tracks.exit().remove();
        const tracksEnter = tracks.enter().append("g").attr("class", "sample-group")
            .attr("id", (d) => `track-${d.id.replace(/[^a-zA-Z0-9-]/g, '_')}`);
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
            .attr("x", -10).attr("y", config.chromHeight / 2)
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
            d.dragOffsetY = my - (config.startY + (d.visualSlot ?? 0) * config.trackSpacing);
            d3.select(e.sourceEvent.target.parentNode).raise();
        })
            .on("drag", (e, d) => {
            const [mx, my] = d3.pointer(e, this.trackLayer.node());
            d.currentDragY = my - (d.dragOffsetY ?? 0);
            d3.select(document.getElementById(`track-${d.id.replace(/[^a-zA-Z0-9-]/g, '_')}`)).attr("transform", `translate(${config.startX}, ${d.currentDragY})`);
            state.samples.forEach(other => {
                if (other === d)
                    return;
                const otherY = config.startY + (other.visualSlot ?? 0) * config.trackSpacing;
                if ((d.slot < other.slot && (d.currentDragY ?? 0) > otherY - 40) ||
                    (d.slot > other.slot && (d.currentDragY ?? 0) < otherY + 40)) {
                    const tmp = d.slot;
                    d.slot = other.slot;
                    other.slot = tmp;
                    this.viz.render(true);
                }
            });
            this.viz.renderLinks();
        })
            .on("end", (e, d) => {
            state.draggedSample = null;
            this.viz.render();
        }));
        tracksMerged.select(".sample-label")
            .text((d) => d.name)
            .attr("font-family", "'Inter', sans-serif")
            .attr("font-weight", "600")
            .attr("font-size", `${config.labelSize}px`)
            .attr("fill", "#475569");
        // Localized contextmenu for renaming
        tracksMerged.on("contextmenu", (e, d) => {
            // Only trigger if we aren't clicking a chromosome
            if (e.target.closest(".chrom-group"))
                return;
            e.preventDefault();
            e.stopPropagation();
            this._showRenameInput(e, d);
        });
        let selection = tracksMerged.filter((d) => d !== state.draggedSample);
        if (animate) {
            selection.transition().duration(300)
                .attr("transform", (d) => `translate(${config.startX}, ${config.startY + (d.visualSlot ?? 0) * config.trackSpacing})`);
        }
        else {
            selection.attr("transform", (d) => `translate(${config.startX}, ${config.startY + (d.visualSlot ?? 0) * config.trackSpacing})`);
        }
        tracksMerged.filter((d) => d === state.draggedSample)
            .attr("transform", (d) => `translate(${config.startX}, ${d.currentDragY})`);
        tracksMerged.each((d, i, nodes) => {
            this._renderChromosomes(d3.select(nodes[i]), d, animate);
        });
    }
    _renderChromosomes(container, sample, animate) {
        const { config, state } = this.viz;
        const duration = animate ? 300 : 0;
        const chroms = container.selectAll(".chrom-group").data(sample.visualChroms, (d) => d.id);
        chroms.exit().remove();
        const chromsEnter = chroms.enter().append("g").attr("class", "chrom-group")
            .attr("id", (d) => `chrom-${d.id.replace(/[^a-zA-Z0-9-]/g, '_')}`)
            .on("dblclick", (e, d) => {
            e.stopPropagation();
            d.inverted = !d.inverted;
            this.viz.render();
        })
            .on("contextmenu", (e, d) => {
            e.preventDefault();
            e.stopPropagation();
            this._showChromContextMenu(e, d);
        });
        const self = this;
        chromsEnter.call(d3.drag()
            .on("start", function (e, d) {
            state.draggedChrom = d;
            self.viz.tooltip.hide();
            const [mx] = d3.pointer(e, container.node());
            d.dragOffsetX = mx - d.absX;
            d3.select(this).raise();
        })
            .on("drag", (e, d) => {
            const [mx] = d3.pointer(e, container.node());
            d.currentDragX = mx - (d.dragOffsetX ?? 0);
            if (state.freeFormAlignment) {
                const leftSiblings = sample.visualChroms.filter(other => other !== d && (other.x_index ?? 0) < (d.x_index ?? 0)).sort((a, b) => (b.x_index ?? 0) - (a.x_index ?? 0));
                const rightSiblings = sample.visualChroms.filter(other => other !== d && (other.x_index ?? 0) > (d.x_index ?? 0)).sort((a, b) => (a.x_index ?? 0) - (b.x_index ?? 0));
                const leftSib = leftSiblings[0];
                const rightSib = rightSiblings[0];
                const limitLeft = leftSib ? leftSib.absX + (leftSib.size * config.scale) + config.chromMargin : 0;
                const limitRight = rightSib ? rightSib.absX - (d.size * config.scale) - config.chromMargin : Infinity;
                d.currentDragX = Math.max(limitLeft, Math.min(limitRight, d.currentDragX));
            }
            d3.select(document.getElementById(`chrom-${d.id.replace(/[^a-zA-Z0-9-]/g, '_')}`)).attr("transform", `translate(${d.currentDragX}, 0)`);
            if (!state.freeFormAlignment) {
                const center = d.currentDragX + (d.size * config.scale) / 2;
                sample.visualChroms.forEach(other => {
                    if (other === d)
                        return;
                    const otherCenter = other.absX + (other.size * config.scale) / 2;
                    if ((d.x_index < other.x_index && center > otherCenter) ||
                        (d.x_index > other.x_index && center < otherCenter)) {
                        const tmp = d.x_index;
                        d.x_index = other.x_index;
                        other.x_index = tmp;
                        this.viz.render(true);
                    }
                });
            }
            else {
                d.absX = d.currentDragX;
            }
            this.viz.renderLinks();
        })
            .on("end", (e, d) => {
            state.draggedChrom = null;
            if (state.freeFormAlignment) {
                d.customOffsetBp = (d.currentDragX ?? d.absX) / config.scale;
            }
            this.viz.render();
        }));
        chromsEnter.append("rect").attr("class", "chrom-bar")
            .attr("height", config.chromHeight).attr("rx", 4)
            .style("cursor", "pointer")
            .on("mouseover", (e, d) => {
            if (state.draggedChrom || state.draggedSample) {
                this.viz.tooltip.hide();
                return;
            }
            this.viz.tooltip.show(e, `<strong>Chromosome: ${d.name}</strong><br>Total Size: ${d3.format(",")(d.size)} bp`);
        })
            .on("mousemove", (e, d) => {
            if (state.draggedChrom || state.draggedSample) {
                this.viz.tooltip.hide();
                return;
            }
            const [mx] = d3.pointer(e);
            let pos = Math.round(mx / config.scale);
            if (d.inverted)
                pos = d.size - pos;
            pos = Math.max(0, Math.min(d.size, pos));
            // Find the gap range
            const sorted = [...d.blocks].sort((a, b) => a.start - b.start);
            let start = 0, end = d.size;
            for (const b of sorted) {
                if (b.end <= pos)
                    start = Math.max(start, b.end + 1);
                if (b.start > pos) {
                    end = b.start - 1;
                    break;
                }
            }
            this.viz.tooltip.show(e, `
                    <strong>Chromosome: ${d.name}</strong><br>
                    <em>Non-syntenic region</em><br>
                    Start: ${start.toLocaleString()}<br>
                    End: ${end.toLocaleString()}<br>
                    Size: ${(end - start).toLocaleString()} bp
                `);
        })
            .on("mouseout", () => this.viz.tooltip.hide());
        chromsEnter.append("rect").attr("class", "chrom-label-bg")
            .attr("fill", "rgba(255, 255, 255, 0.8)")
            .attr("rx", 3);
        chromsEnter.append("text").attr("class", "chrom-name")
            .attr("dominant-baseline", "hanging");
        const chromsMerged = chroms.merge(chromsEnter);
        const chromsT = chromsMerged.filter((d) => d !== state.draggedChrom);
        if (animate) {
            chromsT.transition().duration(duration)
                .attr("transform", (d) => `translate(${d.absX}, 0)`);
        }
        else {
            chromsT.attr("transform", (d) => `translate(${d.absX}, 0)`);
        }
        chromsMerged.filter((d) => d === state.draggedChrom)
            .attr("transform", (d) => `translate(${d.currentDragX}, 0)`);
        chromsMerged.select(".chrom-bar")
            .attr("width", (d) => d.size * config.scale)
            .style("stroke-width", `${config.chromStrokeWidth}px`)
            .style("stroke", config.chromStrokeWidth > 0 ? "black" : "#cbd5e1");
        chromsMerged.select(".chrom-name")
            .attr("x", (d) => (d.size * config.scale) / 2)
            .attr("y", config.chromHeight + (config.chromStrokeWidth / 2) + 8)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "hanging")
            .style("font-family", "'Inter', sans-serif")
            .style("font-size", `${config.labelSize}px`)
            .style("font-weight", "600")
            .text((d) => (d.marker ? d.marker + " " : "") + d.name + (d.inverted ? " (rev)" : ""))
            .attr("opacity", config.showLabels ? 1 : 0)
            .each(function (d) {
            const labelText = (d.marker ? d.marker + " " : "") + d.name + (d.inverted ? " (rev)" : "");
            const textWidth = TrackRenderer.measureText(labelText, `600 ${config.labelSize}px 'Inter', sans-serif`);
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
        const blocks = chromsContainer.selectAll(".block-rect").data((d) => d.blocks);
        blocks.exit().remove();
        blocks.enter().append("rect").attr("class", "block-rect").attr("height", config.chromHeight)
            .on("mouseover", (e, b) => {
            e.stopPropagation();
            if (state.draggedChrom || state.draggedSample) {
                tooltip.hide();
                return;
            }
            const size = (b.end - b.start).toLocaleString();
            tooltip.show(e, `<strong>${b.chromId}</strong><br>Block: ${b.group}<br>Start: ${b.start.toLocaleString()}<br>End: ${b.end.toLocaleString()}<br>Size: ${size} bp<br>Inverted: ${b.inverted}`);
        })
            .on("click", (e, b) => {
            e.stopPropagation();
            const size = (b.end - b.start).toLocaleString();
            this.viz.showToast(`${b.chromId}:${b.start.toLocaleString()}-${b.end.toLocaleString()} [Block ${b.group}, size = ${size} bp]`);
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
            .attr("width", (b) => (b.end - b.start) * config.scale)
            .attr("fill", (b) => b.linked ? (state.colors[b.group] || "#e2e8f0") : "#cbd5e1");
    }
    _showRenameInput(event, sample) {
        // Remove any existing rename inputs
        d3.selectAll(".rename-input-container").remove();
        const container = d3.select("body").append("div")
            .attr("class", "rename-input-container")
            .style("left", `${event.clientX}px`)
            .style("top", `${event.clientY}px`);
        const input = container.append("input")
            .attr("class", "rename-input")
            .attr("type", "text")
            .attr("value", sample.name);
        const inputNode = input.node();
        inputNode.focus();
        inputNode.select();
        const submit = () => {
            const newName = input.property("value").trim();
            if (newName && newName !== sample.name) {
                this.viz.renameGenome(sample.id, newName);
                this.viz.showToast(`Renamed ${sample.id} to ${newName}`);
            }
            container.remove();
        };
        input.on("keydown", (e) => {
            if (e.key === "Enter")
                submit();
            if (e.key === "Escape")
                container.remove();
        });
        // Close when clicking outside
        setTimeout(() => {
            d3.select(window).on("click.rename-closer", (e) => {
                const containerNode = container.node();
                if (containerNode && !containerNode.contains(e.target)) {
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
            .style("left", `${event.clientX}px`)
            .style("top", `${event.clientY}px`);
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
                .html(`🎨 Change Color (Group ${b.group})`);
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
            .html(`🎯 ${isFocused ? 'Remove Focus' : 'Focus Chromosome'}`);
        focusItem.on("mouseenter", removeSubmenu);
        focusItem.on("click", () => {
            if (d.sampleId !== state.refGenomeId) {
                this.viz.showToast(`Your ref genome is ${state.refGenomeId}, pick chroms from ${state.refGenomeId}`);
                menu.remove();
                return;
            }
            if (isFocused)
                state.focusChroms.delete(d.id);
            else
                state.focusChroms.add(d.id);
            this.viz.showToast(isFocused ? `Focus removed for ${d.name}` : `Focused on ${d.name}`);
            this.viz.emit('focusChanged');
            this.viz.autoScaleToFit();
            menu.remove();
        });
        // Option 1b: Select as Reference Genome
        const isRef = state.refGenomeId === d.sampleId;
        if (!isRef) {
            const refItem = menu.append("div").attr("class", "context-menu-item")
                .html(`🧬 Select as Reference Genome`);
            refItem.on("mouseenter", removeSubmenu);
            refItem.on("click", () => {
                this.viz.store.setRefGenome(d.sampleId);
                state.focusChroms.clear();
                if (state.colorMode === "ref") {
                    this.viz.applyColoring();
                }
                this.viz.showToast(`Reference changed to: ${d.sampleId}`);
                this.viz.emit('refChanged');
                this.viz.autoScaleToFit();
                menu.remove();
            });
        }
        // Option 2: Reverse Orientation
        const reverseItem = menu.append("div").attr("class", "context-menu-item")
            .html(`🔄 ${d.inverted ? 'Restore Orientation' : 'Reverse Orientation'}`);
        reverseItem.on("mouseenter", removeSubmenu);
        reverseItem.on("click", () => {
            d.inverted = !d.inverted;
            this.viz.showToast(`${d.inverted ? 'Reversed' : 'Restored'} orientation for ${d.name}`);
            this.viz.render();
            menu.remove();
        });
        // Option 3: Align with Neighbors
        const visibleSamples = this.viz.sceneGraph.visibleSamples;
        const targetIdx = visibleSamples.findIndex((s) => s.id === d.sampleId);
        if (targetIdx !== -1) {
            const neighbors = [];
            if (targetIdx > 0)
                neighbors.push({ type: 'Above', sample: visibleSamples[targetIdx - 1] });
            if (targetIdx < visibleSamples.length - 1)
                neighbors.push({ type: 'Below', sample: visibleSamples[targetIdx + 1] });
            neighbors.forEach(n => {
                const alignItem = menu.append("div").attr("class", "context-menu-item")
                    .html(`📏 Align to ${n.sample.name} (${n.type})`);
                const node = alignItem.node();
                node.onmouseenter = () => removeSubmenu();
                node.onclick = (e) => {
                    e.stopPropagation();
                    console.log(`Attempting align: ${d.sampleId} -> ${n.sample.id}`);
                    try {
                        this.viz.sortChromosomesByNeighbor(d.sampleId, n.sample.id);
                        menu.remove();
                    }
                    catch (err) {
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
            .html(`🏷️ Set Marker`);
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
                cell.on("mouseenter", function () {
                    d3.select(this).style("transform", "scale(1.25)");
                });
                cell.on("mouseleave", function () {
                    d3.select(this).style("transform", "scale(1)");
                });
                cell.on("click", (e) => {
                    e.stopPropagation();
                    d.marker = emoji;
                    this.viz.render();
                    menu.remove();
                    this.viz.showToast(`Added ${emoji} to ${d.name}`);
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
                this.viz.showToast(`Cleared marker for ${d.name}`);
            });
        });
        // Close when clicking outside
        setTimeout(() => {
            d3.select(window).on("click.menu-closer", (e) => {
                const menuNode = menu.node();
                if (menuNode && !menuNode.contains(e.target)) {
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
        if (context) {
            context.font = font;
            return context.measureText(text).width;
        }
        return text.length * 8;
    }
}
