import { State, Sample, Block, Chrom } from '../types.js';

export class Store {
    public state: State;

    constructor() {
        this.state = {
            samples: [],
            colors: {},
            hiddenGenomes: new Set<string>(),
            refGenomeId: null,
            focusChroms: new Set<string>(),
            minSyntenySize: 0,
            colorMode: "ref",
            groupToIndex: new Map<string, Block[]>(),
            userColors: {},
            draggedSample: null,
            draggedChrom: null,
            scaleBarX: null,
            scaleBarY: null,
            hoveredFocusChromId: null,
            strandMap: new Map<string, string>(),
            freeFormAlignment: false
        };
    }

    setSamples(samples: Sample[], groupToIndex: Map<string, Block[]>, strandMap?: Map<string, string>) {
        this.state.samples = samples;
        this.state.groupToIndex = groupToIndex;
        this.state.strandMap = strandMap || new Map<string, string>();

        // Ensure refGenomeId is valid for the new samples
        const currentRefExists = samples.some(s => s.id === this.state.refGenomeId);
        if (samples.length > 0 && (!this.state.refGenomeId || !currentRefExists)) {
            this.state.refGenomeId = samples[0].id;
        }
    }

    updateColoring(colors: Record<string, string>) {
        this.state.colors = colors;
    }

    toggleHiddenGenome(id: string) {
        if (this.state.hiddenGenomes.has(id)) {
            this.state.hiddenGenomes.delete(id);
        } else {
            this.state.hiddenGenomes.add(id);
        }
    }

    toggleFocusChrom(id: string) {
        if (this.state.focusChroms.has(id)) {
            this.state.focusChroms.delete(id);
        } else {
            this.state.focusChroms.add(id);
        }
    }

    setRefGenome(id: string) {
        this.state.refGenomeId = id;
    }

    setMinSyntenySize(size: number) {
        this.state.minSyntenySize = size;
    }

    setColorMode(mode: string) {
        this.state.colorMode = mode;
    }

    setDraggedSample(sample: Sample | null) {
        this.state.draggedSample = sample;
    }

    setDraggedChrom(chrom: Chrom | null) {
        this.state.draggedChrom = chrom;
    }

    renameGenome(id: string, name: string) {
        const sample = this.state.samples.find(s => s.id === id);
        if (sample) {
            sample.name = name;
        }
    }

    updateGroupColor(groupId: string, color: string) {
        this.state.userColors[groupId] = color;
        this.state.colors[groupId] = color;
    }
}
