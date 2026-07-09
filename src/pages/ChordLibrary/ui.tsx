import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Fretboard from '@/widgets/Fretboard';
import Controls from '@/widgets/Controls';
import {
    getChordNotes,
    type Note,
    type ChordQuality,
    type QueuedChord,
    CHORD_SYMBOLS,
    CHORD_INTERVALS
} from '@/shared/lib/music/musicTheory';
import { getChordVoicings } from '@/shared/lib/music/chordVoicings';
import { useChordQueue } from '@/shared/hooks/useChordQueue';
import { useInstrument, useNaming } from '@/app/providers';
import ChordQualityMatrix from '@/features/ChordQualityMatrix';
import './ui.css';

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

const getDisplayName = (t: any, quality: ChordQuality) => {
    return t(`chords.${quality}`, quality.replace('_', ' '));
};



const ChordLibrary: React.FC<ChordLibraryProps> = ({ isFullScreen = false }) => {
    const { t } = useTranslation();
    const [selectedRoot, setSelectedRoot] = useState<Note>('C');
    const [selectedQuality, setSelectedQuality] = useState<ChordQuality>('MAJOR');
    const [isCopied, setIsCopied] = useState(false);

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
        onSelectChord: useCallback((chord: QueuedChord) => {
            setSelectedRoot(chord.root);
            setSelectedQuality(chord.quality);
        }, [setSelectedRoot, setSelectedQuality])
    });

    const handleAddToQueue = () => {
        addToQueue(selectedRoot, selectedQuality);
    };

    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    // Context for instrument settings
    const { namingSystem } = useNaming();
    const { instrument, stringCount, tuningOffsets } = useInstrument();

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
                    <Controls
                        selectedRoot={selectedRoot}
                        onRootChange={(newRoot) => {
                            setSelectedRoot(newRoot);
                            setActiveQueueIndex(-1);
                        }}
                    />

                    <ChordQualityMatrix
                        selectedRoot={selectedRoot}
                        selectedQuality={selectedQuality}
                        onQualityChange={(quality) => {
                            setSelectedQuality(quality);
                            setActiveQueueIndex(-1);
                        }}
                    />
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
                    <button className="add-to-queue-btn" onClick={handleAddToQueue} title={t('queue.addToQueue')}>
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

export default ChordLibrary;
