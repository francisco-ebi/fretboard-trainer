import React from 'react';
import './StatusDot.css';

interface StatusDotProps {
    /** any CSS colour; the dot inherits it via currentColor */
    tone?: string;
    /** the recording/listening pulse — red by convention, do not reuse for generic activity */
    pulsing?: boolean;
    className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({ tone = 'currentColor', pulsing = false, className = '' }) => (
    <span
        className={['ft-status-dot', pulsing ? 'is-pulsing' : '', className].filter(Boolean).join(' ')}
        style={{ color: tone }}
    />
);
