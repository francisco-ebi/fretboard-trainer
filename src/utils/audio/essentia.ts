export function getMinFreqByString(stringIndex: number) {
    switch (stringIndex) {
        case 1: // String 1 (E4) ~ 329.6 Hz
            // Filters below 260Hz. 
            // This following resonances:
            // - String 2 (246Hz)
            // - String 3 (196Hz)
            // - Harmonics of String 6 (164Hz, 82Hz)
            return 260;

        case 2: // String 2 (B3) ~ 246.9 Hz
            // Filters below 200Hz.
            // Eliminates G3 (196Hz) and D3 (146Hz)
            return 200;

        case 3: // String 3 (G3) ~ 196.0 Hz
            // Filters below 150Hz.
            return 150;

        case 4: // String 4 (D3) ~ 146.8 Hz
            // Filters below 115Hz.
            return 115;

        case 5: // String 5 (A2) ~ 110.0 Hz
            // Filters below 85Hz.
            return 85;

        case 6: // String 6 (E2) ~ 82.4 Hz
            // 60Hz is safe to eliminate electrical network noise (50/60Hz hum)
            // and knocks on the guitar body.
            return 60;

        default:
            return 0; // Sin filtro por defecto
    }
}