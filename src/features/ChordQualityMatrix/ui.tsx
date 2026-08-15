import React from 'react';
import { useTranslation } from 'react-i18next';
import { CHORD_SYMBOLS, type ChordQuality, type Note } from '@/shared/lib/music/musicTheory';
import { Well, FieldLabel } from '@/shared/ui';
import './ui.css';

interface ChordQualityMatrixProps {
    selectedRoot: Note;
    selectedQuality: ChordQuality;
    onQualityChange: (quality: ChordQuality) => void;
}

// "Periodic table" of chord qualities: rows are families, columns add stacked
// thirds. Reading a row answers "what if I keep stacking thirds?", reading a
// column answers "what's the minor/diminished version of this?". Cells may
// hold two qualities when two chords share the same family/degree slot
// (m7 + mM7, m7b5 + dim7). Empty cells are structural gaps in the system.
interface FamilyRow {
    id: string;
    cells: (ChordQuality[] | null)[];
}

const FAMILY_ROWS: FamilyRow[] = [
    { id: 'major', cells: [['MAJOR'], ['MAJ7'], ['MAJ9'], ['MAJ11'], ['MAJ13']] },
    { id: 'dominant', cells: [null, ['DOM7'], ['DOM9'], ['DOM11'], ['DOM13']] },
    { id: 'minor', cells: [['MINOR'], ['MIN7', 'MINMAJ7'], ['MIN9'], ['MIN11'], ['MIN13']] },
    { id: 'diminished', cells: [['DIMINISHED'], ['MIN7B5', 'DIM7'], null, null, null] },
    { id: 'augmented', cells: [['AUGMENTED'], null, null, null, null] },
];

// Sus/add chords modify the triad rather than extend the stack of thirds,
// so they live in their own strip below the table.
const MODIFIERS: ChordQuality[] = ['SUS2', 'SUS4', 'ADD2', 'ADD4', 'ADD6', 'ADD9'];

const COLUMN_LABELS = ['triad', '+7', '+9', '+11', '+13'];

const ChordQualityMatrix: React.FC<ChordQualityMatrixProps> = ({
    selectedRoot,
    selectedQuality,
    onQualityChange
}) => {
    const { t } = useTranslation();

    const renderQualityButton = (quality: ChordQuality, compact: boolean) => {
        const fullName = t(`chords.${quality}`, quality.replace('_', ' '));
        return (
            <button
                key={quality}
                className={`matrix-cell-btn ${compact ? 'compact' : ''} ${selectedQuality === quality ? 'active' : ''}`}
                onClick={() => onQualityChange(quality)}
                title={fullName}
                aria-label={fullName}
            >
                {selectedRoot}{CHORD_SYMBOLS[quality]}
            </button>
        );
    };

    return (
        <Well className="chord-quality-matrix">
            <div className="matrix-grid">
                <div className="matrix-corner" aria-hidden="true"></div>
                {COLUMN_LABELS.map((label, i) => (
                    <FieldLabel key={label} as="div" variant="quiet" className="matrix-col-header">
                        {i === 0 ? t('chordFamilies.triad') : label}
                    </FieldLabel>
                ))}

                {FAMILY_ROWS.map(row => (
                    <React.Fragment key={row.id}>
                        <div className="matrix-row-label">{t(`chordFamilies.${row.id}`)}</div>
                        {row.cells.map((cell, colIndex) => (
                            <div key={colIndex} className="matrix-cell">
                                {cell === null ? (
                                    <div className="matrix-cell-empty" aria-hidden="true">·</div>
                                ) : (
                                    cell.map(quality => renderQualityButton(quality, cell.length > 1))
                                )}
                            </div>
                        ))}
                    </React.Fragment>
                ))}
            </div>

            <div className="matrix-modifiers">
                <span className="matrix-row-label">{t('chordFamilies.modifiers')}</span>
                <div className="matrix-modifier-chips">
                    {MODIFIERS.map(quality => renderQualityButton(quality, false))}
                </div>
            </div>
        </Well>
    );
};

export default ChordQualityMatrix;
