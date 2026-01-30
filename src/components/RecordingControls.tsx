import { audioRecordingEngine } from '@/utils/audio/recording-engine';
import { trainModel } from '@/utils/audio/model';
import { useEffect } from 'react';

const RecordingControls = () => {
    useEffect(() => {
        audioRecordingEngine.onDataCaptured = (nota, total) => {
            console.log(`Nota: ${nota} | Total muestras: ${total}`);
        };
    }, []);
    return (
        <div>
            <button onClick={() => audioRecordingEngine.init()}>Init</button>
            <button onClick={() => audioRecordingEngine.startRecording(0)}>Start Recording 0</button>
            <button onClick={() => audioRecordingEngine.startRecording(1)}>Start Recording 1</button>
            <button onClick={() => audioRecordingEngine.startRecording(2)}>Start Recording 2</button>
            <button onClick={() => audioRecordingEngine.startRecording(3)}>Start Recording 3</button>
            <button onClick={() => audioRecordingEngine.startRecording(4)}>Start Recording 4</button>
            <button onClick={() => audioRecordingEngine.startRecording(5)}>Start Recording 5</button>
            <button onClick={() => audioRecordingEngine.stopRecording()}>Stop Recording</button>
            <button onClick={() => audioRecordingEngine.downloadDataset()}>Download Dataset</button>
            <button onClick={() => trainModel()}>Train Model</button>
        </div>
    );
};

export default RecordingControls;
