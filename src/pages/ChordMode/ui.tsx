import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import Fretboard from '@/widgets/Fretboard';
import Controls from '@/widgets/Controls';
import {
    CHROMATIC_SCALE,
    HARMONIZABLE_SCALES,
    SCALE_CATEGORIES,
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
    type ChordInfo,
    type QueuedChord,
    type ChordQuality,
    type HarmonizableScale,
    CHORD_SYMBOLS
} from '@/shared/lib/music/musicTheory';
import { getChordVoicings } from '@/shared/lib/music/chordVoicings';
import { useChordQueue } from '@/shared/hooks/useChordQueue';
import './ui.css';


interface ChordModeProps {
    isFullScreen?: boolean;
}

interface GroupedChordItem {
    id: string;
    chord: ChordInfo;
    category: 'diatonic' | 'secondary' | 'borrowed' | 'mediant';
}

interface DegreeColumn {
    degreeIndex: number;
    degreeName: string;
    rootNote: Note;
    chords: GroupedChordItem[];
}

// Rows of the harmonization table, ordered from "inside the key" outward.
// Grid rows are assigned by position among the visible rows at render time.
const CATEGORY_ROWS = [
    { key: 'diatonic', labelKey: 'inKey' },
    { key: 'secondary', labelKey: 'secondary' },
    { key: 'borrowed', labelKey: 'borrowed' },
    { key: 'mediant', labelKey: 'mediant' }
] as const;

type ChordModifier = 'SUS2' | 'SUS4' | 'ADD9' | 'DOM7' | 'MAJ7';

const MODIFIER_DISPLAY_NAMES: Record<ChordModifier, string> = {
    SUS2: 'sus2',
    SUS4: 'sus4',
    ADD9: 'add9',
    DOM7: '7',
    MAJ7: 'maj7'
};

// A modifier extends the selected chord, so the result depends on the base
// quality: "7" on C is C7 but on Em is Em7 and on F#° is F#m7b5. A missing
// entry means the combination has no quality in the system and the chip is
// not offered (e.g. maj7 on a diminished triad). DOM7 rows (secondary
// dominants) keep the historical replace-the-quality behavior.
const MODIFIER_RESOLUTION: Partial<Record<ChordQuality, Partial<Record<ChordModifier, ChordQuality>>>> = {
    MAJOR: { SUS2: 'SUS2', SUS4: 'SUS4', ADD9: 'ADD9', DOM7: 'DOM7', MAJ7: 'MAJ7' },
    MINOR: { SUS2: 'SUS2', SUS4: 'SUS4', ADD9: 'MINADD9', DOM7: 'MIN7', MAJ7: 'MINMAJ7' },
    DIMINISHED: { DOM7: 'MIN7B5' },
    DOM7: { SUS2: 'SUS2', SUS4: 'SUS4', ADD9: 'ADD9', DOM7: 'DOM7', MAJ7: 'MAJ7' }
};

const resolveModifier = (base: ChordQuality, modifier: ChordModifier): ChordQuality | undefined =>
    MODIFIER_RESOLUTION[base]?.[modifier];

const availableModifiers = (base: ChordQuality): ChordModifier[] =>
    (Object.keys(MODIFIER_DISPLAY_NAMES) as ChordModifier[])
        .filter(mod => resolveModifier(base, mod) !== undefined);

import { useInstrument } from '@/app/providers';
import { useNaming } from '@/app/providers';

