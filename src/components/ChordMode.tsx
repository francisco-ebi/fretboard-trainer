import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import Fretboard from '@/components/Fretboard';
import CircleOfFifths from '@/components/CircleOfFifths';
import {
    CHROMATIC_SCALE,
    INSTRUMENT_CONFIGS,
    GUITAR_TUNINGS,
    GUITAR_TUNINGS_7,
    GUITAR_TUNINGS_8,
    getProperSpelling,
    getDiatonicChords,
    getChordNotes,
    getScale,
    shouldUseFlats,
    getNoteDisplayLabel,
    inferChordName,
    getNoteAtPosition,
    type Note,
    type NamingSystem,
    type Instrument,
    type Tuning,
    type ChordInfo,
} from '@/utils/musicTheory';
import { getChordVoicings } from '@/utils/chordVoicings';
import './ChordMode.css';

import { type PredictionResult } from '@/utils/audio/prediction-engine';

interface ChordModeProps {
    prediction?: PredictionResult | null;
    isFullScreen?: boolean;
}

import { useInstrument } from '@/context/InstrumentContext';

const ChordMode: React.FC<ChordModeProps> = ({ prediction, isFullScreen = false }) => {
    const { t } = useTranslation();
    const [selectedRoot, setSelectedRootState] = useState<Note>(() => {
        return (localStorage.getItem('chordmode-root') as Note) || 'C';
    });
    const [selectedScaleType, setSelectedScaleTypeState] = useState<'MAJOR' | 'MINOR'>(() => {
        return (localStorage.getItem('chordmode-scale') as 'MAJOR' | 'MINOR') || 'MAJOR';
    });

    const setSelectedRoot = (root: Note) => {
        setSelectedRootState(root);
        localStorage.setItem('chordmode-root', root);
    };

    const setSelectedScaleType = (scaleType: 'MAJOR' | 'MINOR') => {
        setSelectedScaleTypeState(scaleType);
        localStorage.setItem('chordmode-scale', scaleType);
    };

    const [selectedChordIndex, setSelectedChordIndex] = useState<number | null>(null);
    const [chordModifiers, setChordModifiers] = useState<Record<number, any>>({});
    const [hoveredChordIndex, setHoveredChordIndex] = useState<number | null>(null);
    const [modifiersVisible, setModifiersVisible] = useState(false);
    const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Custom Interactive Voicing State
    const [interactiveRootNotePos, setInteractiveRootNotePos] = useState<{stringIndex: number, fret: number} | null>(null);
    const [customVoicingKeys, setCustomVoicingKeys] = useState<string[]>([]);

    // Reset custom voicing on chord parameter change
    React.useEffect(() => {
        setInteractiveRootNotePos(null);
        setCustomVoicingKeys([]);
    }, [selectedChordIndex, selectedRoot, selectedScaleType, chordModifiers]);

    // Context for instrument settings
    const [namingSystem] = useState<NamingSystem>('ENGLISH');
    const {
        instrument,
        setInstrument,
        stringCount,
        setStringCount,
        tuningOffsets,
        setTuningOffsets,
        colorScheme,
        setColorScheme
    } = useInstrument();

    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    // Handlers
    const handleMouseEnter = (index: number) => {
        setHoveredChordIndex(index);
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setModifiersVisible(true);
        }, 500);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setModifiersVisible(false);
        setHoveredChordIndex(null);
    };

    const handleChordClick = (index: number) => {
        if (selectedChordIndex !== index) {
            setSelectedChordIndex(index);
        } else {
            // Optional: click again to deselect
            setSelectedChordIndex(null);
        }
    };

    const handleInteractiveRootClick = (stringIndex: number, fret: number) => {
        setInteractiveRootNotePos({ stringIndex, fret });
        
        if (voicings && voicings.length > 0) {
            const getPriority = (count: number) => {
                if (count === 3 || count === 4) return 2;
                if (count === 5) return 1;
                return 0;
            };

            const matchingVoicing = [...voicings].sort((a,b) => {
                const aActive = a.frets.filter(f => f >= 0).length; // 0 is open, -1 is muted
                const bActive = b.frets.filter(f => f >= 0).length;
                const priorityDiff = getPriority(bActive) - getPriority(aActive);
                if (priorityDiff !== 0) return priorityDiff;
                return bActive - aActive; 
            }).find(v => v.frets[stringIndex] === fret);

            if (matchingVoicing) {
                const keys = matchingVoicing.frets
                    .map((f, s) => f !== -1 ? `${s}-${f}` : null)
                    .filter(Boolean) as string[];
                setCustomVoicingKeys(keys);
            } else {
                setCustomVoicingKeys([`${stringIndex}-${fret}`]);
            }
        } else {
            setCustomVoicingKeys([`${stringIndex}-${fret}`]);
        }
    };

    const handleInteractiveNoteToggle = (stringIndex: number, fret: number) => {
        setCustomVoicingKeys(prev => {
            const currentStrNodes = prev.filter(k => k.startsWith(`${stringIndex}-`));
            const toggleKey = `${stringIndex}-${fret}`;
            
            if (currentStrNodes.includes(toggleKey)) {
                // Prevent untoggling root
                if (interactiveRootNotePos?.stringIndex === stringIndex && interactiveRootNotePos?.fret === fret) {
                    return prev;
                }
                return prev.filter(k => k !== toggleKey);
            } else {
                // Add / Replace on string
                return [...prev.filter(k => !k.startsWith(`${stringIndex}-`)), toggleKey];
            }
        });
    };

    const handleModifierClick = (modifier: any, index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setChordModifiers(prev => ({
            ...prev,
            [index]: prev[index] === modifier ? null : modifier
        }));
        setSelectedChordIndex(index);
    };

    const handleInstrumentChange = (newInstrument: Instrument) => {
        setInstrument(newInstrument);
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

    const getFullChordName = (chord: ChordInfo, index: number) => {
        const modifier = chordModifiers[index];
        if (modifier) {
            return `${chord.root}${MODIFIER_DISPLAY_NAMES[modifier]}`;
        }
        return chord.displayName;
    };

    const diatonicChords = React.useMemo(() =>
        getDiatonicChords(selectedRoot, selectedScaleType),
        [selectedRoot, selectedScaleType]
    );
    // Notes to display
    const useFlats = React.useMemo(() =>
        shouldUseFlats(selectedRoot, selectedScaleType),
        [selectedRoot, selectedScaleType]
    );

    const activeChordQuality = selectedChordIndex !== null
        ? (chordModifiers[selectedChordIndex] || diatonicChords[selectedChordIndex].quality)
        : null;

    const notesToDisplay = selectedChordIndex !== null
        ? (chordModifiers[selectedChordIndex]
            ? getChordNotes(diatonicChords[selectedChordIndex].root, chordModifiers[selectedChordIndex], useFlats)
            : diatonicChords[selectedChordIndex].notes)
        : [];

    const voicings = React.useMemo(() => {
        if (selectedChordIndex === null || !activeChordQuality) return undefined;
        return getChordVoicings(
            instrument,
            tuningOffsets,
            stringCount,
            diatonicChords[selectedChordIndex].root,
            activeChordQuality,
            18,
            15
        );
    }, [selectedChordIndex, activeChordQuality, instrument, tuningOffsets, stringCount, diatonicChords]);

    const fullScaleNotes = React.useMemo(() => getScale(selectedRoot, selectedScaleType), [selectedRoot, selectedScaleType]);

    const MODIFIER_DISPLAY_NAMES: Record<string, string> = {
        'SUS2': 'sus2',
        'SUS4': 'sus4',
        'ADD9': 'add9',
        'DOM7': '7',
        'MAJ7': 'maj7'
    };

    const modifiers = ['SUS2', 'SUS4', 'ADD9', 'DOM7', 'MAJ7'];

    return (
        <div className={`chord-mode ${isFullScreen ? 'fullscreen' : ''}`}>
            {!isFullScreen && (
                <div className="chord-controls">
                    <div className="control-group">
                        <CircleOfFifths 
                            selectedRoot={selectedRoot} 
                            onRootChange={(newRoot) => {
                                setSelectedRoot(newRoot);
                                setSelectedChordIndex(null);
                                setChordModifiers({});
                            }} 
                        />
                    </div>
                    <div className="control-group">
                        <label>{t('controls.scale')}:</label>
                        <select value={selectedScaleType} onChange={(e) => {
                            setSelectedScaleType(e.target.value as 'MAJOR' | 'MINOR');
                            setSelectedChordIndex(null);
                            setChordModifiers({});
                        }}>
                            <option value="MAJOR">{t('scales.MAJOR')}</option>
                            <option value="MINOR">{t('scales.MINOR')}</option>
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
                                    <div className="control-group">
                                        <label htmlFor="theme-select">Theme:</label>
                                        <select id="theme-select" value={colorScheme} onChange={(e) => setColorScheme(e.target.value as any)}>
                                            <option value="OKLCH">OKLCH (Perceptual)</option>
                                            <option value="LEGACY">Legacy (Bright)</option>
                                        </select>
                                    </div>
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
            )}

            {!isFullScreen && (
                <div className="chord-list">
                    {diatonicChords.map((chord, index) => {
                        const isSelected = selectedChordIndex === index;
                        const activeModifier = chordModifiers[index];

                        return (
                            <div
                                key={index}
                                className="chord-card-wrapper"
                                onMouseEnter={() => handleMouseEnter(index)}
                                onMouseLeave={handleMouseLeave}
                            >
                                <button
                                    className={`chord-card ${isSelected && !activeModifier ? 'selected' : ''}`}
                                    onClick={() => handleChordClick(index)}
                                >
                                    <div className="roman">{chord.romanNumeral}</div>
                                    <div className="name">
                                        {isSelected && customVoicingKeys.length > 0 && interactiveRootNotePos && !activeModifier ? (
                                            <span style={{color: '#D3AF37', textShadow: '0 0 5px rgba(211, 175, 55, 0.4)'}}>
                                                {inferChordName(
                                                    chord.root, 
                                                    customVoicingKeys.map(k => {
                                                        const [s, f] = k.split('-').map(Number);
                                                        return getNoteAtPosition(instrument, s, f, tuningOffsets, stringCount, useFlats);
                                                    })
                                                )}
                                            </span>
                                        ) : (
                                            getFullChordName(chord, index)
                                        )}
                                    </div>
                                </button>

                                {/* Modifiers */}
                                <AnimatePresence>
                                    {hoveredChordIndex === index && modifiersVisible && (
                                        <motion.div
                                            className="modifiers-container"
                                            initial={{ opacity: 0, y: -10, x: "-50%" }}
                                            animate={{ opacity: 1, y: 0, x: "-50%" }}
                                            exit={{ opacity: 0, y: -10, x: "-50%" }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            {modifiers.map(mod => (
                                                <button
                                                    key={mod}
                                                    className={`modifier-btn ${activeModifier === mod ? 'selected' : ''}`}
                                                    onClick={(e) => handleModifierClick(mod, index, e)}
                                                    title={mod}
                                                >
                                                    <span className="mod-label">{MODIFIER_DISPLAY_NAMES[mod]}</span>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="fretboard-wrapper">
                <Fretboard
                    selectedRoot={selectedChordIndex !== null ? diatonicChords[selectedChordIndex].root : selectedRoot} // Highlight root of chord
                    scaleNotes={notesToDisplay}
                    namingSystem={namingSystem}
                    characteristicInterval={undefined}
                    instrument={instrument}
                    tuningOffsets={tuningOffsets}
                    stringCount={stringCount}
                    prediction={prediction}
                    voicings={voicings}
                    interactiveMode={selectedChordIndex !== null && !chordModifiers[selectedChordIndex]}
                    interactiveRootNotePos={interactiveRootNotePos}
                    interactiveTogglableNotes={interactiveRootNotePos ? CHROMATIC_SCALE : fullScaleNotes}
                    customVoicingKeys={customVoicingKeys}
                    onInteractiveRootClick={handleInteractiveRootClick}
                    onInteractiveNoteToggle={handleInteractiveNoteToggle}
                />
            </div>
        </div>
    );
};

export default ChordMode;
