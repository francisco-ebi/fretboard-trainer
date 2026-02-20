import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import Fretboard from '@/components/Fretboard';
import {
    CHROMATIC_SCALE,
    INSTRUMENT_CONFIGS,
    GUITAR_TUNINGS,
    GUITAR_TUNINGS_7,
    GUITAR_TUNINGS_8,
    getChordNotes,
    type Note,
    type ChordQuality,
    type NamingSystem,
    type Instrument,
    type Tuning
} from '@/utils/musicTheory';
import { getChordVoicings } from '@/utils/chordVoicings';
import { useInstrument } from '@/context/InstrumentContext';
import './ChordLibrary.css';

interface ChordLibraryProps {
    isFullScreen?: boolean;
}

const INTERVAL_ALIASES: Record<string, Record<number, string>> = {
    AUGMENTED: { 8: '#5' },
    DIM7: { 9: 'bb7', 6: 'b5' },
    MIN7B5: { 6: 'b5' }
};

const DEFAULT_INTERVALS: Record<number, string> = {
    0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
    14: '9', 17: '11', 21: '13'
};

const CHORD_GROUPS = [
    { id: 'triads', qualities: ['MAJOR', 'MINOR', 'DIMINISHED', 'AUGMENTED'] as ChordQuality[] },
    { id: 'sevenths', qualities: ['DOM7', 'MAJ7', 'MIN7', 'MIN7B5', 'DIM7', 'MINMAJ7'] as ChordQuality[] },
    { id: 'extended', qualities: ['DOM9', 'MAJ9', 'MIN9', 'DOM11', 'MAJ11', 'MIN11', 'DOM13', 'MAJ13', 'MIN13'] as ChordQuality[] },
    { id: 'suspended', qualities: ['SUS2', 'SUS4', 'ADD2', 'ADD4', 'ADD6', 'ADD9'] as ChordQuality[] }
];

const CHORD_SYMBOLS: Record<ChordQuality, string> = {
    MAJOR: '',
    MINOR: 'm',
    DIMINISHED: 'dim',
    AUGMENTED: 'aug',
    SUS2: 'sus2',
    SUS4: 'sus4',
    ADD2: 'add2',
    ADD4: 'add4',
    ADD6: 'add6',
    ADD9: 'add9',
    DOM7: '7',
    MAJ7: 'maj7',
    MIN7: 'm7',
    MIN7B5: 'm7b5',
    DIM7: 'dim7',
    MINMAJ7: 'mM7',
    DOM9: '9',
    MAJ9: 'maj9',
    MIN9: 'm9',
    DOM11: '11',
    MAJ11: 'maj11',
    MIN11: 'm11',
    DOM13: '13',
    MAJ13: 'maj13',
    MIN13: 'm13'
};

// Re-defining intervals local mapping to calculate the exact strings for textual display
const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
    MAJOR: [0, 4, 7],
    MINOR: [0, 3, 7],
    DIMINISHED: [0, 3, 6],
    AUGMENTED: [0, 4, 8],
    SUS2: [0, 2, 7],
    SUS4: [0, 5, 7],
    ADD2: [0, 2, 4, 7],
    ADD4: [0, 4, 5, 7],
    ADD6: [0, 4, 7, 9],
    ADD9: [0, 4, 7, 14],
    DOM7: [0, 4, 7, 10],
    MAJ7: [0, 4, 7, 11],
    MIN7: [0, 3, 7, 10],
    MIN7B5: [0, 3, 6, 10],
    DIM7: [0, 3, 6, 9],
    MINMAJ7: [0, 3, 7, 11],
    DOM9: [0, 4, 7, 10, 14],
    MAJ9: [0, 4, 7, 11, 14],
    MIN9: [0, 3, 7, 10, 14],
    DOM11: [0, 4, 7, 10, 14, 17],
    MAJ11: [0, 4, 7, 11, 14, 17],
    MIN11: [0, 3, 7, 10, 14, 17],
    DOM13: [0, 4, 7, 10, 14, 17, 21],
    MAJ13: [0, 4, 7, 11, 14, 17, 21],
    MIN13: [0, 3, 7, 10, 14, 17, 21]
};

const getDisplayName = (t: any, quality: ChordQuality) => {
    return t(`chords.${quality}`, quality.replace('_', ' '));
};

