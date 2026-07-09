import { describe, it, expect } from 'vitest';
import { getChordVoicings, analyzeGrip, type Voicing } from '../chordVoicings';
import { CHORD_INTERVALS, INSTRUMENT_CONFIGS, type ChordQuality, type Note } from '../musicTheory';

// Grips are written low string -> high string like chord charts (x32010 = open C),
// then reversed into the app's high-E-first string order.
const grip = (chart: string): number[] =>
    chart.split('').reverse().map(c => (c === 'x' ? -1 : parseInt(c, 10)));

const voicingsFor = (root: Note, quality: ChordQuality) =>
    getChordVoicings('GUITAR', [], 6, root, quality, 18, 15);

const findGrip = (voicings: Voicing[], chart: string) =>
    voicings.find(v => v.frets.join(',') === grip(chart).join(','));

const bestScored = (voicings: Voicing[]) =>
    voicings.reduce((best, v) => (v.score < best.score ? v : best));

describe('chordVoicings - canonical open shapes rank first', () => {
    const iconic: Array<[Note, ChordQuality, string]> = [
        ['C', 'MAJOR', 'x32010'],
        ['A', 'MAJOR', 'x02220'],
        ['G', 'MAJOR', '320003'],
        ['E', 'MAJOR', '022100'],
        ['D', 'MAJOR', 'xx0232'],
        ['A', 'MINOR', 'x02210'],
        ['E', 'MINOR', '022000'],
        ['D', 'MINOR', 'xx0231'],
        ['E', 'DOM7', '020100'],
        ['A', 'DOM7', 'x02020'],
        ['A', 'MIN7', 'x02010'],
        ['E', 'MIN7', '020000']
    ];

    it.each(iconic)('%s %s -> %s is the best-scored voicing', (root, quality, chart) => {
        const voicings = voicingsFor(root, quality);
        expect(voicings.length).toBeGreaterThan(0);
        expect(bestScored(voicings).frets).toEqual(grip(chart));
    });
});

describe('chordVoicings - standard grips are present in the top results', () => {
    const standard: Array<[Note, ChordQuality, string]> = [
        // Barre shapes
        ['F', 'MAJOR', '133211'],
        ['B', 'MAJOR', 'x24442'],
        ['B', 'MINOR', 'x24432'],
        ['F#', 'MINOR', '244222'],
        // Dominant 7ths
        ['D', 'DOM7', 'xx0212'],
        ['G', 'DOM7', '320001'],
        ['C', 'DOM7', 'x32310'],
        ['B', 'DOM7', 'x21202'],
        // Major 7ths
        ['C', 'MAJ7', 'x32000'],
        ['A', 'MAJ7', 'x02120'],
        ['D', 'MAJ7', 'xx0222'],
        ['G', 'MAJ7', '320002'],
        ['F', 'MAJ7', 'xx3210'],
        // Minor 7ths
        ['D', 'MIN7', 'xx0211'],
        // Sus and add colors
        ['D', 'SUS2', 'xx0230'],
        ['D', 'SUS4', 'xx0233'],
        ['A', 'SUS2', 'x02200'],
        ['A', 'SUS4', 'x02230'],
        ['E', 'SUS4', '022200'],
        ['C', 'ADD9', 'x32030']
    ];

    it.each(standard)('%s %s includes %s', (root, quality, chart) => {
        const voicings = voicingsFor(root, quality);
        expect(findGrip(voicings, chart), `expected ${chart} in [${voicings.map(v => v.frets.join('|')).join(', ')}]`).toBeDefined();
    });

    it('rejects hollow voicings where one note exceeds half the sounded strings', () => {
        // x20402 = B D B B F# (three roots out of five) must not outrank real Bm grips
        expect(findGrip(voicingsFor('B', 'MINOR'), 'x20402')).toBeUndefined();
    });
});

