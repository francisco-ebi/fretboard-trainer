import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getNoteAtPosition, getInterval, getOctave, getInstrumentConfig, type Note, type NamingSystem, type Instrument } from '@/utils/musicTheory';
import { type Voicing } from '@/utils/chordVoicings';
import { useOrientation } from '@/context/OrientationContext';
import { useTranslation } from 'react-i18next';
import NoteMarker from '@/components/NoteMarker';
import './Fretboard.css';

import { type PredictionResult } from '@/utils/audio/prediction-engine';

interface FretboardProps {
    selectedRoot: Note;
    scaleNotes: Note[];
    characteristicInterval: string | undefined;
    namingSystem: NamingSystem;
    instrument: Instrument;
    tuningOffsets: number[];
    stringCount: number;
    prediction?: PredictionResult | null;
    voicings?: Voicing[];
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

const Fretboard: React.FC<FretboardProps> = ({ selectedRoot, scaleNotes, characteristicInterval, namingSystem, instrument, tuningOffsets, stringCount, prediction, voicings }) => {
    const { orientation } = useOrientation();
    const { t } = useTranslation();
    const prevScaleNotes = usePrevious(scaleNotes);
    const prevRoot = usePrevious(selectedRoot);
    const [selectedVoicingIndex, setSelectedVoicingIndex] = React.useState<number | null>(null);

    // Reset selected voicing when the chord changes
    useEffect(() => {
        setSelectedVoicingIndex(null);
    }, [voicings]);

    // Check if the musical context actually changed
    const contextChanged = prevRoot !== selectedRoot || prevScaleNotes !== scaleNotes;

    const config = getInstrumentConfig(instrument, stringCount);
    const STRINGS = config.strings;

    // Generate the fretboard data structure
    const renderStrings = () => {
        const stringElements = [];

        if (orientation === 'VERTICAL') {
            // Display lowest string (highest index) on the left
            for (let stringIndex = STRINGS - 1; stringIndex >= 0; stringIndex--) {
                stringElements.push(
                    <div key={`string-${stringIndex}`} className="string-row" role="row" aria-label={`String ${stringIndex + 1}`}>
                        {renderFrets(stringIndex)}
                    </div>
                );
            }
        } else {
            // Loop from Top (High Index 0) to Bottom (Low Index STRINGS-1)
            for (let stringIndex = 0; stringIndex < STRINGS; stringIndex++) {
                stringElements.push(
                    <div key={`string-${stringIndex}`} className="string-row" role="row" aria-label={`String ${stringIndex + 1}`}>
                        {renderFrets(stringIndex)}
                    </div>
                );
            }
        }
        return stringElements;
    };

    const renderFrets = (stringIndex: number) => {
        const useFlats = scaleNotes.some(n => n.includes('b'));
        const fretElements = [];
        for (let fret = 0; fret <= FRETS; fret++) {
            const note = getNoteAtPosition(instrument, stringIndex, fret, tuningOffsets, stringCount, useFlats);

            let isNoteInScale = false;
            if (voicings && selectedVoicingIndex !== null && voicings[selectedVoicingIndex]) {
                isNoteInScale = voicings[selectedVoicingIndex].frets[stringIndex] === fret;
            } else {
                isNoteInScale = scaleNotes.includes(note);
            }

            const isRoot = note === selectedRoot;
            const interval = isNoteInScale ? getInterval(selectedRoot, note) : null;
            const isCharacteristic = !!(interval && characteristicInterval && interval === characteristicInterval);
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
                                            border: '2px dashed #D3AF37',
                                            pointerEvents: 'none'
                                        }}
                                    />
                                )}
                                <NoteMarker
                                    note={note}
                                    isRoot={isRoot}
                                    namingSystem={namingSystem}
                                    interval={interval}
                                    isCharacteristic={isCharacteristic}
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

    const renderDesktopVoicingCarousel = () => {
        if (!voicings || voicings.length === 0) return null;

        return (
            <div className="desktop-voicing-carousel">
                {voicings.map((voicing, index) => {
                    const isActive = selectedVoicingIndex === index;
                    return (
                        <motion.button
                            key={`carousel-btn-${index}`}
                            className={`carousel-btn ${isActive ? 'active' : ''}`}
                            onClick={() => setSelectedVoicingIndex(isActive ? null : index)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            title={`Select Voicing ${index + 1}`}
                        >
                            <span className="carousel-btn-number">{index + 1}</span>
                            <div className="carousel-btn-details">
                                <span className="carousel-btn-label">
                                    {isActive ? t('fretboard.selected') : t('fretboard.voicing')}
                                </span>
                                <span className="carousel-btn-desc">
                                    {voicing.startFret === 0 ? t('fretboard.openPosition') : t('fretboard.fretX', { fret: voicing.startFret })}
                                </span>
                            </div>
                        </motion.button>
                    );
                })}
            </div>
        );
    };

    const renderMobileVoicingStepper = () => {
        if (!voicings || voicings.length === 0) return null;

        const maxIndex = voicings.length - 1;

        const handlePrevious = () => {
            if (selectedVoicingIndex === null) setSelectedVoicingIndex(maxIndex);
            else if (selectedVoicingIndex === 0) setSelectedVoicingIndex(null);
            else setSelectedVoicingIndex(selectedVoicingIndex - 1);
        };

        const handleNext = () => {
            if (selectedVoicingIndex === null) setSelectedVoicingIndex(0);
            else if (selectedVoicingIndex === maxIndex) setSelectedVoicingIndex(null);
            else setSelectedVoicingIndex(selectedVoicingIndex + 1);
        };

        let displayText = t('fretboard.allNotes');
        if (selectedVoicingIndex !== null) {
            displayText = t('fretboard.voicingXofY', { current: selectedVoicingIndex + 1, total: voicings.length });
        }

        return (
            <div className="mobile-voicing-stepper">
                <button className="stepper-btn" onClick={handlePrevious}>❮</button>
                <div className="stepper-text">{displayText}</div>
                <button className="stepper-btn" onClick={handleNext}>❯</button>
            </div>
        );
    };

    return (
        <>
            <div className={`fretboard-container ${instrument.toLowerCase()}-mode ${orientation.toLowerCase()}`}>
                {orientation === 'HORIZONTAL' && renderDesktopVoicingCarousel()}
                <div
                    className={`fretboard ${orientation.toLowerCase()}`}
                    role="grid"
                    aria-label={`${instrument} fretboard`}
                    style={orientation === 'VERTICAL' ? { gridTemplateColumns: `repeat(${STRINGS}, 4rem)` } : undefined}
                >
                    {renderStrings()}
                </div>
                {renderFretNumbers()}
                {orientation === 'VERTICAL' && renderDesktopVoicingCarousel()}
            </div>
            {renderMobileVoicingStepper()}
        </>
    );
};

export default Fretboard;
