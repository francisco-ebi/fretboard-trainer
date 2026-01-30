import { useState } from 'react';
import Fretboard, { type Orientation } from '@/components/Fretboard';
import Controls from '@/components/Controls';
import HelpSection from '@/components/HelpSection';
import { getScale, type Note, type ScaleType, type NamingSystem, type Instrument } from '@/utils/musicTheory';

interface ScaleModeProps {
    orientation: Orientation;
}

const ScaleMode: React.FC<ScaleModeProps> = ({ orientation }) => {
    const [selectedRoot, setSelectedRoot] = useState<Note>('C');
    const [selectedScale, setSelectedScale] = useState<ScaleType>('MAJOR');
    const [namingSystem, setNamingSystem] = useState<NamingSystem>('ENGLISH');
    const [instrument, setInstrument] = useState<Instrument>('GUITAR');
    const [stringCount, setStringCount] = useState<number>(6);
    const [tuningOffsets, setTuningOffsets] = useState<number[]>([]);

    const handleInstrumentChange = (newInstrument: Instrument) => {
        setInstrument(newInstrument);
        if (newInstrument === 'BASS') {
            setStringCount(4);
        } else {
            setStringCount(6);
        }
        setTuningOffsets([]); // Reset to standard tuning when changing instrument
    };

    const scaleNotes = getScale(selectedRoot, selectedScale);

    return (
        <div className="scale-mode">
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

            <HelpSection />

            <div className="fretboard-wrapper">
                <Fretboard
                    selectedRoot={selectedRoot}
                    scaleNotes={scaleNotes}
                    namingSystem={namingSystem}
                    instrument={instrument}
                    tuningOffsets={tuningOffsets}
                    orientation={orientation}
                    stringCount={stringCount}
                />
            </div>
        </div>
    );
};

export default ScaleMode;
