import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { guitarPredictionEngine, type PredictionResult } from '@/shared/lib/audio/prediction-engine';
import { useOrientation } from '@/app/providers';

// Positioned by measuring the target cell's rect (same pattern as the
// fretboard's measurement overlay) rather than by grid placement: an
// explicitly-placed grid item collides with the auto-placed, full-span
// string rows — the target row gets bumped down and the marker strands in a
// zero-height inserted row, rendering on the boundary between two strings.
const PredictionOverlay: React.FC = () => {
    const { orientation } = useOrientation();
    const [prediction, setPrediction] = useState<PredictionResult | null>(null);
    const markerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const subscription = guitarPredictionEngine.fretPredicted$.subscribe(setPrediction);
        return () => subscription.unsubscribe();
    }, []);

    // Writes coordinates straight to the marker element: position is derived
    // DOM geometry, not React state
    useLayoutEffect(() => {
        if (!prediction) return;

        const update = () => {
            const marker = markerRef.current;
            const cell = document.getElementById(`fret-${prediction.predictedStringNumber}-${prediction.predictedFret}`);
            const board = cell?.closest('.fretboard');
            if (!marker || !cell || !board) return;
            const cellRect = cell.getBoundingClientRect();
            const boardRect = board.getBoundingClientRect();
            // Absolute children anchor to the board's padding box, but the
            // rects measure its border box — clientLeft/Top are the borders
            marker.style.left = `${cellRect.left + cellRect.width / 2 - boardRect.left - board.clientLeft}px`;
            marker.style.top = `${cellRect.top + cellRect.height / 2 - boardRect.top - board.clientTop}px`;
            marker.style.visibility = 'visible';
        };

        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [prediction, orientation]);

    if (!prediction) return null;

    return (
        // Hidden until the first measurement so it can't flash at (0,0)
        <div ref={markerRef} className="prediction-marker" style={{ visibility: 'hidden' }}>
            <div className="prediction-marker-ring" />
        </div>
    );
};

export default PredictionOverlay;
