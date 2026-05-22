import React, { useEffect, useRef } from 'react';
import { getNoteAtPosition, getInterval, getOctave, getInstrumentConfig, areEnharmonicallyEquivalent, type Note, type NamingSystem, type Instrument } from '@/utils/musicTheory';
import { type Voicing } from '@/utils/chordVoicings';
import { useOrientation } from '@/context/OrientationContext';
import { useInstrument } from '@/context/InstrumentContext';

import { FretCell } from '@/components/FretCell';
import PredictionOverlay from '@/components/PredictionOverlay';
import './Fretboard.css';

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
    const { orientation } = useOrientation();
    const { colorScheme } = useInstrument();

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


    return (
        <>
            <div className={`fretboard-container ${instrument.toLowerCase()}-mode ${orientation.toLowerCase()} theme-${colorScheme.toLowerCase()}`}>
                <div
                    className={`fretboard ${orientation.toLowerCase()}`}
                    role="grid"
                    aria-label={`${instrument} fretboard`}
                    style={orientation === 'VERTICAL' ? { gridTemplateColumns: `repeat(${STRINGS}, 4rem)` } : undefined}
                >
                    <PredictionOverlay stringCount={STRINGS} />
                    {renderStrings()}
                </div>
                {renderFretNumbers()}
            </div>
        </>
    );
};

export default Fretboard;
