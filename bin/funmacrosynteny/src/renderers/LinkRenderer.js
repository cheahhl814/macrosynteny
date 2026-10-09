export class LinkRenderer {
    viz;
    linkLayer;
    constructor(viz) {
        this.viz = viz;
        this.linkLayer = viz.linkLayer;
    }
    render(visibleSamples) {
        const { state, config } = this.viz;
        const linksData = [];
        const getTrackY = (sampleId) => {
            const node = document.getElementById(`track-${sampleId.replace(/[^a-zA-Z0-9-]/g, '_')}`);
            if (node) {
                const transform = d3.select(node).attr("transform");
                if (transform) {
                    const match = transform.match(/translate\(([^,\s]+)[,\s]+([^)]+)\)/);
                    if (match)
                        return parseFloat(match[2]);
                }
            }
            const s = state.samples.find(sample => sample.id === sampleId);
            return config.startY + (s && s.visualSlot !== undefined ? s.visualSlot : 0) * config.trackSpacing;
        };
        const getChromX = (sampleId, chromId) => {
            const node = document.getElementById(`chrom-${chromId.replace(/[^a-zA-Z0-9-]/g, '_')}`);
            if (node) {
                const transform = d3.select(node).attr("transform");
                if (transform) {
                    const match = transform.match(/translate\(([^,\s]+)[,\s]+([^)]+)\)/);
                    if (match)
                        return parseFloat(match[1]);
                }
            }
            const s = state.samples.find(sample => sample.id === sampleId);
            const c = s ? s.chroms.find(ch => ch.id === chromId) : null;
            return c && c.absX !== undefined ? c.absX : 0;
        };
        // O(n) Link Generation
        for (let i = 0; i < visibleSamples.length - 1; i++) {
            const s1 = visibleSamples[i];
            const s2 = visibleSamples[i + 1];
            s1.visualChroms.forEach(c1 => {
                c1.blocks.forEach(b1 => {
                    if (!b1.linked)
                        return;
                    const members = state.groupToIndex.get(b1.group);
                    if (!members)
                        return;
                    const partners = members.filter(p => p.sampleId === s2.id);
                    partners.forEach(b2 => {
                        const c2 = s2.visualChroms.find(vc => vc.id === b2.chromId);
                        if (!c2)
                            return;
                        const y1 = getTrackY(s1.id) + config.chromHeight;
                        const y2 = getTrackY(s2.id);
                        const x1_offset = getChromX(s1.id, c1.id);
                        const x2_offset = getChromX(s2.id, c2.id);
                        const getX = (chrom, offset, bp) => {
                            const base = config.startX + offset;
                            return chrom.inverted ? base + (chrom.size - bp) * config.scale : base + bp * config.scale;
                        };
                        const linkKey = `${b1.group}||${b1.sampleId}||${b2.sampleId}`;
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
                        }
                        else {
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
