export class Parsers {
    /**
     * Parses a TSV string into samples and blocks.
     * @param {string} tsvText - The raw TSV data.
     * @returns {Object} { samplesMap, groupToIndex, detectedStrandColumn, hasInvertedBlocks }
     */
    static parseTSV(tsvText) {
        const rows = d3.tsvParse(tsvText);
        const samplesMap = new Map();
        const groupToIndex = new Map();
        const strandMap = new Map();
        const detectedStrandColumn = !!(rows.columns && rows.columns.includes("strand"));
        let hasInvertedBlocks = false;
        rows.forEach((row) => {
            const b1 = row.bin_id;
            const b2 = row.bin_id2;
            const s1 = row.seq_id;
            const seq2 = row.seq_id2;
            const gid = row.block_id;
            if (!b1 || !s1 || !gid)
                return;
            const hasLink = !!(b2 && b2 !== "null" && seq2 && seq2 !== "null");
            const touch = (bin, seq, st, en, block, isSecondBlock) => {
                if (!bin || bin === "null")
                    return null;
                if (!samplesMap.has(bin)) {
                    samplesMap.set(bin, {
                        id: bin,
                        name: bin,
                        chroms: new Map(),
                    });
                }
                const sample = samplesMap.get(bin);
                const chromId = `${bin}||${seq}`;
                if (!sample.chroms.has(seq)) {
                    sample.chroms.set(seq, {
                        id: chromId,
                        name: seq,
                        size: 0,
                        blocks: [],
                        sampleId: bin,
                        x_index: 0,
                        absX: 0,
                    });
                }
                const chrom = sample.chroms.get(seq);
                const startRaw = parseInt(st);
                const endRaw = parseInt(en);
                const startMin = Math.min(startRaw, endRaw);
                const endMax = Math.max(startRaw, endRaw);
                chrom.size = Math.max(chrom.size, endMax);
                // Deduplicate blocks: if a block for this group already exists on this chromosome, reuse it!
                let blockObj = chrom.blocks.find(b => b.group === block);
                if (blockObj) {
                    if (hasLink) {
                        blockObj.linked = true;
                        if (!groupToIndex.has(block))
                            groupToIndex.set(block, []);
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
                    chromId: chromId,
                };
                chrom.blocks.push(blockObj);
                if (hasLink) {
                    if (!groupToIndex.has(block))
                        groupToIndex.set(block, []);
                    groupToIndex.get(block).push(blockObj);
                }
                return blockObj;
            };
            touch(b1, s1, row.start || "0", row.end || "0", gid, false);
            if (hasLink && b2 && seq2) {
                touch(b2, seq2, row.start2 || "0", row.end2 || "0", gid, true);
                const linkKey = `${gid}||${b1}||${b2}`;
                strandMap.set(linkKey, row.strand || "+");
                if (row.strand === "-") {
                    hasInvertedBlocks = true;
                }
            }
        });
        return { samplesMap, groupToIndex, detectedStrandColumn, hasInvertedBlocks, strandMap };
    }
}
