import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCALES, SCALE_DEGREES, getProperSpelling, getNoteName, getNoteIndex, type Note, type ScaleType } from '@/utils/musicTheory';
import { useNaming } from '@/context/NamingContext';
import './ScaleMatrixSelector.css';

interface ScaleMatrixSelectorProps {
    selectedScale: ScaleType;
    onScaleChange: (scale: ScaleType) => void;
    selectedRoot: Note;
}

const DIATONIC_COLUMNS = [0, 1, 2, 3, 4, 5, 6];
const NATURAL_PITCHES = [0, 2, 4, 5, 7, 9, 11];
const DIATONIC_LABELS = ['1', '2', '3', '4', '5', '6', '7'];

const INTERVAL_NAMES: Record<number, string> = {
    0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: '#4/b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7'
};

const getIntervalHueClass = (intervalLabel: string): string => {
    if (intervalLabel === '1') return 'color-root';
    if (intervalLabel.includes('2') || intervalLabel.includes('9')) return 'color-9';
    if (intervalLabel.includes('3')) return 'color-3';
    if (intervalLabel.includes('4') || intervalLabel.includes('11')) return 'color-11';
    if (intervalLabel.includes('5')) return 'color-5';
    if (intervalLabel.includes('6') || intervalLabel.includes('13')) return 'color-13';
    if (intervalLabel.includes('7')) return 'color-7';
    return '';
};

