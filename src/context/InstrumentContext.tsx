import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { type Instrument } from '@/utils/musicTheory';

interface InstrumentContextType {
    instrument: Instrument;
    setInstrument: (instrument: Instrument) => void;
    stringCount: number;
    setStringCount: (count: number) => void;
    tuningOffsets: number[];
    setTuningOffsets: (offsets: number[]) => void;
}

const InstrumentContext = createContext<InstrumentContextType | undefined>(undefined);

export const InstrumentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [instrument, setInstrumentState] = useState<Instrument>(() => {
        return (localStorage.getItem('fretboard-instrument') as Instrument) || 'GUITAR';
    });
    const [stringCount, setStringCountState] = useState<number>(() => {
        const saved = localStorage.getItem('fretboard-stringCount');
        return saved ? parseInt(saved, 10) : 6;
    });
    const [tuningOffsets, setTuningOffsetsState] = useState<number[]>(() => {
        const saved = localStorage.getItem('fretboard-tuningOffsets');
        return saved ? JSON.parse(saved) : [];
    });

    const setStringCount = (count: number) => {
        setStringCountState(count);
        localStorage.setItem('fretboard-stringCount', count.toString());
    };

    const setTuningOffsets = (offsets: number[]) => {
        setTuningOffsetsState(offsets);
        localStorage.setItem('fretboard-tuningOffsets', JSON.stringify(offsets));
    };

    const setInstrument = (newInstrument: Instrument) => {
        setInstrumentState(newInstrument);
        localStorage.setItem('fretboard-instrument', newInstrument);

        // Default logic when switching instrument
        if (newInstrument === 'BASS') {
            setStringCount(4);
        } else {
            setStringCount(6);
        }
        setTuningOffsets([]); // Reset tuning
    };

    return (
        <InstrumentContext.Provider value={{
            instrument,
            setInstrument,
            stringCount,
            setStringCount,
            tuningOffsets,
            setTuningOffsets
        }}>
            {children}
        </InstrumentContext.Provider>
    );
};

export const useInstrument = () => {
    const context = useContext(InstrumentContext);
    if (!context) {
        throw new Error('useInstrument must be used within an InstrumentProvider');
    }
    return context;
};
