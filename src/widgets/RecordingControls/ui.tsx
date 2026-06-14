import { audioRecordingEngine, type DatasetEntry } from '@/shared/lib/audio/recording-engine';
import { useEffect, useState } from 'react';
import DeviceSelector from '@/features/DeviceSelector';

const RecordingControls = () => {
    const [activeRecording, setActiveRecording] = useState<number | null>(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

    useEffect(() => {
        audioRecordingEngine.onDataCaptured = (nota, total) => {
            console.log(`Nota: ${nota} | Total muestras: ${total}`);
        };
    }, []);

    const handleStartRecording = (index: number) => {
        setActiveRecording(index);
        audioRecordingEngine.startRecording(index);
    };

    const handleStopRecording = () => {
        setActiveRecording(null);
        audioRecordingEngine.stopRecording();
    };
    const handleTrainModel = async () => {
        const { trainModel } = await import('@/shared/lib/audio/model');
        trainModel();
    };
    const handleStats = async () => {
        const { calculateStatistics } = await import('@/shared/lib/audio/dataset-preparation');
        const dataset = await import('@/shared/lib/audio/datasets/essentia-acoustic-ts/guitar_dataset.json')
        const stats = calculateStatistics(dataset.default as DatasetEntry[]);
        const blob = new Blob([JSON.stringify(stats, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'guitar_dataset_stats_1777920241509.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <DeviceSelector onDeviceSelected={setSelectedDeviceId} />
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="mode-btn" onClick={() => audioRecordingEngine.init(selectedDeviceId)}>Init</button>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                    <button
                        key={index}
                        className={`mode-btn ${activeRecording === index ? 'active' : ''}`}
                        onClick={() => handleStartRecording(index)}
                    >
                        Start {index}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="mode-btn" onClick={handleStopRecording}>Stop</button>
                <button className="mode-btn" onClick={handleStats}>Generate stats</button>
                <button className="mode-btn" onClick={() => audioRecordingEngine.downloadDataset()}>Download</button>
                <button className="mode-btn" onClick={handleTrainModel}>Train</button>
            </div>
        </div>
    );
};

export default RecordingControls;
