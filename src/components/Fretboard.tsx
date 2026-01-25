import React, { useEffect, useRef } from 'react';
import { getNoteAtPosition, getInterval, getOctave, getInstrumentConfig, type Note, type NamingSystem, type Instrument } from '../utils/musicTheory';
import NoteMarker from './NoteMarker';
import './Fretboard.css';

export type Orientation = 'HORIZONTAL' | 'VERTICAL';

interface FretboardProps {
    selectedRoot: Note;
    scaleNotes: Note[];
    namingSystem: NamingSystem;
    instrument: Instrument;
    tuningOffsets: number[];
    orientation: Orientation;
    stringCount: number;
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

const Fretboard: React.FC<FretboardProps> = ({ selectedRoot, scaleNotes, namingSystem, instrument, tuningOffsets, orientation, stringCount }) => {
    const prevScaleNotes = usePrevious(scaleNotes);
    const prevRoot = usePrevious(selectedRoot);

    // Check if the musical context actually changed (to prevent shaking on unrelated renders)
    const contextChanged = prevRoot !== selectedRoot || prevScaleNotes !== scaleNotes;

    const config = getInstrumentConfig(instrument, stringCount);
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
            const note = getNoteAtPosition(instrument, stringIndex, fret, tuningOffsets, stringCount);
            const isNoteInScale = scaleNotes.includes(note);
            const isRoot = note === selectedRoot;
            const interval = isNoteInScale ? getInterval(selectedRoot, note) : null;
            const octave = getOctave(instrument, stringIndex, fret, tuningOffsets, stringCount);

            // Shake if context changed AND note was in previous scale
            const wasInScale = prevScaleNotes?.includes(note);
            const shouldShake = isNoteInScale && contextChanged && !!wasInScale;

            // Inlay Logic
            const centerIndex = config.inlayCenterStringIndex;
            const isSingleInlay = INLAY_FRETS.includes(fret) && stringIndex === centerIndex;

            // Double Inlay logic
            let isDoubleInlayTop = false;
            let isDoubleInlayBottom = false;

            if (DOUBLE_INLAY_FRETS.includes(fret)) {

                // Determine spacing based on total strings to keep dots proportional
                // For 4 string bass (center=2): dots at 3 and 0 is too wide? No, 3 and 0 is fine.
                // Standard logic: Top is +1 from center, Bottom is -2 from center?
                // Guitar 6 (Center 3): Top 4 (B string), Bottom 1 (A string).
                // Guitar 7 (Center 3): Top 4 (G), Bottom 1 (E).
                // Guitar 8 (Center 4): Top 5 (G), Bottom 2 (A). 

                // Let's generalize: Top is Center + 1, Bottom is Center - 2.
                // Works for Guitar 6 (3+1=4, 3-2=1)
                // Works for Bass 4 (2+1=3, 2-2=0) -> 0 is E string.
                // Works for Guitar 7 (3+1=4, 3-2=1)
                // Works for Guitar 8 (4+1=5, 4-2=2)

                isDoubleInlayTop = stringIndex === centerIndex + 1;
                isDoubleInlayBottom = stringIndex === centerIndex - 2;
            }

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
        <div className={`fretboard-container ${instrument.toLowerCase()}-mode ${orientation.toLowerCase()}`}>
            <div className={`fretboard ${orientation.toLowerCase()}`}>
                {renderStrings()}
            </div>
            {renderFretNumbers()}
        </div>
    );
};

export default Fretboard;
