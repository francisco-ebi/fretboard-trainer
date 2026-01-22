import React from 'react';
import { getNoteAtPosition, getNoteName, getInterval, type Note, type NamingSystem } from '../utils/musicTheory';
import './Fretboard.css';

interface FretboardProps {
    selectedRoot: Note;
    scaleNotes: Note[];
    namingSystem: NamingSystem;
}

const STRINGS = 6;
const FRETS = 15; // 0 (open) to 15

const Fretboard: React.FC<FretboardProps> = ({ selectedRoot, scaleNotes, namingSystem }) => {
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

            fretElements.push(
                <div key={`fret-${stringIndex}-${fret}`} className={`fret ${fret === 0 ? 'open-string' : ''}`}>
                    {/* The string line itself */}
                    <div className="string-line"></div>

                    {/* The note marker */}
                    {isNoteInScale && (
                        <div className={`note-marker ${isRoot ? 'root-note' : ''}`}>
                            <span className="note-name">{getNoteName(note, namingSystem)}</span>
                            <hr className="note-separator" />
                            <span className="note-interval">{interval}</span>
                        </div>
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
