import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        const mediaQuery = window.matchMedia(query);
        setMatches(mediaQuery.matches);

        const handleChange = (e: MediaQueryListEvent) => setMatches(e.matches);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [query]);

    return matches;
}

// Same breakpoint as the CSS media queries across the app
export const MOBILE_BREAKPOINT_QUERY = '(max-width: 600px)';

export function useIsMobile(): boolean {
    return useMediaQuery(MOBILE_BREAKPOINT_QUERY);
}
