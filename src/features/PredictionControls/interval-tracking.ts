import { BehaviorSubject } from 'rxjs';

// Whether listening should annotate the interval between the last two played
// notes. Written by PredictionControls when a session starts/stops, read by
// IntervalOverlay — a module-level subject rather than context because the
// overlay renders inside the Fretboard widget, far from the controls, and the
// engine it pairs with is already a module singleton.
export const intervalTrackingEnabled$ = new BehaviorSubject<boolean>(false);

// Persisted so the modal's checkbox pre-fills with the last choice
export const INTERVAL_TRACKING_STORAGE_KEY = 'fretboard-track-intervals';
