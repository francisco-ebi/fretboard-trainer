import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CHROMATIC_SCALE, SCALES, INSTRUMENT_CONFIGS, GUITAR_TUNINGS, type Note, type ScaleType, type NamingSystem, type Instrument } from '../utils/musicTheory';
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
    onTuningChange
}) => {
    const { t } = useTranslation();
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    const getCurrentTuningKey = () => {
        if (tuningOffsets.length === 0) return 'STANDARD'; // Default assume standard if empty

        for (const [key, tuning] of Object.entries(GUITAR_TUNINGS)) {
            // Simple array comparison
            if (tuning.offsets.length === tuningOffsets.length &&
                tuning.offsets.every((val, index) => val === tuningOffsets[index])) {
                return key;
            }
        }
        return 'CUSTOM'; // Fallback if no match
    };

    const handleTuningChange = (key: string) => {
        const tuning = GUITAR_TUNINGS[key];
        if (tuning) {
            onTuningChange(tuning.offsets);
        }
    };

    return (
        <div className="controls">
            <div className="control-group">
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

            <div className="control-group">
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

            <div className={`advanced-section ${isAdvancedOpen ? 'open' : ''}`}>
                <button
                    className="advanced-toggle"
                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                >
                    {isAdvancedOpen ? '▼ ' : '▶ '}{t('controls.advanced') || 'Advanced'}
                </button>

                {isAdvancedOpen && (
                    <div className="advanced-controls">
                        {instrument === 'GUITAR' && (
                            <div className="control-group">
                                <label htmlFor="tuning-select">Tuning:</label>
                                <select
                                    id="tuning-select"
                                    value={getCurrentTuningKey()}
                                    onChange={(e) => handleTuningChange(e.target.value)}
                                >
                                    {Object.entries(GUITAR_TUNINGS).map(([key, tuning]) => (
                                        <option key={key} value={key}>
                                            {tuning.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {instrument !== 'GUITAR' && (
                            <p className="advanced-note">Advanced settings not available for this instrument.</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Controls;
