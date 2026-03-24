import React, { useEffect, useState } from 'react';
import { getNoteName, type Note, type NamingSystem } from '@/utils/musicTheory';
import './NoteMarker.css';

export interface NoteMarkerProps {
    note: Note;
    isRoot: boolean;
    namingSystem: NamingSystem;
    interval: string | null;
    isCharacteristic: boolean;
    shouldShake: boolean;
    octave: number;
    isInactiveOutline?: boolean;
    customInterval?: string | null;
    onClick?: () => void;
}

const NoteMarker: React.FC<NoteMarkerProps> = ({ note, isRoot, namingSystem, interval, isCharacteristic, shouldShake, octave, isInactiveOutline, customInterval, onClick }) => {
    const [shaking, setShaking] = useState(false);

    useEffect(() => {
        if (shouldShake && !isInactiveOutline) {
            setShaking(true);
            const timer = setTimeout(() => setShaking(false), 400);
            return () => clearTimeout(timer);
        }
    }, [shouldShake, isInactiveOutline]);

    // Determine class based on interval (3rd, 5th, 7th)
    let intervalClass = '';
    const displayInterval = customInterval || interval;
    if (displayInterval) {
        if (displayInterval.includes('3') || displayInterval === '10') intervalClass = 'interval-3';
        else if (displayInterval.includes('5') || displayInterval === '12') intervalClass = 'interval-5';
        else if (displayInterval.includes('7') || displayInterval === '14') intervalClass = 'interval-7';
        else if (displayInterval.includes('9')) intervalClass = 'interval-9'; // 2/9 share color
        else if (displayInterval.includes('11')) intervalClass = 'interval-11'; // 4/11 share color
        else if (displayInterval.includes('13')) intervalClass = 'interval-13'; // 6/13 share color
    }
    // mapped to basic interval colors for extensions
    if (interval) {
        if (interval.includes('2')) intervalClass = 'interval-9';
        if (interval.includes('4')) intervalClass = 'interval-11';
        if (interval.includes('6')) intervalClass = 'interval-13';
    }

    // Octave scaling for CSS
    // The lowest guitar octave is typically 2 (E2 is ~82Hz).
    // We bind a normalized octave ratio (0 at oct 2, increasing upwards)
    const normalizedOctave = Math.max(0, octave - 2);

    return (
        <div 
            className={`note-marker ${intervalClass} ${isRoot ? 'root-note' : ''} ${isCharacteristic ? 'characteristic-note' : ''} ${shaking ? 'shake' : ''} ${isInactiveOutline ? 'outline-only' : ''} ${onClick ? 'clickable' : ''}`}
            style={{ '--octave': normalizedOctave } as React.CSSProperties}
            onClick={(e) => {
                if (onClick) {
                    e.stopPropagation();
                    onClick();
                }
            }}
        >
            <span className="note-name">{getNoteName(note, namingSystem)}<sub className="note-octave">{octave}</sub></span>
            <hr className="note-separator" />
            <span className="note-interval">{displayInterval}</span>
        </div>
    );
};

export default NoteMarker;
