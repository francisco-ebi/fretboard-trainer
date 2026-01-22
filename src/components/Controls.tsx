import React from 'react';
import { useTranslation } from 'react-i18next';
import { CHROMATIC_SCALE, SCALES, INSTRUMENT_CONFIGS, type Note, type ScaleType, type NamingSystem, type Instrument } from '../utils/musicTheory';
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
}

const Controls: React.FC<ControlsProps> = ({
    selectedRoot,
    onRootChange,
    selectedScale,
    onScaleChange,
    namingSystem,
    onNamingSystemChange,
    instrument,
    onInstrumentChange
}) => {
    const { t } = useTranslation();

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
        </div>
    );
};

export default Controls;
