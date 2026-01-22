import React from 'react';
import { CHROMATIC_SCALE, SCALES, type Note, type ScaleType } from '../utils/musicTheory';
import './Controls.css';

interface ControlsProps {
    selectedRoot: Note;
    onRootChange: (root: Note) => void;
    selectedScale: ScaleType;
    onScaleChange: (scale: ScaleType) => void;
}

const Controls: React.FC<ControlsProps> = ({ selectedRoot, onRootChange, selectedScale, onScaleChange }) => {
    return (
        <div className="controls">
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
        </div>
    );
};

export default Controls;
