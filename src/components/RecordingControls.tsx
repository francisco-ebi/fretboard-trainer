import { audioRecordingEngine } from '@/utils/audio/recording-engine';
import { trainModel } from '@/utils/audio/model';
import { useEffect, useState } from 'react';

const RecordingControls = () => {
    const [activeRecording, setActiveRecording] = useState<number | null>(null);

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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="mode-btn" onClick={() => audioRecordingEngine.init()}>Init</button>
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
                <button className="mode-btn" onClick={() => audioRecordingEngine.downloadDataset()}>Download</button>
                <button className="mode-btn" onClick={() => trainModel()}>Train</button>
            </div>
        </div>
    );
};

export default RecordingControls;
