import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import Fretboard from '@/widgets/Fretboard';
import CircleOfFifths from '@/features/CircleOfFifths';
import {
    CHROMATIC_SCALE,
    INSTRUMENT_CONFIGS,
    GUITAR_TUNINGS,
    GUITAR_TUNINGS_7,
    GUITAR_TUNINGS_8,
    getDiatonicChords,
    getSecondaryDominants,
    getBorrowedChords,
    getChromaticMediants,
    getChordNotes,
    getScale,
    shouldUseFlats,
    inferChordName,
    getNoteAtPosition,
    type Note,
    type Instrument,
    type Tuning,
    type ChordInfo,
    type QueuedChord,
    type ChordQuality,
    CHORD_SYMBOLS,
    encodeDense,
    decodeDense
} from '@/shared/lib/music/musicTheory';
import { getChordVoicings } from '@/shared/lib/music/chordVoicings';
import './ui.css';


interface ChordModeProps {
    isFullScreen?: boolean;
}

import { useInstrument } from '@/app/providers';
import { useNaming } from '@/app/providers';

const ChordMode: React.FC<ChordModeProps> = ({ isFullScreen = false }) => {
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

    const [selectedChordId, setSelectedChordId] = useState<string | null>(null);
    const [chordModifiers, setChordModifiers] = useState<Record<string, any>>({});
    const [isCopied, setIsCopied] = useState(false);
    const [queuedActiveChord, setQueuedActiveChord] = useState<{ root: Note, quality: ChordQuality } | null>(null);

    const [chordQueue, setChordQueue] = useState<QueuedChord[]>(() => {
        const params = new URLSearchParams(window.location.search);
        const chordsParam = params.get('chords');
        if (chordsParam && /^[a-zA-Z]+$/.test(chordsParam) && chordsParam.length % 2 === 0) {
            return decodeDense(chordsParam.toUpperCase());
        }

        const saved = localStorage.getItem('fretboard_chord_queue');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) {}
        }
        return [];
    });
    const [activeQueueIndex, setActiveQueueIndex] = useState<number>(-1);

    React.useEffect(() => {
        localStorage.setItem('fretboard_chord_queue', JSON.stringify(chordQueue));
        
        // Update URL
        const newUrl = new URL(window.location.href);
        if (chordQueue.length > 0) {
            newUrl.searchParams.set('chords', encodeDense(chordQueue));
        } else {
            newUrl.searchParams.delete('chords');
        }
        window.history.replaceState({}, '', newUrl.toString());
    }, [chordQueue]);

    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };
    const [hoveredChordId, setHoveredChordId] = useState<string | null>(null);
    const [modifiersVisible, setModifiersVisible] = useState(false);
    const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const [isPaletteOpen, setIsPaletteOpen] = useState(false);

    // Custom Interactive Voicing State
    const [interactiveRootNotePos, setInteractiveRootNotePos] = useState<{ stringIndex: number, fret: number } | null>(null);
    const [customVoicingKeys, setCustomVoicingKeys] = useState<string[]>([]);

    // Reset custom voicing on chord parameter change
    React.useEffect(() => {
        setInteractiveRootNotePos(null);
        setCustomVoicingKeys([]);
    }, [selectedChordId, selectedRoot, selectedScaleType, chordModifiers]);

    // Context for instrument settings
    const { namingSystem } = useNaming();
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
    const handleMouseEnter = (id: string) => {
        setHoveredChordId(id);
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setModifiersVisible(true);
        }, 500);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setModifiersVisible(false);
        setHoveredChordId(null);
    };

    const handleChordClick = (id: string) => {
        if (selectedChordId !== id) {
            setSelectedChordId(id);
        } else {
            // Optional: click again to deselect
            setSelectedChordId(null);
        }
        setQueuedActiveChord(null);
        setActiveQueueIndex(-1);
    };

    const handleInteractiveRootClick = (stringIndex: number, fret: number) => {
        setInteractiveRootNotePos({ stringIndex, fret });

        if (voicings && voicings.length > 0) {
            const getPriority = (count: number) => {
                if (count === 3 || count === 4) return 2;
                if (count === 5) return 1;
                return 0;
            };

            const matchingVoicing = [...voicings].sort((a, b) => {
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

    const handleModifierClick = (modifier: any, id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setChordModifiers(prev => ({
            ...prev,
            [id]: prev[id] === modifier ? null : modifier
        }));
        setSelectedChordId(id);
        setQueuedActiveChord(null);
        setActiveQueueIndex(-1);
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

    const getFullChordName = (chord: ChordInfo, id: string) => {
        const modifier = chordModifiers[id];
        if (modifier) {
            return `${chord.root}${MODIFIER_DISPLAY_NAMES[modifier]}`;
        }
        return chord.displayName;
    };

    const diatonicChords = React.useMemo(() =>
        getDiatonicChords(selectedRoot, selectedScaleType),
        [selectedRoot, selectedScaleType]
    );
    const secondaryDominants = React.useMemo(() => 
        getSecondaryDominants(selectedRoot, selectedScaleType), 
        [selectedRoot, selectedScaleType]
    );
    const borrowedChords = React.useMemo(() => 
        getBorrowedChords(selectedRoot, selectedScaleType), 
        [selectedRoot, selectedScaleType]
    );
    const chromaticMediants = React.useMemo(() => 
        getChromaticMediants(selectedRoot, selectedScaleType), 
        [selectedRoot, selectedScaleType]
    );

    const getActiveChordInfo = (): ChordInfo | null => {
        if (!selectedChordId) return null;
        const [type, indexStr] = selectedChordId.split('-');
        const index = parseInt(indexStr, 10);
        if (type === 'diatonic') return diatonicChords[index];
        if (type === 'secondary') return secondaryDominants[index];
        if (type === 'borrowed') return borrowedChords[index];
        if (type === 'mediant') return chromaticMediants[index];
        return null;
    };

    const activeChord = getActiveChordInfo();

    // Notes to display
    const useFlats = React.useMemo(() =>
        shouldUseFlats(selectedRoot, selectedScaleType),
        [selectedRoot, selectedScaleType]
    );

    const activeChordQuality = selectedChordId !== null && activeChord
        ? (chordModifiers[selectedChordId] || activeChord.quality)
        : (queuedActiveChord ? queuedActiveChord.quality : null);

    const notesToDisplay = selectedChordId !== null && activeChord
        ? (chordModifiers[selectedChordId]
            ? getChordNotes(activeChord.root, chordModifiers[selectedChordId], useFlats)
            : activeChord.notes)
        : (queuedActiveChord
            ? getChordNotes(queuedActiveChord.root, queuedActiveChord.quality, useFlats)
            : []);

    const voicings = React.useMemo(() => {
        const root = selectedChordId !== null && activeChord ? activeChord.root : queuedActiveChord?.root;
        if (!root || !activeChordQuality) return undefined;
        return getChordVoicings(
            instrument,
            tuningOffsets,
            stringCount,
            root,
            activeChordQuality,
            18,
            15
        );
    }, [selectedChordId, queuedActiveChord, activeChordQuality, activeChord, instrument, tuningOffsets, stringCount]);

    const fullScaleNotes = React.useMemo(() => getScale(selectedRoot, selectedScaleType), [selectedRoot, selectedScaleType]);

    // Queue Handlers
    const addToQueue = () => {
        if (!selectedChordId || !activeChord || !activeChordQuality) return;
        const newChord: QueuedChord = {
            id: Date.now().toString() + Math.random().toString(36).substring(7),
            root: activeChord.root,
            quality: activeChordQuality
        };
        const newQueue = [...chordQueue, newChord];
        setChordQueue(newQueue);
        setActiveQueueIndex(newQueue.length - 1);
    };

    const selectFromQueue = (index: number) => {
        setActiveQueueIndex(index);
        const queued = chordQueue[index];
        // 1. Try to find if this chord exists in the current key/scale list.
        let foundId: string | null = null;
        let foundModifier: ChordQuality | null = null;

        const checkList = (list: ChordInfo[], prefix: string) => {
            for (let i = 0; i < list.length; i++) {
                const chord = list[i];
                if (chord.root === queued.root) {
                    if (chord.quality === queued.quality) {
                        foundId = `${prefix}-${i}`;
                        foundModifier = null;
                        break;
                    }
                    const modifiers = ['SUS2', 'SUS4', 'ADD9', 'DOM7', 'MAJ7'];
                    if (modifiers.includes(queued.quality)) {
                        foundId = `${prefix}-${i}`;
                        foundModifier = queued.quality;
                        break;
                    }
                }
            }
        };

        checkList(diatonicChords, 'diatonic');
        if (!foundId) checkList(secondaryDominants, 'secondary');
        if (!foundId) checkList(borrowedChords, 'borrowed');
        if (!foundId) checkList(chromaticMediants, 'mediant');

        if (foundId) {
            setSelectedChordId(foundId);
            if (foundModifier) {
                setChordModifiers({ [foundId]: foundModifier });
            } else {
                setChordModifiers({});
            }
            setQueuedActiveChord(null);
        } else {
            setSelectedChordId(null);
            setChordModifiers({});
            setQueuedActiveChord({
                root: queued.root,
                quality: queued.quality
            });
        }
    };

    const removeFromQueue = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const newQueue = [...chordQueue];
        newQueue.splice(index, 1);
        setChordQueue(newQueue);
        
        if (activeQueueIndex === index) {
            setActiveQueueIndex(-1);
            setQueuedActiveChord(null);
        } else if (activeQueueIndex > index) {
            setActiveQueueIndex(activeQueueIndex - 1);
        }
    };

    const clearQueue = () => {
        setChordQueue([]);
        setActiveQueueIndex(-1);
        setQueuedActiveChord(null);
    };

    const nextInQueue = () => {
        if (activeQueueIndex < chordQueue.length - 1) {
            selectFromQueue(activeQueueIndex + 1);
        }
    };

    const prevInQueue = () => {
        if (activeQueueIndex > 0) {
            selectFromQueue(activeQueueIndex - 1);
        }
    };

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'SELECT' || document.activeElement?.tagName === 'INPUT') return;

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (activeQueueIndex > 0) {
                    selectFromQueue(activeQueueIndex - 1);
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (activeQueueIndex < chordQueue.length - 1) {
                    selectFromQueue(activeQueueIndex + 1);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeQueueIndex, chordQueue, diatonicChords, secondaryDominants, borrowedChords, chromaticMediants]);

    const MODIFIER_DISPLAY_NAMES: Record<string, string> = {
        'SUS2': 'sus2',
        'SUS4': 'sus4',
        'ADD9': 'add9',
        'DOM7': '7',
        'MAJ7': 'maj7'
    };

    const modifiers = ['SUS2', 'SUS4', 'ADD9', 'DOM7', 'MAJ7'];

    const renderChordCard = (chord: ChordInfo, id: string) => {
        const isSelected = selectedChordId === id;
        const activeModifier = chordModifiers[id];

        return (
            <div
                key={id}
                className="chord-card-wrapper"
                onMouseEnter={() => handleMouseEnter(id)}
                onMouseLeave={handleMouseLeave}
            >
                <button
                    className={`chord-card ${isSelected && !activeModifier ? 'selected' : ''}`}
                    onClick={() => handleChordClick(id)}
                >
                    <div className="roman">{chord.romanNumeral}</div>
                    <div className="name">
                        {isSelected && customVoicingKeys.length > 0 && interactiveRootNotePos && !activeModifier ? (
                            <span style={{ color: '#D3AF37', textShadow: '0 0 5px rgba(211, 175, 55, 0.4)' }}>
                                {inferChordName(
                                    chord.root,
                                    customVoicingKeys.map(k => {
                                        const [s, f] = k.split('-').map(Number);
                                        return getNoteAtPosition(instrument, s, f, tuningOffsets, stringCount, useFlats);
                                    })
                                )}
                            </span>
                        ) : (
                            getFullChordName(chord, id)
                        )}
                    </div>
                </button>

                {/* Modifiers */}
                <AnimatePresence>
                    {hoveredChordId === id && modifiersVisible && (
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
                                    onClick={(e) => handleModifierClick(mod, id, e)}
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
    };

    return (
        <div className={`chord-mode ${isFullScreen ? 'fullscreen' : ''}`}>
            {!isFullScreen && (
                <div className="chord-controls">
                    <div className="control-group">
                        <CircleOfFifths
                            selectedRoot={selectedRoot}
                            onRootChange={(newRoot) => {
                                setSelectedRoot(newRoot);
                                setSelectedChordId(null);
                                setChordModifiers({});
                                setQueuedActiveChord(null);
                                setActiveQueueIndex(-1);
                            }}
                        />
                    </div>
                    <div className="control-group">
                        <label>{t('controls.scale')}:</label>
                        <select value={selectedScaleType} onChange={(e) => {
                            setSelectedScaleType(e.target.value as 'MAJOR' | 'MINOR');
                            setSelectedChordId(null);
                            setChordModifiers({});
                            setQueuedActiveChord(null);
                            setActiveQueueIndex(-1);
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
                <div className="chord-lists-container">
                    <div className="chord-list">
                        {diatonicChords.map((chord, index) => renderChordCard(chord, `diatonic-${index}`))}
                    </div>
                    
                    <button className="harmonic-palette-toggle" onClick={() => setIsPaletteOpen(!isPaletteOpen)}>
                        <span className="sparkle">✨</span> {isPaletteOpen ? 'Hide Extended Harmony' : 'Explore Extended Harmony'}
                    </button>

                    <AnimatePresence>
                        {isPaletteOpen && (
                            <motion.div
                                className="harmonic-palette-drawer"
                                initial={{ height: 0, opacity: 0, y: -20 }}
                                animate={{ height: "auto", opacity: 1, y: 0 }}
                                exit={{ height: 0, opacity: 0, y: -20 }}
                                transition={{ duration: 0.4, ease: "easeInOut" }}
                            >
                                <div className="harmonic-section">
                                    <h4 className="harmonic-section-title">Secondary Dominants</h4>
                                    <div className="chord-list secondary">
                                        {secondaryDominants.map((chord, index) => renderChordCard(chord, `secondary-${index}`))}
                                    </div>
                                </div>
                                <div className="harmonic-section">
                                    <h4 className="harmonic-section-title">Modal Interchange</h4>
                                    <div className="chord-list borrowed">
                                        {borrowedChords.map((chord, index) => renderChordCard(chord, `borrowed-${index}`))}
                                    </div>
                                </div>
                                <div className="harmonic-section">
                                    <h4 className="harmonic-section-title">Chromatic Mediants</h4>
                                    <div className="chord-list mediants">
                                        {chromaticMediants.map((chord, index) => renderChordCard(chord, `mediant-${index}`))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            <div className="fretboard-wrapper">
                <Fretboard
                    selectedRoot={selectedChordId !== null && activeChord ? activeChord.root : (queuedActiveChord ? queuedActiveChord.root : selectedRoot)}
                    scaleNotes={notesToDisplay}
                    namingSystem={namingSystem}
                    characteristicInterval={undefined}
                    instrument={instrument}
                    tuningOffsets={tuningOffsets}
                    stringCount={stringCount}
                    interactiveMode={selectedChordId !== null && !chordModifiers[selectedChordId]}
                    interactiveRootNotePos={interactiveRootNotePos}
                    interactiveTogglableNotes={interactiveRootNotePos ? CHROMATIC_SCALE : fullScaleNotes}
                    customVoicingKeys={customVoicingKeys}
                    onInteractiveRootClick={handleInteractiveRootClick}
                    onInteractiveNoteToggle={handleInteractiveNoteToggle}
                />
            </div>

            {/* Floating Queue UI */}
            <div className="chord-queue-floating">
                <div className="chord-queue-header">
                    <h3>{t('queue.title')}</h3>
                    <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
                        <button className="icon-btn" onClick={handleShare} title={isCopied ? t('queue.shareCopied') : t('queue.share')} aria-label={t('queue.share')}>
                            {isCopied ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="18" cy="5" r="3"></circle>
                                    <circle cx="6" cy="12" r="3"></circle>
                                    <circle cx="18" cy="19" r="3"></circle>
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                </svg>
                            )}
                        </button>
                        <button className="icon-btn" onClick={clearQueue} title={t('queue.clear')} aria-label={t('queue.clear')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div className="queue-items">
                    {chordQueue.length === 0 ? (
                        <div className="empty-queue-msg">{t('queue.empty')}</div>
                    ) : (
                        chordQueue.map((chord, index) => (
                            <div 
                                key={chord.id} 
                                className={`queue-item ${activeQueueIndex === index ? 'active' : ''}`}
                                onClick={() => selectFromQueue(index)}
                            >
                                <span className="queue-item-name">
                                    {chord.root}{CHORD_SYMBOLS[chord.quality]}
                                </span>
                                <button className="icon-btn" onClick={(e) => removeFromQueue(index, e)} title={t('queue.remove')} aria-label={t('queue.remove')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        className="add-to-queue-btn" 
                        onClick={addToQueue} 
                        title={t('queue.addToQueue')}
                        disabled={!selectedChordId}
                        style={!selectedChordId ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        {t('queue.addToQueue')}
                    </button>
                </div>

                {chordQueue.length > 0 && (
                    <div className="queue-controls">
                        <button 
                            className="icon-btn" 
                            onClick={prevInQueue} 
                            disabled={activeQueueIndex <= 0}
                            title={t('queue.previous')}
                            aria-label={t('queue.previous')}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                        </button>
                        <button 
                            className="icon-btn" 
                            onClick={nextInQueue} 
                            disabled={activeQueueIndex >= chordQueue.length - 1}
                            title={t('queue.next')}
                            aria-label={t('queue.next')}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChordMode;
