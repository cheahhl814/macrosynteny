export interface Block {
  group: string;
  start: number;
  end: number;
  tsvStart: number;
  tsvEnd: number;
  inverted: boolean;
  linked: boolean;
  sampleId: string;
  chromId: string;
}

export interface Chrom {
  id: string;
  name: string;
  size: number;
  blocks: Block[];
  sampleId: string;
  x_index: number;
  absX: number;
  genomicIndex?: number;
  marker?: string | null;
  inverted?: boolean;
  currentDragX?: number;
  dragOffsetX?: number;
  customOffsetBp?: number;
}

export interface Sample {
  id: string;
  name: string;
  slot: number;
  chroms: Chrom[];
  visualChroms: Chrom[];
  visualSlot?: number;
  currentDragY?: number;
  dragOffsetY?: number;
}

export interface State {
  samples: Sample[];
  colors: Record<string, string>;
  hiddenGenomes: Set<string>;
  refGenomeId: string | null;
  focusChroms: Set<string>;
  minSyntenySize: number;
  colorMode: string;
  groupToIndex: Map<string, Block[]>;
  userColors: Record<string, string>;
  draggedSample: Sample | null;
  draggedChrom: Chrom | null;
  baseScale?: number;
  hoveredFocusChromId?: string | null;
  scaleBarX?: number | null;
  scaleBarY?: number | null;
  lastFocusKey?: string;
  strandMap: Map<string, string>;
  freeFormAlignment: boolean;
}

export interface Config {
  width: number;
  height: number;
  trackSpacing: number;
  chromHeight: number;
  chromMargin: number;
  labelSize: number;
  chromStrokeWidth: number;
  scale: number;
  startX: number;
  startY: number;
  showLabels: boolean;
  zoom: number;
  scaleBarBp?: number;
  scaleBarMb?: number;
  showScaleBar?: boolean;
  [key: string]: any;
}
