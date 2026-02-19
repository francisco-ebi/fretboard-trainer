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
}

const NoteMarker: React.FC<NoteMarkerProps> = ({ note, isRoot, namingSystem, interval, isCharacteristic, shouldShake, octave }) => {
    const [shaking, setShaking] = useState(false);

    useEffect(() => {
        if (shouldShake) {
            setShaking(true);
            const timer = setTimeout(() => setShaking(false), 400);
            return () => clearTimeout(timer);
        }
    }, [shouldShake]);

    // Determine class based on interval (3rd, 5th, 7th)
    let intervalClass = '';
    if (interval) {
        if (interval.includes('3')) intervalClass = 'interval-3';
        else if (interval.includes('5')) intervalClass = 'interval-5';
        else if (interval.includes('7')) intervalClass = 'interval-7';
    }

    return (
        <div className={`note-marker ${intervalClass} ${isRoot ? 'root-note' : ''} ${isCharacteristic ? 'characteristic-note' : ''} ${shaking ? 'shake' : ''}`}>
            <span className="note-name">{getNoteName(note, namingSystem)}<sub className="note-octave">{octave}</sub></span>
            <hr className="note-separator" />
            <span className="note-interval">{interval}</span>
        </div>
    );
};

export default NoteMarker;
