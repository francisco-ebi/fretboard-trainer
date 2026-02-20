import { getNoteAtPosition, getChordNotes, type Note, type Instrument, type ChordQuality } from './musicTheory';

export interface Voicing {
    frets: number[]; // Index maps to string index (0 is usually High E for standard Guitar config)
    startFret: number; // Lowest played fret (excluding 0). Used to anchor badges.
    score: number;
}

export function getChordVoicings(
    instrument: Instrument,
    tuningOffsets: number[],
    stringCount: number,
    root: Note,
    quality: ChordQuality,
    maxFrets: number = 18,
    limit: number = 10
): Voicing[] {
    const requiredNotes = getChordNotes(root, quality);
    const voicings: Voicing[] = [];

    // Check every sliding window up to maxFrets
    for (let windowStart = 1; windowStart <= maxFrets - 4; windowStart++) {
        // Collect choices for each string
        const stringChoices: number[][] = [];
        for (let s = 0; s < stringCount; s++) {
            const choices = [-1]; // -1 = muted string

            // Add open string if it matches a chord note
            const openNote = getNoteAtPosition(instrument, s, 0, tuningOffsets, stringCount);
            if (requiredNotes.includes(openNote)) {
                choices.push(0);
            }

            // Add frets in this 5-fret window
            for (let f = windowStart; f < windowStart + 5; f++) {
                if (f <= maxFrets) {
                    const note = getNoteAtPosition(instrument, s, f, tuningOffsets, stringCount);
                    if (requiredNotes.includes(note)) {
                        choices.push(f);
                    }
                }
            }
            stringChoices.push(choices);
        }

        // Cartesian product of stringChoices
        const generateCombinations = (strIdx: number, currentFrets: number[]) => {
            if (strIdx === stringCount) {
                // Evaluate currentFrets as a complete voicing scenario
                evaluateAndAddVoicing(currentFrets, root, requiredNotes, instrument, tuningOffsets, stringCount, voicings);
                return;
            }
            for (const fret of stringChoices[strIdx]) {
                generateCombinations(strIdx + 1, [...currentFrets, fret]);
            }
        };

        generateCombinations(0, []);
    }

    // Deduplicate logic
    const uniqueVoicings = new Map<string, Voicing>();
    for (const v of voicings) {
        const key = v.frets.join(',');
        if (!uniqueVoicings.has(key) || v.score < uniqueVoicings.get(key)!.score) {
            uniqueVoicings.set(key, v);
        }
    }

    // Sort by score and limit
    return Array.from(uniqueVoicings.values())
        .sort((a, b) => a.score - b.score)
        .slice(0, limit);
}

function evaluateAndAddVoicing(
    frets: number[],
    root: Note,
    requiredNotes: string[],
    instrument: Instrument,
    tuningOffsets: number[],
    stringCount: number,
    voicings: Voicing[]
) {
    const playedNotes = new Set<string>();
    let bassNote = '';

    // Find bass string (highest index of string configs natively maps to lowest pitch in standard guitar)
    let bassStringInd = -1;
    for (let i = stringCount - 1; i >= 0; i--) {
        if (frets[i] !== -1) {
            bassStringInd = i;
            break;
        }
    }

    if (bassStringInd === -1) return; // Completely muted

    for (let s = 0; s < stringCount; s++) {
        if (frets[s] !== -1) {
            const note = getNoteAtPosition(instrument, s, frets[s], tuningOffsets, stringCount);
            playedNotes.add(note);
            if (s === bassStringInd) {
                bassNote = note;
            }
        }
    }

    // Ensure adequate chord coverage based on required extensions
    if (requiredNotes.length <= 4) {
        if (playedNotes.size < requiredNotes.length) return;
    } else {
        if (playedNotes.size < requiredNotes.length - 1) return;
        if (!playedNotes.has(root)) return;
        if (!playedNotes.has(requiredNotes[requiredNotes.length - 1])) return;
    }

    // Reject uncomfortable string muting gaps (more than 1 middle string muted)
    let minPlayedStr = 0; while (minPlayedStr < stringCount && frets[minPlayedStr] === -1) minPlayedStr++;
    let maxPlayedStr = stringCount - 1; while (maxPlayedStr >= 0 && frets[maxPlayedStr] === -1) maxPlayedStr--;

    let internalMutes = 0;
    for (let s = minPlayedStr; s <= maxPlayedStr; s++) {
        if (frets[s] === -1) internalMutes++;
    }
    if (internalMutes > 0) return;

    // Filter physical unplayable stretches
    const activeFrets = frets.filter(f => f > 0);
    let startFret = 0;

    if (activeFrets.length > 0) {
        const minFret = Math.min(...activeFrets);
        const maxFret = Math.max(...activeFrets);
        startFret = minFret;

        const stretch = maxFret - minFret;
        if (stretch >= 4) return; // Disallow 5+ fret stretches (diff 4)

        let minStringOnMinFret = stringCount;
        let maxStringOnMinFret = -1;
        let stringsOnMinFret = 0;

        for (let s = 0; s < stringCount; s++) {
            if (frets[s] === minFret) {
                stringsOnMinFret++;
                if (s < minStringOnMinFret) minStringOnMinFret = s;
                if (s > maxStringOnMinFret) maxStringOnMinFret = s;
            }
        }

        let fingers = activeFrets.length;
        let usedBarre = false;
        if (stringsOnMinFret >= 2) {
            // Check if barre is valid (no open strings underneath the barre span)
            let validBarre = true;
            for (let s = minStringOnMinFret; s <= maxStringOnMinFret; s++) {
                if (frets[s] === 0) validBarre = false;
            }

            // Also reject internal open strings that break the physical barre placement
            let internalOpens = 0;
            for (let s = 1; s < stringCount - 1; s++) {
                if (frets[s] === 0) internalOpens++;
            }
            if (internalOpens > 0) validBarre = false;

            // Reject if there is an open string physically higher than the barre
            // (e.g. index < minStringOnMinFret), because barring lower strings
            // while arching to leave the higher E string open is extremely difficult.
            for (let s = 0; s < minStringOnMinFret; s++) {
                if (frets[s] === 0) validBarre = false;
            }

            if (validBarre) {
                usedBarre = true;
                fingers = 1 + (activeFrets.length - stringsOnMinFret); // Barre takes 1 finger
            }
        }

        if (fingers > 4) return; // Most humans have 4 available fingers 

        // Priority Scoring
        let score = 0;

        if (bassNote === root) {
            score -= 50; // Vastly prefer root bass 
        } else {
            score += 20; // Slight penalty for inversions 
        }

        const mutes = frets.filter(f => f === -1).length;
        score += (mutes * 20);

        const opens = frets.filter(f => f === 0).length;
        score -= (opens * 10);

        if (usedBarre && stringsOnMinFret >= 3) {
            score -= 20; // Reward standard rigid barres (like E and A shape)
        }

        score += (startFret * 2);

        voicings.push({
            frets,
            startFret,
            score
        });
    } else {
        // Only open strings and mutes
        let score = 0;
        if (bassNote === root) score -= 50;
        else score += 20;

        const mutes = frets.filter(f => f === -1).length;
        score += (mutes * 20);

        const opens = frets.filter(f => f === 0).length;
        score -= (opens * 10);

        voicings.push({
            frets,
            startFret: 0,
            score
        });
    }
}
