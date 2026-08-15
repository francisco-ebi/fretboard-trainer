import React from 'react';
import './Tag.css';

interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** neutral, accent (brand blue/violet), info (precision/desktop), warning (performance/mobile), brass (machine-detected) */
    tone?: 'neutral' | 'accent' | 'info' | 'warning' | 'brass';
}

// A tinted uppercase micro-label for classification, not for counts or status dots.
// Fill is always the tone at low opacity with the tone as text — never a solid fill.
export const Tag: React.FC<TagProps> = ({ tone = 'neutral', className = '', children, ...rest }) => (
    <span className={['ft-tag', `ft-tag--${tone}`, className].filter(Boolean).join(' ')} {...rest}>
        {children}
    </span>
);
