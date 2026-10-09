import { State } from '../types.js';

export class ColorPalettes {
    /**
     * Applies color mapping based on the reference genome.
     */
    static applyReferenceColoring(state: State): Record<string, string> {
        const ref = state.samples.find(s => s.id === state.refGenomeId);
        if (!ref) return {};

        const palette: readonly string[] = (d3.schemeCategory10 as readonly string[]).concat(d3.schemeAccent as readonly string[]);
        const colors: Record<string, string> = {};
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
    static applyGlobalColoring(state: State): Record<string, string> {
        const palette = d3.schemeTableau10 as readonly string[];
        let pIdx = 0;
        const colors: Record<string, string> = {};
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
