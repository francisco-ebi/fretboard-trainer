import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getNoteAtPosition, getInterval, getOctave, getInstrumentConfig, areEnharmonicallyEquivalent, type Note, type NamingSystem, type Instrument } from '@/utils/musicTheory';
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
    interactiveMode?: boolean;
    interactiveRootNotePos?: { stringIndex: number, fret: number } | null;
    interactiveTogglableNotes?: Note[];
    customVoicingKeys?: string[];
    onInteractiveRootClick?: (stringIndex: number, fret: number) => void;
    onInteractiveNoteToggle?: (stringIndex: number, fret: number) => void;
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

const Fretboard: React.FC<FretboardProps> = ({ 
    selectedRoot, scaleNotes, characteristicInterval, namingSystem, instrument, 
    tuningOffsets, stringCount, prediction, voicings,
    interactiveMode, interactiveRootNotePos, interactiveTogglableNotes, customVoicingKeys, 
    onInteractiveRootClick, onInteractiveNoteToggle 
}) => {
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
            const physicalNote = getNoteAtPosition(instrument, stringIndex, fret, tuningOffsets, stringCount, useFlats);

            const theoreticalNote = scaleNotes.find(scaleNote => areEnharmonicallyEquivalent(scaleNote, physicalNote));
            const isNoteInScale = !!theoreticalNote;
            
            const interactiveTheoreticalNote = interactiveTogglableNotes?.find(n => areEnharmonicallyEquivalent(n, physicalNote));
            const isNoteTogglable = !!interactiveTheoreticalNote;

            const noteToDisplay = theoreticalNote || interactiveTheoreticalNote || physicalNote;

            let isVoicingMatch = false;
            if (voicings && selectedVoicingIndex !== null && voicings[selectedVoicingIndex]) {
                isVoicingMatch = voicings[selectedVoicingIndex].frets[stringIndex] === fret;
            }

            const isRoot = theoreticalNote === selectedRoot || interactiveTheoreticalNote === selectedRoot;
            
            // Interactive custom voicing logic
            const isClickableRoot = interactiveMode && !interactiveRootNotePos && isRoot && stringIndex >= 3 && stringIndex <= 5;
            const isCustomVoicingMode = interactiveMode && interactiveRootNotePos !== null;
            const isCustomActive = isCustomVoicingMode && customVoicingKeys?.includes(`${stringIndex}-${fret}`);

            let minVoicingFret = 999;
            let maxVoicingFret = -1;
            if (isCustomVoicingMode && customVoicingKeys) {
                customVoicingKeys.forEach(k => {
                    const f = parseInt(k.split('-')[1]);
                    if (f > 0) {
                        minVoicingFret = Math.min(minVoicingFret, f);
                        maxVoicingFret = Math.max(maxVoicingFret, f);
                    }
                });
            }
            if (minVoicingFret === 999) minVoicingFret = interactiveRootNotePos?.fret || 0;
            if (maxVoicingFret === -1) maxVoicingFret = interactiveRootNotePos?.fret || 0;

            const isWithinBoundary = fret === 0 || (fret >= minVoicingFret - 2 && fret <= maxVoicingFret + 2);
            const isAvailableForToggle = isCustomVoicingMode && isNoteTogglable && isWithinBoundary;
            const isOutline = isAvailableForToggle && !isCustomActive;

            const isActive = isVoicingMatch || (selectedVoicingIndex === null && isNoteInScale && !isCustomVoicingMode) || isCustomActive || !!isOutline || !!isClickableRoot;

            const interval = isActive && noteToDisplay ? getInterval(selectedRoot, noteToDisplay) : null;
            const isCharacteristic = !!(interval && characteristicInterval && interval === characteristicInterval);
            const octave = getOctave(instrument, stringIndex, fret, tuningOffsets, stringCount);

            let customInterval = null;
            if (isCustomVoicingMode && interval) {
                const rootOctave = interactiveRootNotePos ? getOctave(instrument, interactiveRootNotePos.stringIndex, interactiveRootNotePos.fret, tuningOffsets, stringCount) : 0;
                if (octave > rootOctave || (octave === rootOctave && fret > (interactiveRootNotePos?.fret || 0) + 12)) {
                    if (interval === '2') customInterval = '9';
                    else if (interval === 'b2') customInterval = 'b9';
                    else if (interval === 'b3') customInterval = '#9';
                    else if (interval === '4') customInterval = '11';
                    else if (interval === 'b5') customInterval = '#11';
                    else if (interval === '6') customInterval = '13';
                    else if (interval === 'b6') customInterval = 'b13';
                }
            }

            const handleNoteClick = () => {
                if (isClickableRoot && onInteractiveRootClick) {
                    onInteractiveRootClick(stringIndex, fret);
                } else if ((isOutline || isCustomActive) && onInteractiveNoteToggle) {
                    onInteractiveNoteToggle(stringIndex, fret);
                }
            };

            const isPredicted = prediction?.predictedStringNumber === stringIndex && prediction?.predictedFret === fret;

            const wasInScale = prevScaleNotes?.some(prevNote => areEnharmonicallyEquivalent(prevNote, physicalNote));
            const shouldShake = isActive && contextChanged && !!wasInScale;

            const centerIndex = config.inlayCenterStringIndex;
            const isSingleInlay = INLAY_FRETS.includes(fret) && stringIndex === centerIndex;

            let isDoubleInlayTop = false;
            let isDoubleInlayBottom = false;

            if (DOUBLE_INLAY_FRETS.includes(fret)) {
                isDoubleInlayTop = stringIndex === centerIndex + 1;
                isDoubleInlayBottom = stringIndex === centerIndex - 2;
            }

            const staggerDelay = fret * 0.02 + stringIndex * 0.01;

            fretElements.push(
                <div
                    key={`fret-${stringIndex}-${fret}`}
                    className={`fret ${fret === 0 ? 'open-string' : ''}`}
                    role="gridcell"
                    aria-label={isActive ? `${noteToDisplay} at Fret ${fret}` : `Fret ${fret} (Empty)`}
                >
                    <div className="string-line"></div>

                    {isSingleInlay && <div className="inlay-dot" style={{ top: '100%', transform: 'translate(-50%, -50%)' }} />}
                    {(isDoubleInlayTop || isDoubleInlayBottom) && <div className="inlay-dot" />}

                    <AnimatePresence>
                        {isActive && (
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
