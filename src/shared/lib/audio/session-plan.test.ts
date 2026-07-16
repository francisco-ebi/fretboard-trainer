import { describe, it, expect } from 'vitest';
import { generateSessionPlan, zoneOf, OPEN_STRING_MIDI, MAX_FRET } from './session-plan';
import { STRING_MIDI_RANGES } from './recording-engine';

describe('session plan generation', () => {
    it('keeps its open-string notes in sync with the engine capture ranges', () => {
        for (const stringIndex of [0, 1, 2, 3, 4, 5]) {
            expect(OPEN_STRING_MIDI[stringIndex]).toBe(STRING_MIDI_RANGES[stringIndex].min);
        }
    });

    it('classifies zones per the coverage map (protocol §3.1)', () => {
        expect(zoneOf(5, 4)).toBe('unique');
        expect(zoneOf(5, 5)).toBe('overlap');
        expect(zoneOf(0, 13)).toBe('overlap');
        expect(zoneOf(0, 14)).toBe('unique');
        for (const stringIndex of [1, 2, 3, 4]) {
            expect(zoneOf(stringIndex, 0)).toBe('overlap');
            expect(zoneOf(stringIndex, MAX_FRET)).toBe('overlap');
        }
    });

    it('pass A walks strings 5→0 over frets 0–9', () => {
        const plan = generateSessionPlan({ preset: 'passA' });
        expect(plan.strings.map((s) => s.stringIndex)).toEqual([5, 4, 3, 2, 1, 0]);
        for (const stringTask of plan.strings) {
            expect(stringTask.frets[0].fret).toBe(0);
            expect(stringTask.frets[stringTask.frets.length - 1].fret).toBe(9);
        }
        expect(plan.totalPlucks).toBe(400);
    });

    it('pass B walks strings 0→5 over frets 10–18', () => {
        const plan = generateSessionPlan({ preset: 'passB' });
        expect(plan.strings.map((s) => s.stringIndex)).toEqual([0, 1, 2, 3, 4, 5]);
        for (const stringTask of plan.strings) {
            expect(stringTask.frets[0].fret).toBe(10);
            expect(stringTask.frets[stringTask.frets.length - 1].fret).toBe(18);
        }
        expect(plan.totalPlucks).toBe(348);
    });

    it('full pass covers the whole coverage map', () => {
        const plan = generateSessionPlan({ preset: 'full' });
        expect(plan.totalPlucks).toBe(748);
    });

    it('gives plain strings the ×1.5 pluck allowance (protocol §3.2)', () => {
        const plan = generateSessionPlan({ preset: 'full' });
        const byIndex = (index: number) => plan.strings.find((s) => s.stringIndex === index)!;

        // Wound string: base grid
        expect(byIndex(4).frets[7].plucks).toHaveLength(6);
        expect(byIndex(5).frets[0].plucks).toHaveLength(2); // unique zone

        // Plain strings (high E, B): 9 per overlap fret, 3 per unique fret
        const highE = byIndex(0);
        const bString = byIndex(1);
        expect(bString.frets[7].plucks).toHaveLength(9);
        expect(highE.frets[2].plucks).toHaveLength(9); // overlap (fret ≤ 13)
        expect(highE.frets[16].plucks).toHaveLength(3); // unique (fret ≥ 14)

        // The extra sweep still covers all three dynamics
        const extras = bString.frets[7].plucks.slice(6);
        expect(extras.map((p) => p.dynamics).sort()).toEqual(['hard', 'medium', 'soft']);
    });

    it('builds the compressed variation grid per zone (protocol §3.2)', () => {
        const plan = generateSessionPlan({ preset: 'full' });
        const lowE = plan.strings[0];
        expect(lowE.stringIndex).toBe(5);

        const unique = lowE.frets[0]; // fret 0 — unique zone
        expect(unique.plucks).toHaveLength(2);
        expect(unique.plucks.every((p) => p.dynamics === 'medium')).toBe(true);
        expect(unique.plucks.map((p) => p.excitation).sort()).toEqual(['finger', 'pick']);

        const overlap = lowE.frets[5]; // fret 5 — overlap zone
        expect(overlap.plucks).toHaveLength(6);
        const combos = overlap.plucks.map((p) => `${p.dynamics}/${p.excitation}`).sort();
        expect(combos).toEqual([
            'hard/finger', 'hard/pick',
            'medium/finger', 'medium/pick',
            'soft/finger', 'soft/pick'
        ]);
    });

    it('rotates pluck position across consecutive frets', () => {
        const plan = generateSessionPlan({ preset: 'passB' }); // all-overlap frets on string 0
        const frets = plan.strings[0].frets;
        const firstPositions = new Set(frets.slice(0, 3).map((f) => f.plucks[0].position));
        expect(firstPositions.size).toBe(3);
    });

    it('computes each fret note from the open string', () => {
        const plan = generateSessionPlan({ preset: 'full' });
        for (const stringTask of plan.strings) {
            for (const fretTask of stringTask.frets) {
                expect(fretTask.midi).toBe(stringTask.openMidi + fretTask.fret);
            }
        }
        expect(plan.strings[0].frets[0].noteName).toBe('E2'); // string 5 open
    });

    it('clamps and validates single-string plans', () => {
        const plan = generateSessionPlan({ preset: 'single', stringIndex: 3, fretStart: -2, fretEnd: 99 });
        expect(plan.strings).toHaveLength(1);
        expect(plan.strings[0].stringIndex).toBe(3);
        expect(plan.strings[0].frets[0].fret).toBe(0);
        expect(plan.strings[0].frets[plan.strings[0].frets.length - 1].fret).toBe(MAX_FRET);

        expect(() => generateSessionPlan({ preset: 'single', stringIndex: 9 })).toThrow();
        expect(() => generateSessionPlan({ preset: 'single', stringIndex: 3, fretStart: 7, fretEnd: 2 })).toThrow();
    });
});
