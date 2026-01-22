import React from 'react';
import { CHROMATIC_SCALE, type Note } from '../utils/musicTheory';
import './Controls.css';

interface ControlsProps {
    selectedRoot: Note;
    onRootChange: (root: Note) => void;
}

const Controls: React.FC<ControlsProps> = ({ selectedRoot, onRootChange }) => {
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
                            {note} Major
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default Controls;
