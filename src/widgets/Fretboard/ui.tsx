import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { getNoteAtPosition, getInterval, getOctave, getInstrumentConfig, areEnharmonicallyEquivalent, getDetailedInterval, type Note, type NamingSystem, type Instrument } from '@/shared/lib/music/musicTheory';
import { type Voicing } from '@/shared/lib/music/chordVoicings';
import { useOrientation } from '@/app/providers';
import { useInstrument } from '@/app/providers';

import { FretCell } from '@/entities/note';
import { PredictionOverlay } from '@/features/PredictionControls';
import './ui.css';

interface FretboardProps {
    selectedRoot: Note;
    scaleNotes: Note[];
    characteristicInterval: string | undefined;
    namingSystem: NamingSystem;
    instrument: Instrument;
    tuningOffsets: number[];
    stringCount: number;
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
    tuningOffsets, stringCount, voicings,
    interactiveMode, interactiveRootNotePos, interactiveTogglableNotes, customVoicingKeys,
    onInteractiveRootClick, onInteractiveNoteToggle
}) => {
    const { t } = useTranslation();
    const { orientation } = useOrientation();
    const { colorScheme } = useInstrument();

    const prevScaleNotes = usePrevious(scaleNotes);
    const prevRoot = usePrevious(selectedRoot);
    const [selectedVoicingIndex, setSelectedVoicingIndex] = React.useState<number | null>(null);

    const fretboardRef = useRef<HTMLDivElement>(null);

    type MeasuredNote = { stringIndex: number; fret: number; note: Note; octave: number };
    const [measuredNotes, setMeasuredNotes] = React.useState<MeasuredNote[]>([]);
    const [overlayCoords, setOverlayCoords] = React.useState<{ x1: number, y1: number, x2: number, y2: number, cx: number, cy: number } | null>(null);

    useEffect(() => {
        const updateCoords = () => {
            if (measuredNotes.length !== 2) {
                setOverlayCoords(null);
                return;
            }
            const board = fretboardRef.current;
            if (!board) return;

            const n1 = measuredNotes[0];
            const n2 = measuredNotes[1];

            const cell1 = document.getElementById(`fret-${n1.stringIndex}-${n1.fret}`);
            const cell2 = document.getElementById(`fret-${n2.stringIndex}-${n2.fret}`);

            if (cell1 && cell2) {
                const bRect = board.getBoundingClientRect();
                const c1Rect = cell1.getBoundingClientRect();
                const c2Rect = cell2.getBoundingClientRect();

                const x1 = c1Rect.left + c1Rect.width / 2 - bRect.left;
                const y1 = c1Rect.top + c1Rect.height / 2 - bRect.top;
                const x2 = c2Rect.left + c2Rect.width / 2 - bRect.left;
                const y2 = c2Rect.top + c2Rect.height / 2 - bRect.top;

                setOverlayCoords({
                    x1, y1, x2, y2,
                    cx: (x1 + x2) / 2,
                    cy: (y1 + y2) / 2
                });
            }
        };

        const timerId = setTimeout(updateCoords, 50);
        window.addEventListener('resize', updateCoords);
        return () => {
            clearTimeout(timerId);
            window.removeEventListener('resize', updateCoords);
        };
    }, [measuredNotes, orientation, stringCount]);

    const handleNoteMeasureClick = (stringIndex: number, fret: number, note: Note, octave: number) => {
        if (interactiveMode) return;

        setMeasuredNotes(prev => {
            const existingIndex = prev.findIndex(n => n.stringIndex === stringIndex && n.fret === fret);
            if (existingIndex >= 0) {
                return prev.filter((_, i) => i !== existingIndex);
            }
            if (prev.length >= 2) {
                return [{ stringIndex, fret, note, octave }];
            }
            return [...prev, { stringIndex, fret, note, octave }];
        });
    };

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

            const interval = noteToDisplay ? getInterval(selectedRoot, noteToDisplay) : null;
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

            const isMeasured = measuredNotes.some(mn => mn.stringIndex === stringIndex && mn.fret === fret);

            fretElements.push(
                <FretCell
                    key={`fret-${stringIndex}-${fret}`}
                    stringIndex={stringIndex}
                    fret={fret}
                    noteToDisplay={noteToDisplay}
                    isRoot={isRoot}
                    namingSystem={namingSystem}
                    interval={interval}
                    isCharacteristic={isCharacteristic}
                    octave={octave}
                    customInterval={customInterval}
                    isClickableRoot={isClickableRoot || false}
                    isOutline={isOutline || false}
                    isCustomActive={isCustomActive || false}
                    isActive={isActive || false}
                    shouldShake={shouldShake || false}
                    isSingleInlay={isSingleInlay || false}
                    isDoubleInlayTop={isDoubleInlayTop || false}
                    isDoubleInlayBottom={isDoubleInlayBottom || false}
                    isMeasured={isMeasured}
                    onNoteMeasureClick={interactiveMode ? undefined : handleNoteMeasureClick}
                    onInteractiveRootClick={onInteractiveRootClick}
                    onInteractiveNoteToggle={onInteractiveNoteToggle}
                />
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

    const renderMeasurementOverlay = () => {
        if (measuredNotes.length !== 2 || !overlayCoords) return null;
        
        const note1 = measuredNotes[0];
        const note2 = measuredNotes[1];
        
        const detailedInterval = getDetailedInterval(note1.note, note1.octave, note2.note, note2.octave);
        if (!detailedInterval) return null;

        let intervalName = t(`intervals.${detailedInterval.key}`);
        if (detailedInterval.octaves > 0) {
            intervalName += ` + ${detailedInterval.octaves} ${t('intervals.octaves', { count: detailedInterval.octaves })}`;
        }

        return (
            <div className="measurement-overlay-container">
                <svg className="measurement-svg-overlay" xmlns="http://www.w3.org/2000/svg">
                    <line 
                        x1={overlayCoords.x1} y1={overlayCoords.y1} 
                        x2={overlayCoords.x2} y2={overlayCoords.y2} 
                        className="measurement-line" 
                    />
                </svg>
                <div 
                    className="interval-popup" 
                    style={{ left: overlayCoords.cx, top: overlayCoords.cy }}
                    onClick={() => setMeasuredNotes([])}
                >
                    <div className="interval-popup-result">{intervalName}</div>
                    <button className="interval-popup-close" onClick={(e) => { e.stopPropagation(); setMeasuredNotes([]); }}>×</button>
                </div>
            </div>
        );
    };

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
            {/* The vertical container is a flex row (board | numbers), so the
                carousel must sit outside it; horizontally it stacks inside. */}
            {orientation === 'VERTICAL' && renderDesktopVoicingCarousel()}
            <div
                className={`fretboard-container ${instrument.toLowerCase()}-mode ${orientation.toLowerCase()} theme-${colorScheme.toLowerCase()}`}
                style={{ '--string-count': STRINGS } as React.CSSProperties}
            >
                {orientation === 'HORIZONTAL' && renderDesktopVoicingCarousel()}
                <div
                    ref={fretboardRef}
                    className={`fretboard ${orientation.toLowerCase()}`}
                    role="grid"
                    aria-label={`${instrument} fretboard`}
                >
                    {renderMeasurementOverlay()}
                    <PredictionOverlay stringCount={STRINGS} />
                    {renderStrings()}
                </div>
                {renderFretNumbers()}
            </div>
            {renderMobileVoicingStepper()}
        </>
    );
};

export default Fretboard;