const ChordLibrary: React.FC<ChordLibraryProps> = ({ isFullScreen = false }) => {
    const { t } = useTranslation();
    const [selectedRoot, setSelectedRoot] = useState<Note>('C');
    const [selectedQuality, setSelectedQuality] = useState<ChordQuality>('MAJOR');

    // Context for instrument settings
    const [namingSystem] = useState<NamingSystem>('ENGLISH');
    const {
        instrument,
        setInstrument,
        stringCount,
        setStringCount,
        tuningOffsets,
        setTuningOffsets
    } = useInstrument();

    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    // Handlers
    const handleInstrumentChange = (newInstrument: Instrument) => {
        setInstrument(newInstrument);
    };

    const handleStringCountChange = (count: number) => {
        setStringCount(count);
        setTuningOffsets([]);
    };

    const getAvailableTunings = (): Record<string, Tuning> => {
        if (instrument === 'GUITAR') {
            if (stringCount === 7) return GUITAR_TUNINGS_7;
            if (stringCount === 8) return GUITAR_TUNINGS_8;
            return GUITAR_TUNINGS;
        }
        return {};
    };
    const availableTunings = getAvailableTunings();

    const getCurrentTuningKey = () => {
        if (tuningOffsets.length === 0) return 'STANDARD';
        for (const [key, tuning] of Object.entries(availableTunings)) {
            if (tuning.offsets.length === tuningOffsets.length &&
                tuning.offsets.every((val, index) => val === tuningOffsets[index])) {
                return key;
            }
        }
        return 'CUSTOM';
    };

    const handleTuningChange = (key: string) => {
        const tuning = availableTunings[key];
        if (tuning) setTuningOffsets(tuning.offsets);
    };

    const notesToDisplay = getChordNotes(selectedRoot, selectedQuality);

    const voicings = React.useMemo(() => {
        return getChordVoicings(
            instrument,
            tuningOffsets,
            stringCount,
            selectedRoot,
            selectedQuality,
            18,
            15 // top 15 voicings
        );
    }, [instrument, tuningOffsets, stringCount, selectedRoot, selectedQuality]);

    // Render textual intervals
    const intervalSemitones = CHORD_INTERVALS[selectedQuality];
    const textualIntervals = intervalSemitones.map(semitones => {
        return (INTERVAL_ALIASES[selectedQuality] && INTERVAL_ALIASES[selectedQuality][semitones]) || DEFAULT_INTERVALS[semitones] || '?';
    });

    return (
        <div className={`chord-library ${isFullScreen ? 'fullscreen' : ''}`}>
            <div className="library-header">
                <h2>
                    <span className="chord-symbol">{selectedRoot}{CHORD_SYMBOLS[selectedQuality]}</span>
                    <span className="chord-name-full"> - {getDisplayName(t, selectedQuality)}</span>
                </h2>
                <div className="chord-info-tags">
                    {notesToDisplay.map((note, idx) => (
                        <div key={idx} className="info-tag">
                            <span className="info-note">{note}</span>
                            <span className="info-interval">{textualIntervals[idx]}</span>
                        </div>
                    ))}
                </div>
            </div>

            {!isFullScreen && (
                <>
                    <div className="library-controls-layout">
                        {/* Selectors Sidebar */}
                        <div className="library-sidebar">
                            <div className="control-group">
                                <label>{t('controls.key')}:</label>
                                <select value={selectedRoot} onChange={(e) => setSelectedRoot(e.target.value as Note)}>
                                    {CHROMATIC_SCALE.map(note => <option key={note} value={note}>{note}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Settings Sidebar */}
                        <div className="library-settings">
                            <div className="control-group">
                                <label>{t('controls.instrument')}:</label>
                                <select value={instrument} onChange={(e) => handleInstrumentChange(e.target.value as Instrument)}>
                                    {(Object.keys(INSTRUMENT_CONFIGS) as Instrument[]).map((inst) => (
                                        <option key={inst} value={inst}>{t(`instruments.${inst}`)}</option>
                                    ))}
                                </select>
                            </div>
                            <div className={`advanced-section ${isAdvancedOpen ? 'open' : ''}`}>
                                <button className="advanced-toggle" onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}>
                                    <motion.span
                                        animate={{ rotate: isAdvancedOpen ? 90 : 0 }}
                                        style={{ display: 'inline-block', marginRight: '8px' }}
                                    >
                                        ▶
                                    </motion.span>
                                    {t('controls.advanced')}
                                </button>
                                <AnimatePresence>
                                    {isAdvancedOpen && (
                                        <motion.div
                                            className="advanced-controls"
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                            style={{ overflow: 'hidden' }}
                                        >
                                            {instrument === 'GUITAR' && (
                                                <>
                                                    <div className="control-group">
                                                        <label>{t('controls.strings')}:</label>
                                                        <select value={stringCount} onChange={(e) => handleStringCountChange(parseInt(e.target.value))}>
                                                            <option value={6}>6</option>
                                                            <option value={7}>7</option>
                                                            <option value={8}>8</option>
                                                        </select>
                                                    </div>
                                                    <div className="control-group">
                                                        <label>{t('controls.tuning')}:</label>
                                                        <select value={getCurrentTuningKey()} onChange={(e) => handleTuningChange(e.target.value)}>
                                                            {Object.entries(availableTunings).map(([key, tuning]) => (
                                                                <option key={key} value={key}>{tuning.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    <div className="quality-groups">
                        {CHORD_GROUPS.map(group => (
                            <div key={group.id} className="quality-group">
                                <h4>{t(`groups.${group.id}`)}</h4>
                                <div className="quality-buttons">
                                    {group.qualities.map(quality => (
                                        <button
                                            key={quality}
                                            className={`quality-btn ${selectedQuality === quality ? 'active' : ''}`}
                                            onClick={() => setSelectedQuality(quality)}
                                        >
                                            <div className="btn-symbol">{selectedRoot}{CHORD_SYMBOLS[quality]}</div>
                                            <div className="btn-name">{getDisplayName(t, quality)}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div className="fretboard-wrapper">
                <Fretboard
                    selectedRoot={selectedRoot}
                    scaleNotes={notesToDisplay}
                    namingSystem={namingSystem}
                    instrument={instrument}
                    tuningOffsets={tuningOffsets}
                    stringCount={stringCount}
                    characteristicInterval={undefined}
                    voicings={voicings}
                />
            </div>
        </div>
    );
};

export default ChordLibrary;
