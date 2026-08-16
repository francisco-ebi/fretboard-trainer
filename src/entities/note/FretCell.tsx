import React from 'react';
import { NoteMarker } from '@/entities/note';
import { type Note, type NamingSystem } from '@/shared/lib/music/musicTheory';

/**
 * Role a cell plays in a practice question. Kept as a single string rather than
 * a set of booleans so it stays cheap to compare in the memo below.
 *
 * CANDIDATE marks a tappable cell on the string being asked about; its marker
 * stays hidden (that is the whole question), so the hit target has to live on
 * the cell itself rather than on the note marker.
 */
export type PracticeCellState = 'ANCHOR' | 'CANDIDATE' | 'CORRECT' | 'WRONG' | 'REVEAL';

interface FretCellProps {
    stringIndex: number;
    fret: number;
    noteToDisplay: Note;
    isRoot: boolean;
    namingSystem: NamingSystem;
    interval: string | null;
    isCharacteristic: boolean;
    octave: number;
    customInterval: string | null;
    isClickableRoot: boolean;
    isOutline: boolean;
    isCustomActive: boolean;
    isActive: boolean;
    shouldShake: boolean;
    isSingleInlay: boolean;
    isDoubleInlayTop: boolean;
    isDoubleInlayBottom: boolean;
    isMeasured?: boolean;
    isPredicted?: boolean;
    practiceState?: PracticeCellState | null;
    /** Practice mastery, 0..1. Null/undefined means untracked — no visual change. */
    strength?: number | null;
    onInteractiveRootClick?: (stringIndex: number, fret: number) => void;
    onInteractiveNoteToggle?: (stringIndex: number, fret: number) => void;
    onNoteMeasureClick?: (stringIndex: number, fret: number, note: Note, octave: number) => void;
    onPracticeClick?: (stringIndex: number, fret: number) => void;
}

const FretCellComponent: React.FC<FretCellProps> = ({
    stringIndex, fret, noteToDisplay, isRoot, namingSystem, interval,
    isCharacteristic, octave, customInterval, isClickableRoot,
    isOutline, isCustomActive, isActive, shouldShake,
    isSingleInlay, isDoubleInlayTop, isDoubleInlayBottom, isMeasured, isPredicted,
    practiceState, strength,
    onInteractiveRootClick, onInteractiveNoteToggle, onNoteMeasureClick, onPracticeClick
}) => {
    const handleNoteClick = () => {
        if (onNoteMeasureClick) {
            onNoteMeasureClick(stringIndex, fret, noteToDisplay, octave);
        } else if (isClickableRoot && onInteractiveRootClick) {
            onInteractiveRootClick(stringIndex, fret);
        } else if ((isOutline || isCustomActive) && onInteractiveNoteToggle) {
            onInteractiveNoteToggle(stringIndex, fret);
        }
    };

    const practiceClass = practiceState ? `practice-${practiceState.toLowerCase()}` : '';

    return (
        <div
            id={`fret-${stringIndex}-${fret}`}
            className={`fret ${fret === 0 ? 'open-string' : ''} ${practiceClass}`}
            role="gridcell"
            aria-label={isActive ? `${noteToDisplay} at Fret ${fret}` : `Fret ${fret} (Empty)`}
            // The answer to a practice question is a cell whose marker is
            // hidden, so the whole cell has to be the hit target.
            onClick={onPracticeClick ? () => onPracticeClick(stringIndex, fret) : undefined}
        >
            <div className="string-line"></div>

            {isSingleInlay && <div className="inlay-dot" style={{ top: '100%', transform: 'translate(-50%, -50%)' }} />}
            {(isDoubleInlayTop || isDoubleInlayBottom) && <div className="inlay-dot" />}

            <div className={`note-marker-wrapper ${isActive ? '' : 'hidden'} ${isPredicted ? 'predicted' : ''}`}>
                <NoteMarker
                    note={noteToDisplay}
                    isRoot={isRoot}
                    namingSystem={namingSystem}
                    interval={interval}
                    isCharacteristic={isCharacteristic}
                    shouldShake={shouldShake}
                    octave={octave}
                    isInactiveOutline={!!isOutline}
                    isMeasured={!!isMeasured}
                    customInterval={customInterval}
                    strength={strength ?? undefined}
                    onClick={(onNoteMeasureClick || isClickableRoot || isOutline || isCustomActive) ? handleNoteClick : undefined}
                />
            </div>
        </div>
    );
};

// Custom comparison function to ignore unstable function references
export const FretCell = React.memo(FretCellComponent, (prev, next) => {
    return prev.stringIndex === next.stringIndex &&
        prev.fret === next.fret &&
        prev.noteToDisplay === next.noteToDisplay &&
        prev.isRoot === next.isRoot &&
        prev.namingSystem === next.namingSystem &&
        prev.interval === next.interval &&
        prev.isCharacteristic === next.isCharacteristic &&
        prev.octave === next.octave &&
        prev.customInterval === next.customInterval &&
        prev.isClickableRoot === next.isClickableRoot &&
        prev.isOutline === next.isOutline &&
        prev.isCustomActive === next.isCustomActive &&
        prev.isActive === next.isActive &&
        prev.shouldShake === next.shouldShake &&
        prev.isSingleInlay === next.isSingleInlay &&
        prev.isDoubleInlayTop === next.isDoubleInlayTop &&
        prev.isDoubleInlayBottom === next.isDoubleInlayBottom &&
        prev.isMeasured === next.isMeasured &&
        prev.isPredicted === next.isPredicted &&
        prev.practiceState === next.practiceState &&
        prev.strength === next.strength &&
        // Practice mode swaps this callback between undefined and a handler as
        // cells become answerable; missing it would freeze cells un-tappable.
        !!prev.onPracticeClick === !!next.onPracticeClick;
});
