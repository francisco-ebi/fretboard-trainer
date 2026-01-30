import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getNoteAtPosition, getInterval, getOctave, getInstrumentConfig, type Note, type NamingSystem, type Instrument } from '@/utils/musicTheory';
import { useOrientation } from '@/context/OrientationContext';
import NoteMarker from '@/components/NoteMarker';
import './Fretboard.css';

import { type PredictionResult } from '@/utils/audio/prediction-engine';

interface FretboardProps {
    selectedRoot: Note;
    scaleNotes: Note[];
    namingSystem: NamingSystem;
    instrument: Instrument;
    tuningOffsets: number[];
    stringCount: number;
    prediction?: PredictionResult | null;
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

const Fretboard: React.FC<FretboardProps> = ({ selectedRoot, scaleNotes, namingSystem, instrument, tuningOffsets, stringCount, prediction }) => {
    const { orientation } = useOrientation();
    const prevScaleNotes = usePrevious(scaleNotes);
    const prevRoot = usePrevious(selectedRoot);

    // Check if the musical context actually changed (to prevent shaking on unrelated renders)
    const contextChanged = prevRoot !== selectedRoot || prevScaleNotes !== scaleNotes;

    const config = getInstrumentConfig(instrument, stringCount);
    const STRINGS = config.strings;

    // Generate the fretboard data structure
    const renderStrings = () => {
        const stringElements = [];
        // Loop from Top (High Index 0) to Bottom (Low Index STRINGS-1)
        for (let stringIndex = 0; stringIndex < STRINGS; stringIndex++) {
            stringElements.push(
                <div key={`string-${stringIndex}`} className="string-row" role="row" aria-label={`String ${stringIndex + 1}`}>
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

            // Prediction Match Logic
            const isPredicted = prediction?.predictedStringNumber === stringIndex && prediction?.predictedFret === fret;
            if (isPredicted) {
                console.log(`Predicted: ${note} at Fret ${fret}, String ${stringIndex}`);
            }

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
                isDoubleInlayTop = stringIndex === centerIndex + 1;
                isDoubleInlayBottom = stringIndex === centerIndex - 2;
            }

            // Stagger delay calculation: fret * 0.02s + string * 0.01s (ripple effect)
            const staggerDelay = fret * 0.02 + stringIndex * 0.01;

            fretElements.push(
                <div
                    key={`fret-${stringIndex}-${fret}`}
                    className={`fret ${fret === 0 ? 'open-string' : ''}`}
                    role="gridcell"
                    aria-label={isNoteInScale ? `${note} at Fret ${fret}` : `Fret ${fret} (Empty)`}
                >
                    {/* The string line itself */}
                    <div className="string-line"></div>

                    {/* Inlay Dots */}
                    {isSingleInlay && <div className="inlay-dot" style={{ top: '100%', transform: 'translate(-50%, -50%)' }} />}
                    {(isDoubleInlayTop || isDoubleInlayBottom) && <div className="inlay-dot" />}

                    {/* The note marker */}
                    <AnimatePresence>
                        {isNoteInScale && (
                            <motion.div
                                variants={{
                                    hidden: { scale: 0, opacity: 0 },
                                    visible: {
                                        scale: 1,
                                        opacity: 1,
                                        zIndex: 2,
                                        transition: {
                                            type: "spring",
                                            stiffness: 400,
                                            damping: 25,
                                            delay: staggerDelay
                                        }
                                    },
                                    predicted: {
                                        scale: 1.3,
                                        opacity: 1,
                                        zIndex: 10,
                                        x: [0, -2, 2, -2, 2, 0],
                                        transition: {
                                            x: {
                                                duration: 0.4,
                                                repeat: Infinity,
                                                repeatDelay: 1,
                                                ease: "easeInOut"
                                            },
                                            scale: { duration: 0.2 }
                                        }
                                    }
                                }}
                                initial="hidden"
                                animate={isPredicted ? "predicted" : "visible"}
                                exit="hidden"
                                style={{ position: 'relative' }}
                            >
                                {isPredicted && (
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                        style={{
                                            position: 'absolute',
                                            top: '-6px',
                                            left: '-6px',
                                            right: '-6px',
                                            bottom: '-6px',
                                            borderRadius: '50%',
                                            border: '2px dashed #34D399',
                                            pointerEvents: 'none'
                                        }}
                                    />
                                )}
                                <NoteMarker
                                    note={note}
                                    isRoot={isRoot}
                                    namingSystem={namingSystem}
                                    interval={interval}
                                    shouldShake={shouldShake}
                                    octave={octave}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

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
            <div
                className={`fretboard ${orientation.toLowerCase()}`}
                role="grid"
                aria-label={`${instrument} fretboard`}
            >
                {renderStrings()}
            </div>
            {renderFretNumbers()}
        </div>
    );
};

export default Fretboard;
