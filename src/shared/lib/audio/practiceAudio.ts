import { type EngineNoteEvent } from '@/shared/lib/audio/recording-engine';

export const MIDI_OFFSET_FROM_C0 = 12;

/**
 * Calculates the fret index played on a specific string from a detected MIDI note.
 *
 * @param midi Detected MIDI note number (e.g. 64 for E4, 40 for E2)
 * @param stringIndex 0-indexed string number
 * @param openStringPitches Semitones above C0 for each open string (including tuning offsets)
 * @returns Fret number (0 for open string, 1 for 1st fret, etc.)
 */
export const calculatePlayedFret = (
    midi: number,
    stringIndex: number,
    openStringPitches: number[]
): number => {
    if (stringIndex < 0 || stringIndex >= openStringPitches.length) {
        return -1;
    }
    const openMidi = openStringPitches[stringIndex] + MIDI_OFFSET_FROM_C0;
    return midi - openMidi;
};

/**
 * Checks if a fret is within the playable bounds of the fretboard.
 */
export const isValidFret = (fret: number, maxFret: number = 18): boolean => {
    return Number.isInteger(fret) && fret >= 0 && fret <= maxFret;
};

export interface NoteEventFilterConfig {
    minConfidence?: number;
    minRms?: number;
    debounceMs?: number;
}

export const DEFAULT_NOTE_FILTER_CONFIG: Required<NoteEventFilterConfig> = {
    minConfidence: 0.5,
    minRms: 0.003,
    debounceMs: 250
};

/**
 * State machine for filtering note events and debouncing plucks in practice mode.
 */
export class PracticeNoteHandler {
    private config: Required<NoteEventFilterConfig>;
    private lastHandledMidi: number | null = null;
    private lastHandledTime: number = 0;
    private consecutiveCount: number = 0;
    private lastSeenMidi: number | null = null;

    constructor(config: Required<NoteEventFilterConfig> = DEFAULT_NOTE_FILTER_CONFIG) {
        this.config = config;
    }

    /**
     * Resets the handler state (e.g., when a question advances or changes).
     */
    reset() {
        this.lastHandledMidi = null;
        this.lastHandledTime = 0;
        this.consecutiveCount = 0;
        this.lastSeenMidi = null;
    }

    /**
     * Evaluates an incoming audio note event.
     * Returns the MIDI note if it is a valid, confident, new pluck event; null otherwise.
     */
    processEvent(event: EngineNoteEvent, now: number = performance.now()): number | null {
        // Must meet confidence and energy thresholds
        if (event.pitchConfidence < this.config.minConfidence || event.rms < this.config.minRms) {
            this.consecutiveCount = 0;
            this.lastSeenMidi = null;
            return null;
        }

        // Track consecutive frames of the same note to filter transient pitch drifts
        if (this.lastSeenMidi === event.midi) {
            this.consecutiveCount += 1;
        } else {
            this.lastSeenMidi = event.midi;
            this.consecutiveCount = 1;
        }

        const isFreshOnset = event.isOnset;
        // Require either an onset or at least 2 consecutive stable frames
        const isStablePluck = isFreshOnset || this.consecutiveCount >= 2;

        if (!isStablePluck) {
            return null;
        }

        // Debounce if the same note was just handled recently
        const timeSinceLastHandled = now - this.lastHandledTime;
        if (this.lastHandledMidi === event.midi && timeSinceLastHandled < this.config.debounceMs) {
            return null;
        }

        this.lastHandledMidi = event.midi;
        this.lastHandledTime = now;
        return event.midi;
    }
}