const ScaleMatrixSelector: React.FC<ScaleMatrixSelectorProps> = ({ selectedScale, onScaleChange, selectedRoot }) => {
    const { t } = useTranslation();
    const { namingSystem } = useNaming();
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Statically resolve all possible (degree, pitchClass) pairings from our scale DB
    const COLUMN_NODES = useMemo(() => {
        const nodes: Record<number, Set<number>> = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set() };
        Object.keys(SCALES).forEach(scaleKey => {
            const scale = SCALES[scaleKey as ScaleType];
            const degrees = SCALE_DEGREES[scaleKey as ScaleType];
            scale.forEach((pc, i) => {
                const d = degrees ? degrees[i] : i;
                if (d >= 0 && d <= 6) {
                    nodes[d].add(pc);
                }
            });
        });

        const result: Record<number, number[]> = {};
        for (let d = 0; d <= 6; d++) {
            result[d] = Array.from(nodes[d]).sort((a, b) => a - b);
        }
        return result;
    }, []);

    // Get current scale's node structure to render the SVG path
    const activeNodes = useMemo(() => {
        const intervals = SCALES[selectedScale];
        const degrees = SCALE_DEGREES[selectedScale];
        const active: Array<{ col: number, pc: number }> = [];
        intervals.forEach((pc, i) => {
            const d = degrees ? degrees[i] : i;
            if (d >= 0 && d <= 6) active.push({ col: d, pc });
        });
        // Sort by column strictly for polyline drawing
        return active.sort((a, b) => a.col - b.col);
    }, [selectedScale]);

    const handleNodeClick = (targetCol: number, targetPc: number) => {
        // If they click a node already in the scale, ignore.
        if (activeNodes.some(n => n.col === targetCol && n.pc === targetPc)) return;

        // Current scale set
        const currentPcs = new Set(SCALES[selectedScale]);

        // Find candidate scales that HAVE this target node in this target column (or close to it)
        const validScales: ScaleType[] = [];
        const scaleKeys = Object.keys(SCALES) as ScaleType[];

        scaleKeys.forEach(scaleKey => {
            const scale = SCALES[scaleKey];
            const degrees = SCALE_DEGREES[scaleKey];

            const hasNode = scale.some((pc, i) => {
                const d = degrees ? degrees[i] : i;
                return pc === targetPc && d === targetCol;
            });

            if (hasNode) validScales.push(scaleKey);
        });

        // Fallback if no scale exactly maps this pitch to this column: allow any scale with this pitch
        if (validScales.length === 0) {
            scaleKeys.forEach(scaleKey => {
                if (SCALES[scaleKey].includes(targetPc)) validScales.push(scaleKey);
            });
        }
        if (validScales.length === 0) return; // Should never happen based on how nodes are rendered

        // Find scale closest to our current scale using symmetric difference
        let bestScale = validScales[0];
        let minDistance = 999;

        validScales.forEach(scaleKey => {
            const targetPcs = new Set(SCALES[scaleKey]);
            let distance = 0;
            currentPcs.forEach(pc => { if (!targetPcs.has(pc)) distance++; });
            targetPcs.forEach(pc => { if (!currentPcs.has(pc)) distance++; });

            if (distance < minDistance) {
                minDistance = distance;
                bestScale = scaleKey;
            }
        });

        onScaleChange(bestScale);
    };

    return (
        <div className="scale-matrix-selector">
            <div className="matrix-header">
                <div className="matrix-header-name"></div>
                <div className="matrix-scale-label">
                    <span>{t('controls.selectedScale')}: </span>
                    <strong>{t(`scales.${selectedScale}`)}</strong>
                </div>
                <button
                    className="matrix-collapse-btn"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    aria-label={isCollapsed ? "Expand Matrix" : "Collapse Matrix"}
                >
                    {isCollapsed ? '▼' : '▲'}
                </button>
            </div>

            <div className={`matrix-body single-view ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="matrix-grid-header">
                    {DIATONIC_LABELS.map((label, i) => (
                        <div key={i} className="matrix-col-label">
                            {label}
                        </div>
                    ))}
                </div>

                <div className="matrix-workspace">
                    <svg className="matrix-svg-layer" preserveAspectRatio="none">
                        {/* Render individual line segments for the active scale */}
                        {activeNodes.map((node, i) => {
                            if (i === activeNodes.length - 1) return null;
                            const nextNode = activeNodes[i + 1];

                            const getRawPos = (colIndex: number, pc: number) => {
                                let diff = pc - NATURAL_PITCHES[colIndex];
                                if (diff > 6) diff -= 12;
                                if (diff < -6) diff += 12;
                                return {
                                    xPct: (colIndex + 0.5) / 7 * 100,
                                    yDiff: diff
                                };
                            };

                            const rp1 = getRawPos(node.col, node.pc);
                            const rp2 = getRawPos(nextNode.col, nextNode.pc);

                            const rp1Y = isCollapsed ? 0 : rp1.yDiff;
                            const rp2Y = isCollapsed ? 0 : rp2.yDiff;

                            const x1 = `${rp1.xPct}%`;
                            const y1 = `${50 - rp1Y * 18}%`;
                            const x2 = `${rp2.xPct}%`;
                            const y2 = `${50 - rp2Y * 18}%`;

                            // Midpoint for semitone label
                            const midX = `${(rp1.xPct + rp2.xPct) / 2}%`;
                            const midY = `${50 - ((rp1Y + rp2Y) / 2) * 18}%`;

                            let semitones = nextNode.pc - node.pc;
                            if (semitones <= 0) semitones += 12;

                            return (
                                <g key={i}>
                                    <line
                                        x1={x1} y1={y1}
                                        x2={x2} y2={y2}
                                        className="matrix-svg-line"
                                    />
                                    <text
                                        x={midX}
                                        y={midY}
                                        dy="-10"
                                        className="matrix-line-label"
                                    >
                                        {semitones}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>

                    <div className="matrix-nodes-layer">
                        {DIATONIC_COLUMNS.map(colIndex => {
                            const nodesInCol = COLUMN_NODES[colIndex] || [];
                            return (
                                <div key={colIndex} className="matrix-col">
                                    {nodesInCol.map(pc => {
                                        // Position node vertically based on pitch diff
                                        let diff = pc - NATURAL_PITCHES[colIndex];
                                        if (diff > 6) diff -= 12;
                                        if (diff < -6) diff += 12;

                                        const label = INTERVAL_NAMES[pc] || '?';
                                        const hueClass = getIntervalHueClass(label);
                                        const isActive = activeNodes.some(n => n.col === colIndex && n.pc === pc);

                                        if (isCollapsed && !isActive) return null;

                                        // Compute exact note spelling
                                        const rootIndex = getNoteIndex(selectedRoot);
                                        const absolutePitchClass = (rootIndex + pc) % 12;
                                        const properNote = getProperSpelling(selectedRoot, absolutePitchClass, colIndex);
                                        const noteDisplayName = getNoteName(properNote, namingSystem);

                                        const yOffset = isCollapsed ? 0 : diff;

                                        return (
                                            <div
                                                key={pc}
                                                className={`matrix-dot interactable ${hueClass} ${isActive ? 'active' : ''}`}
                                                style={{ top: `${50 - yOffset * 18}%` }}
                                                onClick={() => handleNodeClick(colIndex, pc)}
                                            >
                                                <span className="matrix-dot-interval">{label}</span>
                                                <span className="matrix-dot-note">{noteDisplayName}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScaleMatrixSelector;
