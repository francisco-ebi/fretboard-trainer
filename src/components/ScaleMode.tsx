import { useState } from 'react';
import Fretboard from '@/components/Fretboard';
import Controls from '@/components/Controls';
import HelpSection from '@/components/HelpSection';
import { useInstrument } from '@/context/InstrumentContext';

import { getScale, CHARACTERISTIC_INTERVALS, type Note, type ScaleType, type Instrument } from '@/utils/musicTheory';
import { useNaming } from '@/context/NamingContext';

interface ScaleModeProps {
    isFullScreen?: boolean;
}

const ScaleMode: React.FC<ScaleModeProps> = ({ isFullScreen = false }) => {
    const { namingSystem } = useNaming();
    const [selectedRoot, setSelectedRootState] = useState<Note>(() => {
        return (localStorage.getItem('scalemode-root') as Note) || 'C';
    });
    const [selectedScale, setSelectedScaleState] = useState<ScaleType>(() => {
        return (localStorage.getItem('scalemode-scale') as ScaleType) || 'MAJOR';
    });

    const setSelectedRoot = (root: Note) => {
        setSelectedRootState(root);
        localStorage.setItem('scalemode-root', root);
    };

    const setSelectedScale = (scale: ScaleType) => {
        setSelectedScaleState(scale);
        localStorage.setItem('scalemode-scale', scale);
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
    const characteristicInterval = CHARACTERISTIC_INTERVALS[selectedScale];

    return (
        <div className={`scale-mode ${isFullScreen ? 'fullscreen' : ''}`}>
            {!isFullScreen && (
                <Controls
                    selectedRoot={selectedRoot}
                    onRootChange={setSelectedRoot}
                    selectedScale={selectedScale}
                    onScaleChange={setSelectedScale}
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
                    characteristicInterval={characteristicInterval}
                    instrument={instrument}
                    tuningOffsets={tuningOffsets}
                    stringCount={stringCount}
                    namingSystem={namingSystem}
                />
            </div>
        </div>
    );
};

export default ScaleMode;
