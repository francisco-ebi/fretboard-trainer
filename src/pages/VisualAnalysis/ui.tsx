import React, { useEffect, useRef, useState, useMemo } from 'react';
import { drawCepstrogram } from '@/shared/lib/analysis';
import { fetchDataset } from '@/shared/lib/audio/dataset-loader';
import { groupDataByString } from '@/shared/lib/audio/dataset-preparation';
import type { DatasetEntry } from '@/shared/lib/audio/recording-engine';
// Using groupDataByString to get a flat list of frames for a string
import '@/app/styles/FullScreenStyles.css'; // Reusing full screen styles

const VisualAnalysis: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [selectedString, setSelectedString] = useState<number>(0);
    const [dataset, setDataset] = useState<DatasetEntry[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        fetchDataset<DatasetEntry[]>('essentia-acoustic-ts/guitar_dataset.json')
            .then(setDataset)
            .catch(err => setLoadError(String(err)));
    }, []);

    const groupedData = useMemo(() => dataset ? groupDataByString(dataset) : [], [dataset]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Find data for selected string
        const stringData = groupedData.find(g => g.label === selectedString);

        if (stringData && stringData.frames.length > 0) {
            // Resize canvas to fit data if needed, or keeping it fixed size with scaling
            // Let's use a wide canvas to show time
            // canvas.width = stringData.frames.length; // Might be too wide

            drawCepstrogram(canvas, stringData.frames);
        } else {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }

    }, [selectedString, groupedData]);

    if (loadError) {
        return <div style={{ padding: '20px', color: '#f87171' }}>Failed to load dataset: {loadError}</div>;
    }

    if (!dataset) {
        return <div style={{ padding: '20px', color: 'white' }}>Loading dataset…</div>;
    }

    return (
        <div className="visual-analysis-container" style={{ padding: '20px', color: 'white' }}>
            <h2>Cepstrogram Visualizer</h2>

            <div className="controls" style={{ marginBottom: '20px' }}>
                <label style={{ marginRight: '10px' }}>Select String (0-5 / Low E - High E): </label>
                <select
                    value={selectedString}
                    onChange={(e) => setSelectedString(Number(e.target.value))}
                    style={{ padding: '5px', fontSize: '1rem' }}
                >
                    {[0, 1, 2, 3, 4, 5].map(num => (
                        <option key={num} value={num}>String {num}</option>
                    ))}
                </select>
            </div>

            <div className="canvas-wrapper" style={{ overflowX: 'auto', border: '1px solid #444' }}>
                <canvas
                    ref={canvasRef}
                    width={1000}
                    height={300}
                    style={{ backgroundColor: '#000', display: 'block' }}
                />
            </div>

            <p style={{ marginTop: '10px', fontSize: '0.9rem', color: '#aaa' }}>
                X-Axis: Time (Frames) | Y-Axis: MFCC Coefficients (1-13) (Low to High)
            </p>
        </div>
    );
};

export default VisualAnalysis;
