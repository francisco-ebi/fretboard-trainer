import { useState } from 'react';
import Fretboard from '@/components/Fretboard';
import Controls from '@/components/Controls';
import HelpSection from '@/components/HelpSection';
import { useInstrument } from '@/context/InstrumentContext';

import { getScale, type Note, type ScaleType, type NamingSystem, type Instrument } from '@/utils/musicTheory';
import { type PredictionResult } from '@/utils/audio/prediction-engine';

interface ScaleModeProps {
    prediction?: PredictionResult | null;
    isFullScreen?: boolean;
}

const ScaleMode: React.FC<ScaleModeProps> = ({ prediction, isFullScreen = false }) => {
    const [selectedRoot, setSelectedRootState] = useState<Note>(() => {
        return (localStorage.getItem('scalemode-root') as Note) || 'C';
    });
    const [selectedScale, setSelectedScaleState] = useState<ScaleType>(() => {
        return (localStorage.getItem('scalemode-scale') as ScaleType) || 'MAJOR';
    });
    const [namingSystem, setNamingSystemState] = useState<NamingSystem>(() => {
        return (localStorage.getItem('scalemode-naming') as NamingSystem) || 'ENGLISH';
    });

    const setSelectedRoot = (root: Note) => {
        setSelectedRootState(root);
        localStorage.setItem('scalemode-root', root);
    };

    const setSelectedScale = (scale: ScaleType) => {
        setSelectedScaleState(scale);
        localStorage.setItem('scalemode-scale', scale);
    };

    const setNamingSystem = (system: NamingSystem) => {
        setNamingSystemState(system);
        localStorage.setItem('scalemode-naming', system);
    };

    // Use Context
    const {
        instrument,
        setInstrument,
        stringCount,
        setStringCount,
        tuningOffsets,
        setTuningOffsets
    } = useInstrument();

    const handleInstrumentChange = (newInstrument: Instrument) => {
        setInstrument(newInstrument);
    };

    const scaleNotes = getScale(selectedRoot, selectedScale);

    return (
        <div className={`scale-mode ${isFullScreen ? 'fullscreen' : ''}`}>
            {!isFullScreen && (
                <Controls
                    selectedRoot={selectedRoot}
                    onRootChange={setSelectedRoot}
                    selectedScale={selectedScale}
                    onScaleChange={setSelectedScale}
                    namingSystem={namingSystem}
                    onNamingSystemChange={setNamingSystem}
                    instrument={instrument}
                    onInstrumentChange={handleInstrumentChange}
                    tuningOffsets={tuningOffsets}
                    onTuningChange={setTuningOffsets}
                    stringCount={stringCount}
                    onStringCountChange={setStringCount}
                />
            )}

            {!isFullScreen && <HelpSection />}

            <div className="fretboard-wrapper">
                <Fretboard
                    selectedRoot={selectedRoot}
                    scaleNotes={scaleNotes}
                    namingSystem={namingSystem}
                    instrument={instrument}
                    tuningOffsets={tuningOffsets}
                    stringCount={stringCount}
                    prediction={prediction}
                />
            </div>
        </div>
    );
};

export default ScaleMode;
