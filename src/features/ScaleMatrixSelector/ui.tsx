import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCALES, SCALE_DEGREES, getProperSpelling, getNoteName, getNoteIndex, type Note, type ScaleType } from '@/shared/lib/music/musicTheory';
import { useNaming } from '@/app/providers';
import './ui.css';

interface ScaleMatrixSelectorProps {
    selectedScale: ScaleType;
    onScaleChange: (scale: ScaleType) => void;
    selectedRoot: Note;
}

const NATURAL_PITCHES = [0, 2, 4, 5, 7, 9, 11];

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
    const [isCollapsed, setIsCollapsedState] = useState(() => {
        const stored = localStorage.getItem('scale-matrix-collapsed');
        if (stored !== null) return stored === 'true';
        // Default collapsed on mobile: the expanded matrix is ~300px tall
        return window.matchMedia('(max-width: 600px)').matches;
    });
    const [scaleLengthFilter, setScaleLengthFilter] = useState<'ALL' | 5 | 6 | 7>('ALL');

    const setIsCollapsed = (collapsed: boolean) => {
        setIsCollapsedState(collapsed);
        localStorage.setItem('scale-matrix-collapsed', String(collapsed));
    };

    const scaleLength = useMemo(() => SCALES[selectedScale].length, [selectedScale]);

    const columns = useMemo(() => {
        return Array.from({ length: scaleLength }, (_, i) => i);
    }, [scaleLength]);

    const labels = useMemo(() => {
        return Array.from({ length: scaleLength }, (_, i) => (i + 1).toString());
    }, [scaleLength]);

    // Statically resolve all possible (index, pitchClass, degree) pairings from our scale DB, grouped by scale length
    const COLUMN_NODES = useMemo(() => {
        const result: Record<number, Record<number, Array<{ pc: number, d: number }>>> = {};

        Object.keys(SCALES).forEach(scaleKey => {
            const scale = SCALES[scaleKey as ScaleType];
            const degrees = SCALE_DEGREES[scaleKey as ScaleType] || [];
            const len = scale.length;
            if (!result[len]) {
                result[len] = {};
            }
            scale.forEach((pc, i) => {
                if (!result[len][i]) {
                    result[len][i] = [];
                }
                const d = degrees[i] !== undefined ? degrees[i] : i;
                const alreadyExists = result[len][i].some(item => item.pc === pc && item.d === d);
                if (!alreadyExists) {
                    result[len][i].push({ pc, d });
                }
            });
        });

        // Sort the pitch classes in each column
        Object.keys(result).forEach(lenStr => {
            const len = Number(lenStr);
            Object.keys(result[len]).forEach(colStr => {
                const col = Number(colStr);
                result[len][col].sort((a, b) => a.pc - b.pc);
            });
        });

        return result;
    }, []);

    // Get current scale's node structure to render the SVG path
    const activeNodes = useMemo(() => {
        const intervals = SCALES[selectedScale];
        const degrees = SCALE_DEGREES[selectedScale];
        const active: Array<{ col: number, pc: number, d: number }> = intervals.map((pc, i) => {
            const d = degrees ? degrees[i] : i;
            return { col: i, pc, d };
        });
        return active;
    }, [selectedScale]);

    // Helper to find the closest scale from a set of valid scale keys
    const findClosestScale = (validScaleKeys: ScaleType[], currentPcs: Set<number>) => {
        let bestScale = validScaleKeys[0];
        let minDistance = 999;

        validScaleKeys.forEach(scaleKey => {
            const targetPcs = new Set(SCALES[scaleKey]);
            let distance = 0;
            currentPcs.forEach(pc => { if (!targetPcs.has(pc)) distance++; });
            targetPcs.forEach(pc => { if (!currentPcs.has(pc)) distance++; });

            if (distance < minDistance) {
                minDistance = distance;
                bestScale = scaleKey;
            }
        });
        return bestScale;
    };

    const handleFilterChange = (newFilter: 'ALL' | 5 | 6 | 7) => {
        setScaleLengthFilter(newFilter);
        if (newFilter === 'ALL') return;
        
        // If the current scale already matches the length, do nothing
        if (SCALES[selectedScale].length === newFilter) return;

        const currentPcs = new Set(SCALES[selectedScale]);
        const validScales = (Object.keys(SCALES) as ScaleType[]).filter(k => SCALES[k].length === newFilter);
        
        if (validScales.length > 0) {
            onScaleChange(findClosestScale(validScales, currentPcs));
        }
    };

    const handleNodeClick = (targetCol: number, targetPc: number) => {
        const isDeselect = activeNodes.some(n => n.col === targetCol && n.pc === targetPc);

        // Current scale set
        const currentPcs = new Set(SCALES[selectedScale]);

        // Find candidate scales that HAVE (or don't have) this target node in this target column (or close to it)
        const validScales: ScaleType[] = [];
        const scaleKeys = Object.keys(SCALES) as ScaleType[];

        scaleKeys.forEach(scaleKey => {
            const scale = SCALES[scaleKey];
            if (scaleLengthFilter !== 'ALL' && scale.length !== scaleLengthFilter) return;

            const currentLength = scaleLengthFilter === 'ALL' ? scaleLength : scaleLengthFilter;
            if (scale.length !== currentLength) return;

            const hasNode = scale[targetCol] === targetPc;

            if (isDeselect && !hasNode) validScales.push(scaleKey);
            if (!isDeselect && hasNode) validScales.push(scaleKey);
        });

        // Fallback if no scale exactly maps this pitch to this column: allow any scale with/without this pitch
        if (validScales.length === 0) {
            scaleKeys.forEach(scaleKey => {
                const scale = SCALES[scaleKey];
                const currentLength = scaleLengthFilter === 'ALL' ? scaleLength : scaleLengthFilter;
                if (scale.length !== currentLength) return;
                
                const hasNode = scale.includes(targetPc);
                if (isDeselect && !hasNode) validScales.push(scaleKey);
                if (!isDeselect && hasNode) validScales.push(scaleKey);
            });
        }
        
        if (validScales.length === 0) return;

        onScaleChange(findClosestScale(validScales, currentPcs));
    };

    return (
        <div className="scale-matrix-selector">
            {/* The whole header toggles the collapse; the select opts out */}
            <div className="matrix-header" onClick={() => setIsCollapsed(!isCollapsed)}>
                <div className="matrix-scale-label" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <span>{t('controls.selectedScale')}: </span>
                        <strong>{t(`scales.${selectedScale}`)}</strong>
                    </div>
                    <select
                        value={scaleLengthFilter}
                        onClick={e => e.stopPropagation()}
                        onChange={e => handleFilterChange(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value) as 5 | 6 | 7)}
                        className="scale-length-select"
                    >
                        <option value="ALL">{t('controls.scaleLengths.all')}</option>
                        <option value="5">{t('controls.scaleLengths.5')}</option>
                        <option value="6">{t('controls.scaleLengths.6')}</option>
                        <option value="7">{t('controls.scaleLengths.7')}</option>
                    </select>
                </div>
                <button
                    className="matrix-collapse-btn"
                    onClick={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? "Expand Matrix" : "Collapse Matrix"}
                >
                    {isCollapsed ? '▼' : '▲'}
                </button>
            </div>

            <div className={`matrix-body single-view ${isCollapsed ? 'collapsed' : ''}`}>
                {!isCollapsed && (
                    <div className="matrix-grid-header">
                        {labels.map((label, i) => (
                            <div key={i} className="matrix-col-label">
                                {label}
                            </div>
                        ))}
                    </div>
                )}

                <div className="matrix-workspace">
                    {!isCollapsed && (
                    <svg className="matrix-svg-layer" preserveAspectRatio="none">
                        {/* Render individual line segments for the active scale */}
                        {activeNodes.map((node, i) => {
                            if (i === activeNodes.length - 1) return null;
                            const nextNode = activeNodes[i + 1];

                            const getRawPos = (colIndex: number, pc: number, d: number) => {
                                let diff = pc - NATURAL_PITCHES[d];
                                if (diff > 6) diff -= 12;
                                if (diff < -6) diff += 12;
                                return {
                                    xPct: (colIndex + 0.5) / scaleLength * 100,
                                    yDiff: diff
                                };
                            };

                            const rp1 = getRawPos(node.col, node.pc, node.d);
                            const rp2 = getRawPos(nextNode.col, nextNode.pc, nextNode.d);

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
                    )}

                    <div className="matrix-nodes-layer">
                        {columns.map(colIndex => {
                            const nodesInCol = (COLUMN_NODES[scaleLength] && COLUMN_NODES[scaleLength][colIndex]) || [];
                            return (
                                <div key={colIndex} className="matrix-col">
                                    {nodesInCol.map(({ pc, d }) => {
                                        // Position node vertically based on pitch diff
                                        let diff = pc - NATURAL_PITCHES[d];
                                        if (diff > 6) diff -= 12;
                                        if (diff < -6) diff += 12;

                                        const label = INTERVAL_NAMES[pc] || '?';
                                        const hueClass = getIntervalHueClass(label);
                                        const isActive = activeNodes.some(n => n.col === colIndex && n.pc === pc);

                                        if (isCollapsed && !isActive) return null;

                                        // Compute exact note spelling
                                        const rootIndex = getNoteIndex(selectedRoot);
                                        const absolutePitchClass = (rootIndex + pc) % 12;
                                        const properNote = getProperSpelling(selectedRoot, absolutePitchClass, d);
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
