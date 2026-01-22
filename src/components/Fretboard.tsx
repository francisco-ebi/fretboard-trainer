import React, { useEffect, useRef, useState } from 'react';
import { getNoteAtPosition, getNoteName, getInterval, type Note, type NamingSystem } from '../utils/musicTheory';
import './Fretboard.css';

interface FretboardProps {
    selectedRoot: Note;
    scaleNotes: Note[];
    namingSystem: NamingSystem;
}

const STRINGS = 6;
const FRETS = 15; // 0 (open) to 15

// Helper hook to track previous value
function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T>(undefined);
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}

interface NoteMarkerProps {
    note: Note;
    isRoot: boolean;
    namingSystem: NamingSystem;
    interval: string | null;
    shouldShake: boolean;
}

const NoteMarker: React.FC<NoteMarkerProps> = ({ note, isRoot, namingSystem, interval, shouldShake }) => {
    const [shaking, setShaking] = useState(false);

    useEffect(() => {
        if (shouldShake) {
            setShaking(true);
            const timer = setTimeout(() => setShaking(false), 400);
            return () => clearTimeout(timer);
        }
    }, [shouldShake]);

    return (
        <div className={`note-marker ${isRoot ? 'root-note' : ''} ${shaking ? 'shake' : ''}`}>
            <span className="note-name">{getNoteName(note, namingSystem)}</span>
            <hr className="note-separator" />
            <span className="note-interval">{interval}</span>
        </div>
    );
};

const Fretboard: React.FC<FretboardProps> = ({ selectedRoot, scaleNotes, namingSystem }) => {
    const prevScaleNotes = usePrevious(scaleNotes);
    const prevRoot = usePrevious(selectedRoot);

    // Check if the musical context actually changed (to prevent shaking on unrelated renders)
    // We compare root or reference of scaleNotes (assuming new array on change)
    const contextChanged = prevRoot !== selectedRoot || prevScaleNotes !== scaleNotes;

    // Generate the fretboard data structure
    // We want to render strings from High E (top visual) to Low E (bottom visual) usually?
    // Or standard tab view: Top line = High E (String 1), Bottom line = Low E (String 6)
    // Our utility `getNoteAtPosition` uses index 0 for Low E.
    // So visual render order: String 1 (index 5) -> String 6 (index 0)

    const renderStrings = () => {
        const stringElements = [];
        // Loop from 5 down to 0 to render High E at the top
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
            const note = getNoteAtPosition(stringIndex, fret);
            const isNoteInScale = scaleNotes.includes(note);
            const isRoot = note === selectedRoot;
            const interval = isNoteInScale ? getInterval(selectedRoot, note) : null;

            // Shake if context changed AND note was in previous scale
            const wasInScale = prevScaleNotes?.includes(note);
            const shouldShake = isNoteInScale && contextChanged && !!wasInScale;

            fretElements.push(
                <div key={`fret-${stringIndex}-${fret}`} className={`fret ${fret === 0 ? 'open-string' : ''}`}>
                    {/* The string line itself */}
                    <div className="string-line"></div>

                    {/* The note marker */}
                    {isNoteInScale && (
                        <NoteMarker
                            note={note}
                            isRoot={isRoot}
                            namingSystem={namingSystem}
                            interval={interval}
                            shouldShake={shouldShake}
                        />
                    )}

                    {/* Fret wire (visual separator, maybe handle via CSS borders) */}
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
        <div className="fretboard-container">
            <div className="fretboard">
                {renderStrings()}
            </div>
            {renderFretNumbers()}
        </div>
    );
};

export default Fretboard;
