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
    const [instrument, setInstrumentState] = useState<Instrument>('GUITAR');
    const [stringCount, setStringCount] = useState<number>(6);
    const [tuningOffsets, setTuningOffsets] = useState<number[]>([]);

    const setInstrument = (newInstrument: Instrument) => {
        setInstrumentState(newInstrument);
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
