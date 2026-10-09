export class ColorPalettes {
    /**
     * Applies color mapping based on the reference genome.
     */
    static applyReferenceColoring(state) {
        const ref = state.samples.find(s => s.id === state.refGenomeId);
        if (!ref)
            return {};
        const palette = d3.schemeCategory10.concat(d3.schemeAccent);
        const colors = {};
        ref.chroms.forEach((c, i) => {
            const color = palette[i % palette.length];
            c.blocks.forEach(b => {
                if (b.linked)
                    colors[b.group] = color;
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
        state.samples.forEach(s => s.chroms.forEach(c => c.blocks.forEach(b => {
            if (b.linked && !colors[b.group]) {
                colors[b.group] = palette[pIdx++ % palette.length];
            }
        })));
        return colors;
    }
}
