import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { type NamingSystem } from '@/utils/musicTheory';

interface NamingContextType {
    namingSystem: NamingSystem;
    setNamingSystem: (system: NamingSystem) => void;
}

const NamingContext = createContext<NamingContextType | undefined>(undefined);

export const NamingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [namingSystem, setNamingSystemState] = useState<NamingSystem>(() => {
        return (localStorage.getItem('fretboard-naming') as NamingSystem) || 'ENGLISH';
    });

    const setNamingSystem = (system: NamingSystem) => {
        setNamingSystemState(system);
        localStorage.setItem('fretboard-naming', system);
    };

    return (
        <NamingContext.Provider value={{ namingSystem, setNamingSystem }}>
            {children}
        </NamingContext.Provider>
    );
};

export const useNaming = () => {
    const context = useContext(NamingContext);
    if (!context) {
        throw new Error('useNaming must be used within a NamingProvider');
    }
    return context;
};
