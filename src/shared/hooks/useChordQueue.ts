import { useState, useEffect, useCallback } from 'react';
import { 
    type Note, 
    type ChordQuality, 
    type QueuedChord, 
    encodeDense, 
    decodeDense 
} from '@/shared/lib/music/musicTheory';

interface UseChordQueueOptions {
    onSelectChord?: (chord: QueuedChord, index: number) => void;
    onRemoveActiveChord?: () => void;
}

export const useChordQueue = (options?: UseChordQueueOptions) => {
    const { onSelectChord, onRemoveActiveChord } = options || {};

    const [chordQueue, setChordQueue] = useState<QueuedChord[]>(() => {
        const params = new URLSearchParams(window.location.search);
        const chordsParam = params.get('chords');
        if (chordsParam && /^[a-zA-Z]+$/.test(chordsParam) && chordsParam.length % 2 === 0) {
            return decodeDense(chordsParam.toUpperCase());
        }

        const saved = localStorage.getItem('fretboard_chord_queue');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse chord queue from localStorage', e);
            }
        }
        return [];
    });

    const [activeQueueIndex, setActiveQueueIndex] = useState<number>(-1);

    // Sync queue with URL and LocalStorage
    useEffect(() => {
        localStorage.setItem('fretboard_chord_queue', JSON.stringify(chordQueue));

        const newUrl = new URL(window.location.href);
        if (chordQueue.length > 0) {
            newUrl.searchParams.set('chords', encodeDense(chordQueue));
        } else {
            newUrl.searchParams.delete('chords');
        }
        // chordQueueSync marks this URL as self-written. history.state
        // survives reloads but is null on fresh navigations, letting the app
        // tell a reload apart from an incoming shared link (App.tsx only
        // switches to the Library for the latter).
        window.history.replaceState({ ...window.history.state, chordQueueSync: true }, '', newUrl.toString());
    }, [chordQueue]);

    const selectFromQueue = useCallback((index: number) => {
        if (index >= 0 && index < chordQueue.length) {
            setActiveQueueIndex(index);
            onSelectChord?.(chordQueue[index], index);
        }
    }, [chordQueue, onSelectChord]);

    const addToQueue = useCallback((root: Note, quality: ChordQuality) => {
        const newChord: QueuedChord = {
            id: Date.now().toString() + Math.random().toString(36).substring(7),
            root,
            quality
        };
        setChordQueue(prev => {
            const nextQueue = [...prev, newChord];
            setActiveQueueIndex(nextQueue.length - 1);
            return nextQueue;
        });
    }, []);

    const removeFromQueue = useCallback((index: number, e?: { stopPropagation: () => void }) => {
        if (e) {
            e.stopPropagation();
        }
        
        setActiveQueueIndex(prevActiveIndex => {
            if (prevActiveIndex === index) {
                onRemoveActiveChord?.();
                return -1;
            } else if (prevActiveIndex > index) {
                return prevActiveIndex - 1;
            }
            return prevActiveIndex;
        });

        setChordQueue(prev => {
            const nextQueue = [...prev];
            nextQueue.splice(index, 1);
            return nextQueue;
        });
    }, [onRemoveActiveChord]);

    const clearQueue = useCallback(() => {
        setChordQueue([]);
        setActiveQueueIndex(-1);
        onRemoveActiveChord?.();
    }, [onRemoveActiveChord]);

    const nextInQueue = useCallback(() => {
        if (activeQueueIndex < chordQueue.length - 1) {
            selectFromQueue(activeQueueIndex + 1);
        }
    }, [activeQueueIndex, chordQueue.length, selectFromQueue]);

    const prevInQueue = useCallback(() => {
        if (activeQueueIndex > 0) {
            selectFromQueue(activeQueueIndex - 1);
        }
    }, [activeQueueIndex, selectFromQueue]);

    // Handle keyboard arrow keys navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'SELECT' || document.activeElement?.tagName === 'INPUT') {
                return;
            }

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
    }, [activeQueueIndex, chordQueue, selectFromQueue]);

    return {
        chordQueue,
        activeQueueIndex,
        setActiveQueueIndex,
        addToQueue,
        removeFromQueue,
        clearQueue,
        nextInQueue,
        prevInQueue,
        selectFromQueue
    };
};
