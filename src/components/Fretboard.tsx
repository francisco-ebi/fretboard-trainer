import React, { useEffect, useRef } from 'react';
import { getNoteAtPosition, getInterval, getOctave, type Note, type NamingSystem, type Instrument, INSTRUMENT_CONFIGS } from '../utils/musicTheory';
import NoteMarker from './NoteMarker';
import './Fretboard.css';

interface FretboardProps {
    selectedRoot: Note;
    scaleNotes: Note[];
    namingSystem: NamingSystem;
    instrument: Instrument;
}

const FRETS = 18; // 0 (open) to 18
const INLAY_FRETS = [3, 5, 7, 9, 15, 17];
const DOUBLE_INLAY_FRETS = [12];

// Helper hook to track previous value
function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T>(undefined);
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}

const Fretboard: React.FC<FretboardProps> = ({ selectedRoot, scaleNotes, namingSystem, instrument }) => {
    const prevScaleNotes = usePrevious(scaleNotes);
    const prevRoot = usePrevious(selectedRoot);

    // Check if the musical context actually changed (to prevent shaking on unrelated renders)
    const contextChanged = prevRoot !== selectedRoot || prevScaleNotes !== scaleNotes;

    const config = INSTRUMENT_CONFIGS[instrument];
    const STRINGS = config.strings;

    // Generate the fretboard data structure
    const renderStrings = () => {
        const stringElements = [];
        // Loop from Top (High Index) to Bottom (Low Index)
        for (let stringIndex = STRINGS - 1; stringIndex >= 0; stringIndex--) {
            stringElements.push(
                <div key={`string-${stringIndex}`} className="string-row">
                    {renderFrets(stringIndex)}
                </div>
            );
        }
        return stringElements;
    };

    const renderFrets = (stringIndex: number) => {
        const fretElements = [];
        for (let fret = 0; fret <= FRETS; fret++) {
            const note = getNoteAtPosition(instrument, stringIndex, fret);
            const isNoteInScale = scaleNotes.includes(note);
            const isRoot = note === selectedRoot;
            const interval = isNoteInScale ? getInterval(selectedRoot, note) : null;
            const octave = getOctave(instrument, stringIndex, fret);

            // Shake if context changed AND note was in previous scale
            const wasInScale = prevScaleNotes?.includes(note);
            const shouldShake = isNoteInScale && contextChanged && !!wasInScale;

            // Inlay Logic
            const centerIndex = config.inlayCenterStringIndex;
            const isSingleInlay = INLAY_FRETS.includes(fret) && stringIndex === centerIndex;
            // Double Inlay logic: +1 (Top) and -2 (Bottom) relative to center gap string (which is 'centerIndex')
            // Guitar (Center=3): Top=4, Bottom=1.
            // Bass (Center=2): Top=3, Bottom=0.
            const isDoubleInlayTop = DOUBLE_INLAY_FRETS.includes(fret) && stringIndex === centerIndex + 1;
            const isDoubleInlayBottom = DOUBLE_INLAY_FRETS.includes(fret) && stringIndex === centerIndex - 2;

            fretElements.push(
                <div key={`fret-${stringIndex}-${fret}`} className={`fret ${fret === 0 ? 'open-string' : ''}`}>
                    {/* The string line itself */}
                    <div className="string-line"></div>

                    {/* Inlay Dots */}
                    {isSingleInlay && <div className="inlay-dot" style={{ top: '100%', transform: 'translate(-50%, -50%)' }} />}
                    {(isDoubleInlayTop || isDoubleInlayBottom) && <div className="inlay-dot" />}

                    {/* The note marker */}
                    {isNoteInScale && (
                        <NoteMarker
                            note={note}
                            isRoot={isRoot}
                            namingSystem={namingSystem}
                            interval={interval}
                            shouldShake={shouldShake}
                            octave={octave}
                        />
                    )}

                    {/* Fret wire */}
                </div>
            );
        }
        return fretElements;
    };

    // Helper to render fret numbers
    const renderFretNumbers = () => {
        const fretNumbers = [];
        for (let fret = 0; fret <= FRETS; fret++) {
            fretNumbers.push(
                <div key={`fret-num-${fret}`} className="fret-number">
                    {fret}
                </div>
            );
        }
        return <div className="fret-numbers-row">{fretNumbers}</div>;
    }

    return (
        <div className={`fretboard-container ${instrument.toLowerCase()}-mode`}>
            <div className="fretboard">
                {renderStrings()}
            </div>
            {renderFretNumbers()}
        </div>
    );
};

export default Fretboard;