const ChordMode: React.FC<ChordModeProps> = ({ isFullScreen = false }) => {
    const { t } = useTranslation();
    const [selectedRoot, setSelectedRootState] = useState<Note>(() => {
        return (localStorage.getItem('chordmode-root') as Note) || 'C';
    });
    const [selectedScaleType, setSelectedScaleTypeState] = useState<HarmonizableScale>(() => {
        const stored = localStorage.getItem('chordmode-scale');
        return stored && (HARMONIZABLE_SCALES as readonly string[]).includes(stored)
            ? stored as HarmonizableScale
            : 'MAJOR';
    });

    const setSelectedRoot = (root: Note) => {
        setSelectedRootState(root);
        localStorage.setItem('chordmode-root', root);
    };

    const setSelectedScaleType = (scaleType: HarmonizableScale) => {
        setSelectedScaleTypeState(scaleType);
        localStorage.setItem('chordmode-scale', scaleType);
    };

    const [selectedChordId, setSelectedChordId] = useState<string | null>(null);
    const [chordModifiers, setChordModifiers] = useState<Record<string, ChordModifier | null>>({});
    const [isCopied, setIsCopied] = useState(false);
    const [queuedActiveChord, setQueuedActiveChord] = useState<{ root: Note, quality: ChordQuality } | null>(null);

    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };
    const [isExtendedOpen, setIsExtendedOpen] = useState(false);

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
    const { instrument, stringCount, tuningOffsets } = useInstrument();

    // Handlers
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

    const handleModifierClick = (modifier: ChordModifier, id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setChordModifiers(prev => ({
            ...prev,
            [id]: prev[id] === modifier ? null : modifier
        }));
        setSelectedChordId(id);
        setQueuedActiveChord(null);
        setActiveQueueIndex(-1);
    };



    const getFullChordName = (chord: ChordInfo, id: string) => {
        const modifier = chordModifiers[id];
        const resolved = modifier ? resolveModifier(chord.quality, modifier) : undefined;
        if (resolved) {
            return `${chord.root}${CHORD_SYMBOLS[resolved]}`;
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

    const groupedDegrees = React.useMemo(() => {
        if (diatonicChords.length < 7) return [];

        const columns: DegreeColumn[] = diatonicChords.map((diatonicChord, index) => ({
            degreeIndex: index,
            degreeName: diatonicChord.romanNumeral,
            rootNote: diatonicChord.root,
            chords: [
                {
                    id: `diatonic-${index}`,
                    chord: diatonicChord,
                    category: 'diatonic'
                }
            ]
        }));

        // Helper to find matching column by root note letter
        const findColumnIndex = (root: Note) => {
            const letter = root.charAt(0);
            return columns.findIndex(col => col.rootNote.charAt(0) === letter);
        };

        // Group secondary dominants
        secondaryDominants.forEach((chord, index) => {
            const colIdx = findColumnIndex(chord.root);
            if (colIdx !== -1) {
                columns[colIdx].chords.push({
                    id: `secondary-${index}`,
                    chord,
                    category: 'secondary'
                });
            }
        });

        // Group borrowed chords
        borrowedChords.forEach((chord, index) => {
            const colIdx = findColumnIndex(chord.root);
            if (colIdx !== -1) {
                // Avoid duplicates
                const exists = columns[colIdx].chords.some(
                    item => item.chord.root === chord.root && item.chord.quality === chord.quality
                );
                if (!exists) {
                    columns[colIdx].chords.push({
                        id: `borrowed-${index}`,
                        chord,
                        category: 'borrowed'
                    });
                }
            }
        });

        // Group chromatic mediants
        chromaticMediants.forEach((chord, index) => {
            const colIdx = findColumnIndex(chord.root);
            if (colIdx !== -1) {
                const exists = columns[colIdx].chords.some(
                    item => item.chord.root === chord.root && item.chord.quality === chord.quality
                );
                if (!exists) {
                    columns[colIdx].chords.push({
                        id: `mediant-${index}`,
                        chord,
                        category: 'mediant'
                    });
                }
            }
        });

        return columns;
    }, [diatonicChords, secondaryDominants, borrowedChords, chromaticMediants]);

    const activeChord = React.useMemo((): ChordInfo | null => {
        if (!selectedChordId) return null;
        const [type, indexStr] = selectedChordId.split('-');
        const index = parseInt(indexStr, 10);
        if (type === 'diatonic') return diatonicChords[index] ?? null;
        if (type === 'secondary') return secondaryDominants[index] ?? null;
        if (type === 'borrowed') return borrowedChords[index] ?? null;
        if (type === 'mediant') return chromaticMediants[index] ?? null;
        return null;
    }, [selectedChordId, diatonicChords, secondaryDominants, borrowedChords, chromaticMediants]);

    // Notes to display
    const useFlats = React.useMemo(() =>
        shouldUseFlats(selectedRoot, selectedScaleType),
        [selectedRoot, selectedScaleType]
    );

    const activeModifier = selectedChordId !== null ? chordModifiers[selectedChordId] : null;
    const resolvedModifierQuality = activeModifier && activeChord
        ? resolveModifier(activeChord.quality, activeModifier)
        : undefined;

    const activeChordQuality = selectedChordId !== null && activeChord
        ? (resolvedModifierQuality || activeChord.quality)
        : (queuedActiveChord ? queuedActiveChord.quality : null);

    const notesToDisplay = selectedChordId !== null && activeChord
        ? (resolvedModifierQuality
            ? getChordNotes(activeChord.root, resolvedModifierQuality, useFlats)
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

    // Queue Handlers using custom hook
    const handleSelectChordFromQueue = useCallback((queued: QueuedChord) => {
        // 1. Try to find if this chord exists in the current key/scale list.
        let foundId: string | null = null;
        let foundModifier: ChordModifier | null = null;

        const checkList = (list: ChordInfo[], prefix: string) => {
            for (let i = 0; i < list.length; i++) {
                const chord = list[i];
                if (chord.root === queued.root) {
                    if (chord.quality === queued.quality) {
                        foundId = `${prefix}-${i}`;
                        foundModifier = null;
                        break;
                    }
                    // A queued Em7 maps back to the Em card with the "7" chip
                    // active, so find the modifier that resolves to it.
                    const inverse = availableModifiers(chord.quality)
                        .find(mod => resolveModifier(chord.quality, mod) === queued.quality);
                    if (inverse) {
                        foundId = `${prefix}-${i}`;
                        foundModifier = inverse;
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
    }, [diatonicChords, secondaryDominants, borrowedChords, chromaticMediants]);

    const {
        chordQueue,
        activeQueueIndex,
        setActiveQueueIndex,
        addToQueue,
        removeFromQueue,
        clearQueue,
        nextInQueue,
        prevInQueue,
        selectFromQueue
    } = useChordQueue({
        onSelectChord: handleSelectChordFromQueue,
        onRemoveActiveChord: useCallback(() => setQueuedActiveChord(null), []),
    });

    const handleAddToQueue = () => {
        if (activeChord && activeChordQuality) {
            addToQueue(activeChord.root, activeChordQuality);
        }
    };

    const renderChordButton = (chord: ChordInfo, id: string) => {
        const isSelected = selectedChordId === id;
        const category = id.split('-')[0];

        return (
            <button
                key={id}
                className={`ht-chord-btn ${isSelected ? 'selected' : ''}`}
                onClick={() => handleChordClick(id)}
                title={`${chord.romanNumeral} · ${chord.displayName}`}
            >
                {category !== 'diatonic' && (
                    <span className="ht-chord-roman">{chord.romanNumeral}</span>
                )}
                <span className="ht-chord-name">{getFullChordName(chord, id)}</span>
            </button>
        );
    };

    // Hide category rows with no chords at all (e.g. borrowed/mediants for
    // modes, which only exist for the major/minor pair).
    const visibleCategories = React.useMemo(() => {
        const rows = isExtendedOpen ? CATEGORY_ROWS : CATEGORY_ROWS.slice(0, 1);
        return rows.filter(row => row.key === 'diatonic'
            || groupedDegrees.some(col => col.chords.some(item => item.category === row.key)));
    }, [isExtendedOpen, groupedDegrees]);

    // Selected chord summary shown in the detail strip between table and fretboard.
    const isCustomVoicingActive = selectedChordId !== null && activeChord !== null
        && customVoicingKeys.length > 0 && interactiveRootNotePos !== null
        && !chordModifiers[selectedChordId];

    const stripChord = selectedChordId !== null && activeChord
        ? { name: getFullChordName(activeChord, selectedChordId), roman: activeChord.romanNumeral }
        : queuedActiveChord
            ? { name: `${queuedActiveChord.root}${CHORD_SYMBOLS[queuedActiveChord.quality]}`, roman: null }
            : null;

    return (
        <div className={`chord-mode ${isFullScreen ? 'fullscreen' : ''}`}>
            {!isFullScreen && (
                <Controls
                    selectedRoot={selectedRoot}
                    onRootChange={(newRoot) => {
                        setSelectedRoot(newRoot);
                        setSelectedChordId(null);
                        setChordModifiers({});
                        setQueuedActiveChord(null);
                        setActiveQueueIndex(-1);
                    }}
                >
                    <div className="control-group">
                        <label htmlFor="chord-scale-select">{t('controls.scale')}:</label>
                        <select
                            id="chord-scale-select"
                            value={selectedScaleType}
                            onChange={(e) => {
                                setSelectedScaleType(e.target.value as HarmonizableScale);
                                setSelectedChordId(null);
                                setChordModifiers({});
                                setQueuedActiveChord(null);
                                setActiveQueueIndex(-1);
                            }}
                        >
                            {(['MAJOR_BASED', 'MINOR_BASED', 'OTHER'] as const).map(category => {
                                const scales = SCALE_CATEGORIES[category].filter(scale =>
                                    (HARMONIZABLE_SCALES as readonly string[]).includes(scale)
                                );
                                if (scales.length === 0) return null;
                                return (
                                    <optgroup key={category} label={t(`controls.categories.${category}`)}>
                                        {scales.map(scale => (
                                            <option key={scale} value={scale}>{t(`scales.${scale}`)}</option>
                                        ))}
                                    </optgroup>
                                );
                            })}
                        </select>
                    </div>
                </Controls>
            )}

            {!isFullScreen && groupedDegrees.length > 0 && (
                <div className="chord-lists-container">
                    <div className={`harmonization-table ${isExtendedOpen ? 'expanded' : 'collapsed'}`}>
                        <div className="ht-corner" aria-hidden="true"></div>
                        {visibleCategories.map((cat, rowIndex) => (
                            <div
                                key={cat.key}
                                className={`ht-row-label ${cat.key}`}
                                style={{ '--cat': rowIndex } as React.CSSProperties}
                            >
                                <span className="ht-dot" aria-hidden="true"></span>
                                <span className="ht-label-text">{t(`harmony.${cat.labelKey}`)}</span>
                            </div>
                        ))}
                        {groupedDegrees.map((col) => (
                            <React.Fragment key={col.degreeIndex}>
                                <div
                                    className="ht-degree-header"
                                    style={{ '--deg': col.degreeIndex } as React.CSSProperties}
                                >
                                    <span className="ht-degree-roman">{col.degreeName}</span>
                                    <span className="ht-degree-root">{col.rootNote}</span>
                                </div>
                                {visibleCategories.map((cat, rowIndex) => {
                                    const items = col.chords.filter(item => item.category === cat.key);
                                    return (
                                        <div
                                            key={cat.key}
                                            className={`ht-cell ${cat.key}`}
                                            style={{ '--deg': col.degreeIndex, '--cat': rowIndex } as React.CSSProperties}
                                        >
                                            {items.length === 0 ? (
                                                <span className="ht-empty" aria-hidden="true">·</span>
                                            ) : (
                                                items.map(item => renderChordButton(item.chord, item.id))
                                            )}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>

                    <button
                        className="harmonic-palette-toggle"
                        onClick={() => setIsExtendedOpen(!isExtendedOpen)}
                        aria-expanded={isExtendedOpen}
                    >
                        {isExtendedOpen ? t('harmony.hide') : t('harmony.explore')}
                    </button>

                    <AnimatePresence>
                        {stripChord && (
                            <motion.div
                                className="chord-detail-strip"
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="strip-main">
                                    {stripChord.roman && <span className="strip-roman">{stripChord.roman}</span>}
                                    <span className={`strip-name ${isCustomVoicingActive ? 'custom' : ''}`}>
                                        {isCustomVoicingActive && activeChord
                                            ? inferChordName(
                                                activeChord.root,
                                                customVoicingKeys.map(k => {
                                                    const [s, f] = k.split('-').map(Number);
                                                    return getNoteAtPosition(instrument, s, f, tuningOffsets, stringCount, useFlats);
                                                })
                                            )
                                            : stripChord.name}
                                    </span>
                                    <span className="strip-notes">{notesToDisplay.join(' · ')}</span>
                                </div>
                                {selectedChordId !== null && activeChord && availableModifiers(activeChord.quality).length > 0 && (
                                    <div className="strip-modifiers">
                                        {availableModifiers(activeChord.quality).map(mod => (
                                            <button
                                                key={mod}
                                                className={`strip-mod-btn ${chordModifiers[selectedChordId] === mod ? 'selected' : ''}`}
                                                onClick={(e) => handleModifierClick(mod, selectedChordId, e)}
                                            >
                                                {MODIFIER_DISPLAY_NAMES[mod]}
                                            </button>
                                        ))}
                                    </div>
                                )}
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
                        onClick={handleAddToQueue}
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