describe('chordVoicings - every voicing is musically valid and humanly playable', () => {
    const ALL_QUALITIES = Object.keys(CHORD_INTERVALS) as ChordQuality[];
    const GUITAR_TUNING = INSTRUMENT_CONFIGS.GUITAR.defaultTuning;

    const pitchClassAt = (stringIndex: number, fret: number) =>
        (GUITAR_TUNING[stringIndex] + fret) % 12;

    const verify = (root: Note, quality: ChordQuality, voicings: Voicing[]) => {
        const label = `${root} ${quality}`;
        expect(voicings.length, `${label} produced no voicings`).toBeGreaterThan(0);

        for (const v of voicings) {
            const tag = `${label} [${v.frets.join(',')}]`;
            expect(v.frets, tag).toHaveLength(6);

            // Physically holdable by a 4-finger hand
            expect(analyzeGrip(v.frets), `${tag} is not playable`).not.toBeNull();

            const sounded = v.frets.filter(f => f >= 0);
            expect(sounded.length, tag).toBeGreaterThanOrEqual(3);

            // At most one internal muted string
            const first = v.frets.findIndex(f => f >= 0);
            const last = v.frets.length - 1 - [...v.frets].reverse().findIndex(f => f >= 0);
            const internalMutes = v.frets.slice(first, last + 1).filter(f => f === -1).length;
            expect(internalMutes, tag).toBeLessThanOrEqual(1);

            // Only chord tones, and the root always present
            const playedPcs = new Set(v.frets.flatMap((f, s) => (f >= 0 ? [pitchClassAt(s, f)] : [])));
            const chordPcs = new Set(CHORD_INTERVALS[quality].map(iv => (pcOf(root) + iv) % 12));
            for (const pc of playedPcs) {
                expect(chordPcs.has(pc), `${tag} contains a non-chord tone`).toBe(true);
            }
            expect(playedPcs.has(pcOf(root)), `${tag} is missing the root`).toBe(true);
        }
    };

    const pcOf = (note: Note): number => {
        const letters: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        let pc = letters[note.charAt(0)];
        for (const mod of note.slice(1)) pc += mod === '#' ? 1 : mod === 'b' ? -1 : 0;
        return ((pc % 12) + 12) % 12;
    };

    it('holds for every quality on C and on the enharmonic-heavy G#', { timeout: 30000 }, () => {
        for (const quality of ALL_QUALITIES) {
            verify('C', quality, voicingsFor('C', quality));
            verify('G#', quality, voicingsFor('G#', quality));
        }
    });

    it('holds for common qualities across all 12 roots', { timeout: 30000 }, () => {
        const roots: Note[] = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        for (const root of roots) {
            for (const quality of ['MAJOR', 'MINOR', 'DOM7'] as ChordQuality[]) {
                verify(root, quality, voicingsFor(root, quality));
            }
        }
    });
});

describe('chordVoicings - other instruments', () => {
    it('finds the canonical ukulele C major (0003) using true pitch for the bass', () => {
        const voicings = getChordVoicings('UKULELE', [], 4, 'C', 'MAJOR', 15, 10);
        expect(findGrip(voicings, '0003')).toBeDefined();
    });

    it('finds ukulele A minor (2000)', () => {
        const voicings = getChordVoicings('UKULELE', [], 4, 'A', 'MINOR', 15, 10);
        expect(findGrip(voicings, '2000')).toBeDefined();
    });

    it('produces triads on bass for all roots', () => {
        const roots: Note[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Eb', 'F#', 'Bb'];
        for (const root of roots) {
            expect(getChordVoicings('BASS', [], 4, root, 'MAJOR', 18, 10).length, `${root} major on bass`).toBeGreaterThan(0);
            expect(getChordVoicings('BASS', [], 4, root, 'MINOR', 18, 10).length, `${root} minor on bass`).toBeGreaterThan(0);
        }
    });
});

describe('analyzeGrip - hand mechanics', () => {
    it('recognizes the F major full barre', () => {
        const result = analyzeGrip(grip('133211'));
        expect(result).not.toBeNull();
        expect(result!.barre).toBe(true);
        expect(result!.fingers).toBe(4);
    });

    it('uses three fingers for open C', () => {
        const result = analyzeGrip(grip('x32010'));
        expect(result).toMatchObject({ barre: false, fingers: 3 });
    });

    it('collapses xx0222 (Dmaj7) into a single mini-barre finger', () => {
        const result = analyzeGrip(grip('xx0222'));
        expect(result).not.toBeNull();
        expect(result!.fingers).toBe(1);
    });

    it('allows the jazz G13 grip 3x3455 via a treble mini-barre', () => {
        expect(analyzeGrip(grip('3x3455'))).not.toBeNull();
    });

    it('rejects spans wider than a 4-fret box', () => {
        expect(analyzeGrip(grip('1xx5xx'))).toBeNull();
    });

    it('rejects five fingers when an open string blocks the barre', () => {
        // The open high E prevents an index barre at fret 3, leaving 5 notes for 4 fingers
        expect(analyzeGrip(grip('553450'))).toBeNull();
    });

    it('rejects a barre with a muted string underneath it', () => {
        // x5555 with an interior mute cannot be barred nor fingered note-by-note
        expect(analyzeGrip([5, -1, 5, 5, 5, 5])).toBeNull();
    });
});
