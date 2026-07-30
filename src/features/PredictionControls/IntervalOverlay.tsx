import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { guitarPredictionEngine, type PredictionResult } from '@/shared/lib/audio/prediction-engine';
import { getIntervalBySemitones } from '@/shared/lib/music/musicTheory';
import { useOrientation } from '@/app/providers';
import { intervalTrackingEnabled$ } from './interval-tracking';

// How long the annotation stays up after the second note is detected. A newly
// played note replaces the pair and restarts the countdown.
const HIDE_AFTER_MS = 5000;

interface IntervalOverlayProps {
    // A manual two-note measurement owns the same overlay slot, so it wins
    suppressed?: boolean;
}

type NotePair = { first: PredictionResult; second: PredictionResult };

const positionKey = (p: PredictionResult) => `${p.predictedStringNumber}-${p.predictedFret}`;

// Draws the interval between the last two played notes, mirroring the manual
// two-note measurement (dashed line + midpoint label) in the prediction's gold
// so it reads as machine-detected rather than hand-picked.
const IntervalOverlay: React.FC<IntervalOverlayProps> = ({ suppressed = false }) => {
    const { t } = useTranslation();
    const { orientation } = useOrientation();
    const [enabled, setEnabled] = useState(intervalTrackingEnabled$.value);
    const [pair, setPair] = useState<NotePair | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const lineRef = useRef<SVGLineElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const subscription = intervalTrackingEnabled$.subscribe((value) => {
            setEnabled(value);
            // Stopping a session drops whatever was on screen
            if (!value) setPair(null);
        });
        return () => subscription.unsubscribe();
    }, []);

    // The stabilizer re-emits the same position for as long as a note rings,
    // so only a *change* of position counts as a new note — a re-pluck of the
    // same fret is indistinguishable from sustain here. The null it emits
    // after the silence timeout ends the phrase: the next note starts a fresh
    // pair rather than pairing with something played long before.
    useEffect(() => {
        if (!enabled) return;

        let last: PredictionResult | null = null;
        let stalePositionKey: string | null = null;
        const subscription = guitarPredictionEngine.fretPredicted$.subscribe((prediction) => {
            if (!prediction) {
                // The silence timeout clears the marker but not the
                // stabilizer's vote window, so the next pluck first flushes a
                // phantom re-emission of the position that was sounding before
                // the gap. Remember it, or it becomes the new phrase's first
                // note and pairs across the silence.
                stalePositionKey = last ? positionKey(last) : null;
                last = null;
                return;
            }

            const key = positionKey(prediction);
            if (key === stalePositionKey) return;
            stalePositionKey = null;

            if (last && positionKey(last) !== key) {
                setPair({ first: last, second: prediction });
            }
            last = prediction;
        });
        return () => subscription.unsubscribe();
    }, [enabled]);

    useEffect(() => {
        if (!pair) return;
        // `pair` is a fresh object per detection, so this re-arms each time
        const timerId = setTimeout(() => setPair(null), HIDE_AFTER_MS);
        return () => clearTimeout(timerId);
    }, [pair]);

    // Endpoints are written straight to the elements: position is derived DOM
    // geometry, not React state (same as the prediction marker)
    useLayoutEffect(() => {
        if (!pair || suppressed) return;

        const update = () => {
            const container = containerRef.current;
            const line = lineRef.current;
            const popup = popupRef.current;
            if (!container || !line || !popup) return;

            const cell1 = document.getElementById(`fret-${pair.first.predictedStringNumber}-${pair.first.predictedFret}`);
            const cell2 = document.getElementById(`fret-${pair.second.predictedStringNumber}-${pair.second.predictedFret}`);
            const board = cell1?.closest('.fretboard');
            // Predictions reach fret 24 but the board stops at 18; without both
            // cells there is nothing to anchor the line to
            if (!cell1 || !cell2 || !board) {
                container.style.visibility = 'hidden';
                return;
            }

            const boardRect = board.getBoundingClientRect();
            const rect1 = cell1.getBoundingClientRect();
            const rect2 = cell2.getBoundingClientRect();

            // Absolute children anchor to the board's padding box, but the
            // rects measure its border box — clientLeft/Top are the borders
            const originX = boardRect.left + board.clientLeft;
            const originY = boardRect.top + board.clientTop;

            const x1 = rect1.left + rect1.width / 2 - originX;
            const y1 = rect1.top + rect1.height / 2 - originY;
            const x2 = rect2.left + rect2.width / 2 - originX;
            const y2 = rect2.top + rect2.height / 2 - originY;

            line.setAttribute('x1', `${x1}`);
            line.setAttribute('y1', `${y1}`);
            line.setAttribute('x2', `${x2}`);
            line.setAttribute('y2', `${y2}`);
            popup.style.left = `${(x1 + x2) / 2}px`;
            popup.style.top = `${(y1 + y2) / 2}px`;
            container.style.visibility = 'visible';
        };

        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [pair, suppressed, orientation]);

    if (!pair || suppressed) return null;

    const interval = getIntervalBySemitones(pair.second.midiNoteDetected - pair.first.midiNoteDetected);
    let intervalName = t(`intervals.${interval.key}`);
    if (interval.octaves > 0) {
        intervalName += ` + ${interval.octaves} ${t('intervals.octaves', { count: interval.octaves })}`;
    }

    return (
        // Hidden until the first measurement so it can't flash at (0,0)
        <div ref={containerRef} className="measurement-overlay-container detected" style={{ visibility: 'hidden' }}>
            <svg className="measurement-svg-overlay" xmlns="http://www.w3.org/2000/svg">
                <line ref={lineRef} className="measurement-line" />
            </svg>
            <div ref={popupRef} className="interval-popup">
                <div className="interval-popup-result">{intervalName}</div>
            </div>
        </div>
    );
};

export default IntervalOverlay;
