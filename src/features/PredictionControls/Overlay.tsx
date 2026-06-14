import React, { useEffect, useState } from 'react';
import { guitarPredictionEngine, type PredictionResult } from '@/shared/lib/audio/prediction-engine';
import { useOrientation } from '@/app/providers';

interface PredictionOverlayProps {
    stringCount: number;
}

const PredictionOverlay: React.FC<PredictionOverlayProps> = ({ stringCount }) => {
    const { orientation } = useOrientation();
    const [prediction, setPrediction] = useState<PredictionResult | null>(null);

    useEffect(() => {
        if (!guitarPredictionEngine) return;
        
        const subscription = guitarPredictionEngine.fretPredicted$.subscribe(setPrediction);
        return () => subscription.unsubscribe();
    }, []);

    if (!prediction) return null;

    // Calculate grid position
    // Horizontal Mode: Strings are rows (0 to stringCount - 1)
    // Row = stringIndex + 1 (since CSS grid starts at 1)
    // Column = fret + 1 (fret 0 is open string)
    
    // Vertical Mode: Strings are columns (lowest string on left, highest index)
    // Col = (stringCount - 1 - stringIndex) + 1 = stringCount - stringIndex
    // Row = fret + 1

    let gridRow = 1;
    let gridColumn = 1;

    if (orientation === 'VERTICAL') {
        gridColumn = stringCount - prediction.predictedStringNumber;
        gridRow = prediction.predictedFret + 1;
    } else {
        gridRow = prediction.predictedStringNumber + 1;
        gridColumn = prediction.predictedFret + 1;
    }

    return (
        <div 
            style={{ 
                gridRow, 
                gridColumn, 
                position: 'relative', 
                zIndex: 10,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%'
            }}
        >
            <div className="prediction-marker-ring" />
        </div>
    );
};

export default PredictionOverlay;
