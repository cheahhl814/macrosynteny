export class Store {
    state;
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
            scaleBarX: null,
            scaleBarY: null,
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
        }
        else {
            this.state.hiddenGenomes.add(id);
        }
    }
    toggleFocusChrom(id) {
        if (this.state.focusChroms.has(id)) {
            this.state.focusChroms.delete(id);
        }
        else {
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
