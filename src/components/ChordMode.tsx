import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Fretboard, { type Orientation } from './Fretboard';
import {
    CHROMATIC_SCALE,
    INSTRUMENT_CONFIGS,
    GUITAR_TUNINGS,
    GUITAR_TUNINGS_7,
    GUITAR_TUNINGS_8,
    getDiatonicChords,
    getChordNotes,
    type Note,
    type NamingSystem,
    type Instrument,
    type Tuning,
    type ChordInfo,
} from '../utils/musicTheory';
import './ChordMode.css';

interface ChordModeProps {
    orientation: Orientation;
}

const ChordMode: React.FC<ChordModeProps> = ({ orientation }) => {
    const { t } = useTranslation();
    const [selectedRoot, setSelectedRoot] = useState<Note>('C');
    const [selectedScaleType, setSelectedScaleType] = useState<'MAJOR' | 'MINOR'>('MAJOR');

    // Modified state to track selection including modifiers
    const [selectedChord, setSelectedChord] = useState<{ index: number, modifier: any | null } | null>(null);
    const [hoveredChordIndex, setHoveredChordIndex] = useState<number | null>(null);
    const [modifiersVisible, setModifiersVisible] = useState(false);
    const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Independent state for instrument settings in this mode
    // (Could be lifted to App if we want persistence across modes, but separate is fine for now)
    const [namingSystem] = useState<NamingSystem>('ENGLISH');
    const [instrument, setInstrument] = useState<Instrument>('GUITAR');
    const [stringCount, setStringCount] = useState<number>(6);
    const [tuningOffsets, setTuningOffsets] = useState<number[]>([]);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    // Handlers
    const handleMouseEnter = (index: number) => {
        setHoveredChordIndex(index);
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setModifiersVisible(true);
        }, 2000);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setModifiersVisible(false);
        setHoveredChordIndex(null);
    };

    const handleChordClick = (index: number) => {
        setSelectedChord({ index, modifier: null });
    };

    const handleModifierClick = (modifier: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (hoveredChordIndex !== null) {
            setSelectedChord({ index: hoveredChordIndex, modifier });
        }
    };

    const handleInstrumentChange = (newInstrument: Instrument) => {
        setInstrument(newInstrument);
        if (newInstrument === 'BASS') {
            setStringCount(4);
        } else {
            setStringCount(6);
        }
        setTuningOffsets([]); // Reset to standard tuning
    };

    const handleStringCountChange = (count: number) => {
        setStringCount(count);
        setTuningOffsets([]);
    };

    // Tuning logic (Duplicated from Controls.tsx for now to avoid complexity in refactoring Controls yet)
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

    const getFullChordName = (chord: ChordInfo, isSelected: boolean) => {
        if (isSelected) {
            return `${chord.displayName}${selectedChord?.modifier ? selectedChord.modifier.toLowerCase() : ''}`;
        }
        return `${chord.displayName}`;
    };


    const diatonicChords = getDiatonicChords(selectedRoot, selectedScaleType);

    // Notes to display: If a chord is selected, show its notes. Otherwise, maybe show nothing or root? 
    // Let's show nothing initially or perhaps the key scale notes but faded? 
    // For "Chord Viewer", user expects to see the chord.
    const notesToDisplay = selectedChord
        ? (selectedChord.modifier
            ? getChordNotes(diatonicChords[selectedChord.index].root, selectedChord.modifier)
            : diatonicChords[selectedChord.index].notes)
        : [];

    const modifiers = ['SUS2', 'SUS4', 'ADD9', 'DOM7', 'MAJ7'];

    return (
        <div className="chord-mode">
            <div className="chord-controls">
                <div className="control-group">
                    <label>Key:</label>
                    <select value={selectedRoot} onChange={(e) => { setSelectedRoot(e.target.value as Note); setSelectedChord(null); }}>
                        {CHROMATIC_SCALE.map(note => <option key={note} value={note}>{note}</option>)}
                    </select>
                </div>
                <div className="control-group">
                    <label>Scale:</label>
                    <select value={selectedScaleType} onChange={(e) => { setSelectedScaleType(e.target.value as 'MAJOR' | 'MINOR'); setSelectedChord(null); }}>
                        <option value="MAJOR">Major</option>
                        <option value="MINOR">Minor</option>
                    </select>
                </div>

                {/* Instrument Controls (Mini version) */}
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
                        {isAdvancedOpen ? '▼ ' : '▶ '}{t('controls.advanced') || 'Setups'}
                    </button>
                    {isAdvancedOpen && (
                        <div className="advanced-controls">
                            {instrument === 'GUITAR' && (
                                <>
                                    <div className="control-group">
                                        <label>Strings:</label>
                                        <select value={stringCount} onChange={(e) => handleStringCountChange(parseInt(e.target.value))}>
                                            <option value={6}>6</option>
                                            <option value={7}>7</option>
                                            <option value={8}>8</option>
                                        </select>
                                    </div>
                                    <div className="control-group">
                                        <label>Tuning:</label>
                                        <select value={getCurrentTuningKey()} onChange={(e) => handleTuningChange(e.target.value)}>
                                            {Object.entries(availableTunings).map(([key, tuning]) => (
                                                <option key={key} value={key}>{tuning.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="chord-list">
                {diatonicChords.map((chord, index) => (
                    <div
                        key={index}
                        className="chord-card-wrapper"
                        onMouseEnter={() => handleMouseEnter(index)}
                        onMouseLeave={handleMouseLeave}
                    >
                        <button
                            className={`chord-card ${selectedChord?.index === index && !selectedChord?.modifier ? 'selected' : ''}`}
                            onClick={() => handleChordClick(index)}
                        >
                            <div className="roman">{chord.romanNumeral}</div>
                            <div className="name">{getFullChordName(chord, selectedChord?.index === index)}</div>
                        </button>

                        {/* Modifiers */}
                        {hoveredChordIndex === index && modifiersVisible && (
                            <div className="modifiers-container fade-in">
                                {modifiers.map(mod => (
                                    <button
                                        key={mod}
                                        className={`modifier-btn ${selectedChord?.index === index && selectedChord?.modifier === mod ? 'selected' : ''}`}
                                        onClick={(e) => handleModifierClick(mod, e)}
                                        title={mod}
                                    >
                                        {/* Simple cube look: we'll handle this in CSS */}
                                        <span className="mod-label">{mod}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="fretboard-wrapper">
                <Fretboard
                    selectedRoot={selectedChord ? diatonicChords[selectedChord.index].root : selectedRoot} // Highlight root of chord
                    scaleNotes={notesToDisplay}
                    namingSystem={namingSystem}
                    instrument={instrument}
                    tuningOffsets={tuningOffsets}
                    orientation={orientation}
                    stringCount={stringCount}
                />
            </div>
        </div>
    );
};

export default ChordMode;
