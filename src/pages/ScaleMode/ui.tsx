import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Fretboard from '@/widgets/Fretboard';
import Controls from '@/widgets/Controls';
import HelpSection from '@/widgets/HelpSection';
import BottomSheet from '@/widgets/BottomSheet';
import { useInstrument } from '@/app/providers';
import { useIsMobile } from '@/shared/lib/hooks/useMediaQuery';

import { getScale, getNoteName, CHARACTERISTIC_INTERVALS, type Note, type ScaleType, type Instrument } from '@/shared/lib/music/musicTheory';
import { useNaming } from '@/app/providers';
import './ui.css';

interface ScaleModeProps {
    isFullScreen?: boolean;
}

const ScaleMode: React.FC<ScaleModeProps> = ({ isFullScreen = false }) => {
    const { t } = useTranslation();
    const { namingSystem } = useNaming();
    const isMobile = useIsMobile();
    const [isSheetOpen, setIsSheetOpen] = useState(false);
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
    const scaleSummary = `${getNoteName(selectedRoot, namingSystem)} · ${t(`scales.${selectedScale}`)}`;

    const controls = (
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
    );

    const fretboard = (
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
    );

    // Mobile: fretboard-first layout with a sticky summary bar on top and all
    // controls inside a bottom sheet. Fullscreen keeps the bare fretboard.
    if (isMobile && !isFullScreen) {
        return (
            <div className="scale-mode mobile-stage">
                <button
                    className="scale-summary-bar"
                    onClick={() => setIsSheetOpen(true)}
                    aria-label={t('controls.editSettings')}
                >
                    <span className="scale-summary-text">{scaleSummary}</span>
                    <span className="scale-summary-edit" aria-hidden="true">✎</span>
                </button>

                {fretboard}

                <BottomSheet
                    title={scaleSummary}
                    open={isSheetOpen}
                    onOpenChange={setIsSheetOpen}
                >
                    {controls}
                    <HelpSection />
                </BottomSheet>
            </div>
        );
    }

    return (
        <div className={`scale-mode ${isFullScreen ? 'fullscreen' : ''}`}>
            {!isFullScreen && controls}

            {!isFullScreen && <HelpSection />}

            {fretboard}
        </div>
    );
};

export default ScaleMode;
