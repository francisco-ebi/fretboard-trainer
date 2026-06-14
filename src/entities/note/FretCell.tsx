import React from 'react';
import { NoteMarker } from '@/entities/note';
import { type Note, type NamingSystem } from '@/shared/lib/music/musicTheory';

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
    onInteractiveRootClick?: (stringIndex: number, fret: number) => void;
    onInteractiveNoteToggle?: (stringIndex: number, fret: number) => void;
}

const FretCellComponent: React.FC<FretCellProps> = ({
    stringIndex, fret, noteToDisplay, isRoot, namingSystem, interval,
    isCharacteristic, octave, customInterval, isClickableRoot,
    isOutline, isCustomActive, isActive, shouldShake,
    isSingleInlay, isDoubleInlayTop, isDoubleInlayBottom,
    onInteractiveRootClick, onInteractiveNoteToggle
}) => {
    const handleNoteClick = () => {
        if (isClickableRoot && onInteractiveRootClick) {
            onInteractiveRootClick(stringIndex, fret);
        } else if ((isOutline || isCustomActive) && onInteractiveNoteToggle) {
            onInteractiveNoteToggle(stringIndex, fret);
        }
    };

    return (
        <div
            className={`fret ${fret === 0 ? 'open-string' : ''}`}
            role="gridcell"
            aria-label={isActive ? `${noteToDisplay} at Fret ${fret}` : `Fret ${fret} (Empty)`}
        >
            <div className="string-line"></div>

            {isSingleInlay && <div className="inlay-dot" style={{ top: '100%', transform: 'translate(-50%, -50%)' }} />}
            {(isDoubleInlayTop || isDoubleInlayBottom) && <div className="inlay-dot" />}

            <div className={`note-marker-wrapper ${isActive ? '' : 'hidden'}`}>
                <NoteMarker
                    note={noteToDisplay}
                    isRoot={isRoot}
                    namingSystem={namingSystem}
                    interval={interval}
                    isCharacteristic={isCharacteristic}
                    shouldShake={shouldShake}
                    octave={octave}
                    isInactiveOutline={!!isOutline}
                    customInterval={customInterval}
                    onClick={(isClickableRoot || isOutline || isCustomActive) ? handleNoteClick : undefined}
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
        prev.isDoubleInlayBottom === next.isDoubleInlayBottom;
});
