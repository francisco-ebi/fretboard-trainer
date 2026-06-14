import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Orientation = 'HORIZONTAL' | 'VERTICAL';

interface OrientationContextType {
    orientation: Orientation;
    setOrientation: (orientation: Orientation) => void;
}

const OrientationContext = createContext<OrientationContextType | undefined>(undefined);

export const OrientationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Auto-detect orientation on start
    const [orientation, setOrientation] = useState<Orientation>(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia('(orientation: portrait)').matches ? 'VERTICAL' : 'HORIZONTAL';
        }
        return 'HORIZONTAL';
    });

    useEffect(() => {
        const handleOrientationChange = (e: MediaQueryListEvent) => {
            setOrientation(e.matches ? 'VERTICAL' : 'HORIZONTAL');
        };

        const mediaQuery = window.matchMedia('(orientation: portrait)');

        // Ensure state is correct on mount
        if (mediaQuery.matches && orientation !== 'VERTICAL') {
            setOrientation('VERTICAL');
        } else if (!mediaQuery.matches && orientation !== 'HORIZONTAL') {
            setOrientation('HORIZONTAL');
        }

        mediaQuery.addEventListener('change', handleOrientationChange);

        return () => {
            mediaQuery.removeEventListener('change', handleOrientationChange);
        };
    }, [orientation]);

    return (
        <OrientationContext.Provider value={{ orientation, setOrientation }}>
            {children}
        </OrientationContext.Provider>
    );
};

export const useOrientation = (): OrientationContextType => {
    const context = useContext(OrientationContext);
    if (context === undefined) {
        throw new Error('useOrientation must be used within an OrientationProvider');
    }
    return context;
};
