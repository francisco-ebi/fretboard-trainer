import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { CHROMATIC_SCALE, SCALES, INSTRUMENT_CONFIGS, GUITAR_TUNINGS, GUITAR_TUNINGS_7, GUITAR_TUNINGS_8, type Note, type ScaleType, type NamingSystem, type Instrument, type Tuning } from '../utils/musicTheory';
import './Controls.css';

interface ControlsProps {
    selectedRoot: Note;
    onRootChange: (root: Note) => void;
    selectedScale: ScaleType;
    onScaleChange: (scale: ScaleType) => void;
    namingSystem: NamingSystem;
    onNamingSystemChange: (system: NamingSystem) => void;
    instrument: Instrument;
    onInstrumentChange: (instrument: Instrument) => void;
    tuningOffsets: number[];
    onTuningChange: (offsets: number[]) => void;
    stringCount: number;
    onStringCountChange: (count: number) => void;
}

const Controls: React.FC<ControlsProps> = ({
    selectedRoot,
    onRootChange,
    selectedScale,
    onScaleChange,
    namingSystem,
    onNamingSystemChange,
    instrument,
    onInstrumentChange,
    tuningOffsets,
    onTuningChange,
    stringCount,
    onStringCountChange
}) => {
    const { t } = useTranslation();
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    const getAvailableTunings = (): Record<string, Tuning> => {
        if (instrument === 'GUITAR') {
            if (stringCount === 7) return GUITAR_TUNINGS_7;
            if (stringCount === 8) return GUITAR_TUNINGS_8;
            return GUITAR_TUNINGS;
        }
        return {}; // No custom tunings for Bass implemented here yet
    };

    const availableTunings = getAvailableTunings();

    const getCurrentTuningKey = () => {
        if (tuningOffsets.length === 0) return 'STANDARD'; // Default assume standard if empty

        for (const [key, tuning] of Object.entries(availableTunings)) {
            // Simple array comparison
            if (tuning.offsets.length === tuningOffsets.length &&
                tuning.offsets.every((val, index) => val === tuningOffsets[index])) {
                return key;
            }
        }
        return 'CUSTOM'; // Fallback if no match
    };

    const handleTuningChange = (key: string) => {
        const tuning = availableTunings[key];
        if (tuning) {
            onTuningChange(tuning.offsets);
        }
    };

    const handleStringCountChange = (count: number) => {
        onStringCountChange(count);
        onTuningChange([]); // Reset tuning when changing string count
    };

    return (
        <div className="controls">
            {/* 1. Context: Instrument (Top) */}
            <div className="control-group instrument-group">
                <label htmlFor="instrument-select">{t('controls.instrument')}:</label>
                <select
                    id="instrument-select"
                    value={instrument}
                    onChange={(e) => onInstrumentChange(e.target.value as Instrument)}
                >
                    {(Object.keys(INSTRUMENT_CONFIGS) as Instrument[]).map((inst) => (
                        <option key={inst} value={inst}>
                            {t(`instruments.${inst}`)}
                        </option>
                    ))}
                </select>
            </div>

            {/* 2. Primary Actions: Key & Scale (Grouped) */}
            <div className="primary-controls-group">
                <div className="control-group">
                    <label htmlFor="root-select">{t('controls.key')}:</label>
                    <select
                        id="root-select"
                        value={selectedRoot}
                        onChange={(e) => onRootChange(e.target.value as Note)}
                    >
                        {CHROMATIC_SCALE.map((note) => (
                            <option key={note} value={note}>
                                {note}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="control-group">
                    <label htmlFor="scale-select">{t('controls.scale')}:</label>
                    <select
                        id="scale-select"
                        value={selectedScale}
                        onChange={(e) => onScaleChange(e.target.value as ScaleType)}
                    >
                        {(Object.keys(SCALES) as ScaleType[]).map((scale) => (
                            <option key={scale} value={scale}>
                                {scale.replace('_', ' ')}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 3. Setup & Preferences (Collapsed) */}
            <div className={`advanced-section ${isAdvancedOpen ? 'open' : ''}`}>
                <button
                    className="advanced-toggle"
                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                >
                    <motion.span
                        aria-hidden="true"
                        animate={{ rotate: isAdvancedOpen ? 90 : 0 }}
                        style={{ display: 'inline-block', marginRight: '8px' }}
                    >
                        ▶
                    </motion.span>
                    {t('controls.setup') || 'Setup & Preferences'}
                </button>

                <AnimatePresence>
                    {isAdvancedOpen && (
                        <motion.div
                            className="advanced-controls"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
                            style={{ overflow: 'hidden', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}
                        >
                            {/* Preference: Naming System */}
                            <div className="control-group secondary-group">
                                <label htmlFor="naming-select">{t('controls.noteNames')}:</label>
                                <select
                                    id="naming-select"
                                    value={namingSystem}
                                    onChange={(e) => onNamingSystemChange(e.target.value as NamingSystem)}
                                >
                                    <option value="ENGLISH">{t('naming.ENGLISH')}</option>
                                    <option value="SOLFEGE">{t('naming.SOLFEGE')}</option>
                                </select>
                            </div>

                            {instrument === 'GUITAR' && (
                                <>
                                    <div className="control-group">
                                        <label htmlFor="string-count-select">Strings:</label>
                                        <select
                                            id="string-count-select"
                                            value={stringCount}
                                            onChange={(e) => handleStringCountChange(parseInt(e.target.value))}
                                        >
                                            <option value={6}>6 Strings</option>
                                            <option value={7}>7 Strings</option>
                                            <option value={8}>8 Strings</option>
                                        </select>
                                    </div>
                                    <div className="control-group">
                                        <label htmlFor="tuning-select">Tuning:</label>
                                        <select
                                            id="tuning-select"
                                            value={getCurrentTuningKey()}
                                            onChange={(e) => handleTuningChange(e.target.value)}
                                        >
                                            {Object.entries(availableTunings).map(([key, tuning]) => (
                                                <option key={key} value={key}>
                                                    {tuning.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Controls;
