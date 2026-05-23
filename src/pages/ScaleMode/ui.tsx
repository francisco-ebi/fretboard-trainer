import { useState } from 'react';
import Fretboard from '@/widgets/Fretboard';
import Controls from '@/widgets/Controls';
import HelpSection from '@/widgets/HelpSection';
import { useInstrument } from '@/app/providers';

import { getScale, CHARACTERISTIC_INTERVALS, type Note, type ScaleType, type Instrument } from '@/shared/lib/music/musicTheory';
import { useNaming } from '@/app/providers';

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
