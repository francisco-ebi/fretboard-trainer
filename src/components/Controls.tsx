import React from 'react';
import { CHROMATIC_SCALE, SCALES, INSTRUMENT_CONFIGS, type Note, type ScaleType, type NamingSystem, type Instrument } from '../utils/musicTheory';
import { type Orientation } from './Fretboard';
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
    orientation: Orientation;
    onOrientationChange: (orientation: Orientation) => void;
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
    orientation,
    onOrientationChange
}) => {
    return (
        <div className="controls">
            <div className="control-group">
                <label htmlFor="orientation-select">Orientation:</label>
                <select
                    id="orientation-select"
                    value={orientation}
                    onChange={(e) => onOrientationChange(e.target.value as Orientation)}
                >
                    <option value="HORIZONTAL">Horizontal</option>
                    <option value="VERTICAL">Vertical</option>
                </select>
            </div>

            <div className="control-group">
                <label htmlFor="instrument-select">Instrument:</label>
                <select
                    id="instrument-select"
                    value={instrument}
                    onChange={(e) => onInstrumentChange(e.target.value as Instrument)}
                >
                    {(Object.keys(INSTRUMENT_CONFIGS) as Instrument[]).map((inst) => (
                        <option key={inst} value={inst}>
                            {INSTRUMENT_CONFIGS[inst].name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="control-group">
                <label htmlFor="root-select">Key (Root Note):</label>
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
                <label htmlFor="scale-select">Scale Type:</label>
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
                <label htmlFor="naming-select">Note Names:</label>
                <select
                    id="naming-select"
                    value={namingSystem}
                    onChange={(e) => onNamingSystemChange(e.target.value as NamingSystem)}
                >
                    <option value="ENGLISH">English (C, D, E)</option>
                    <option value="SOLFEGE">Solfège (Do, Re, Mi)</option>
                </select>
            </div>
        </div>
    );
};

export default Controls;
