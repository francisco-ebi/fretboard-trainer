import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { INSTRUMENT_CONFIGS, GUITAR_TUNINGS, GUITAR_TUNINGS_7, GUITAR_TUNINGS_8, type Note, type Instrument, type Tuning, type NamingSystem } from '@/shared/lib/music/musicTheory';
import { useInstrument } from '@/app/providers';
import { useNaming } from '@/app/providers';
import CircleOfFifths from '@/features/CircleOfFifths';
import { FieldLabel } from '@/shared/ui';
import './ui.css';

// Shared control panel for every mode page: key selector, instrument,
// and the Setup & Preferences section (naming, theme, strings, tuning).
// Instrument state comes from InstrumentProvider directly; pages only own
// their root note (and pass mode-specific selectors like scale as children).
interface ControlsProps {
    selectedRoot: Note;
    onRootChange: (root: Note) => void;
    children?: React.ReactNode;
}

const Controls: React.FC<ControlsProps> = ({
    selectedRoot,
    onRootChange,
    children
}) => {
    const { t } = useTranslation();
    const {
        instrument,
        setInstrument,
        stringCount,
        setStringCount,
        tuningOffsets,
        setTuningOffsets,
        colorScheme,
        setColorScheme
    } = useInstrument();
    const { namingSystem, setNamingSystem } = useNaming();
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    const getAvailableTunings = (): Record<string, Tuning> => {
        if (instrument === 'GUITAR') {
            if (stringCount === 7) return GUITAR_TUNINGS_7;
            if (stringCount === 8) return GUITAR_TUNINGS_8;
            return GUITAR_TUNINGS;
        }
        return {}; // No custom tunings for Bass implemented here yet
    };

    const availableTunings = getAvailableTunings();

    const getCurrentTuningKey = () => {
        if (tuningOffsets.length === 0) return 'STANDARD'; // Default assume standard if empty

        for (const [key, tuning] of Object.entries(availableTunings)) {
            // Simple array comparison
            if (tuning.offsets.length === tuningOffsets.length &&
                tuning.offsets.every((val, index) => val === tuningOffsets[index])) {
                return key;
            }
        }
        return 'CUSTOM'; // Fallback if no match
    };

    const handleTuningChange = (key: string) => {
        const tuning = availableTunings[key];
        if (tuning) {
            setTuningOffsets(tuning.offsets);
        }
    };

    const handleStringCountChange = (count: number) => {
        setStringCount(count);
        setTuningOffsets([]); // Reset tuning when changing string count
    };

    return (
        <div className="controls">
            {/* 1. Context: Instrument (Top) */}
            <div className="control-group instrument-group">
                <FieldLabel variant="eyebrow" htmlFor="instrument-select">{t('controls.instrument')}:</FieldLabel>
                <select
                    id="instrument-select"
                    value={instrument}
                    onChange={(e) => setInstrument(e.target.value as Instrument)}
                >
                    {(Object.keys(INSTRUMENT_CONFIGS) as Instrument[]).map((inst) => (
                        <option key={inst} value={inst}>
                            {t(`instruments.${inst}`)}
                        </option>
                    ))}
                </select>
            </div>

            {/* 2. Primary Actions: Key + page-specific selectors (Grouped) */}
            <div className="primary-controls-group">
                <div className="control-group">
                    <CircleOfFifths selectedRoot={selectedRoot} onRootChange={onRootChange} />
                </div>

                {children}
            </div>

            {/* 3. Setup & Preferences (Collapsed) */}
            <div className={`advanced-section ${isAdvancedOpen ? 'open' : ''}`}>
                <button
                    className="advanced-toggle"
                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                >
                    <motion.span
                        aria-hidden="true"
                        animate={{ rotate: isAdvancedOpen ? 90 : 0 }}
                        style={{ display: 'inline-block', marginRight: '8px' }}
                    >
                        ▶
                    </motion.span>
                    {t('controls.setup') || 'Setup & Preferences'}
                </button>

                <AnimatePresence>
                    {isAdvancedOpen && (
                        <motion.div
                            className="advanced-controls"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
                            style={{ overflow: 'hidden', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}
                        >
                            {/* Preference: Naming System */}
                            <div className="control-group secondary-group">
                                <FieldLabel htmlFor="naming-select">{t('controls.noteNames')}:</FieldLabel>
                                <select
                                    id="naming-select"
                                    value={namingSystem}
                                    onChange={(e) => setNamingSystem(e.target.value as NamingSystem)}
                                >
                                    <option value="ENGLISH">{t('naming.ENGLISH')}</option>
                                    <option value="SOLFEGE">{t('naming.SOLFEGE')}</option>
                                </select>
                            </div>

                            {/* Preference: Color Scheme */}
                            <div className="control-group secondary-group">
                                <FieldLabel htmlFor="theme-select">{t('controls.colorScheme')}:</FieldLabel>
                                <select
                                    id="theme-select"
                                    value={colorScheme}
                                    onChange={(e) => setColorScheme(e.target.value as any)}
                                >
                                    <option value="OKLCH">{t('controls.themeOklch')}</option>
                                    <option value="LEGACY">{t('controls.themeLegacy')}</option>
                                </select>
                            </div>

                            {instrument === 'GUITAR' && (
                                <>
                                    <div className="control-group">
                                        <FieldLabel htmlFor="string-count-select">{t('controls.strings')}:</FieldLabel>
                                        <select
                                            id="string-count-select"
                                            value={stringCount}
                                            onChange={(e) => handleStringCountChange(parseInt(e.target.value))}
                                        >
                                            <option value={6}>{t('controls.stringCountVal', { count: 6 })}</option>
                                            <option value={7}>{t('controls.stringCountVal', { count: 7 })}</option>
                                            <option value={8}>{t('controls.stringCountVal', { count: 8 })}</option>
                                        </select>
                                    </div>
                                    <div className="control-group">
                                        <FieldLabel htmlFor="tuning-select">{t('controls.tuning')}:</FieldLabel>
                                        <select
                                            id="tuning-select"
                                            value={getCurrentTuningKey()}
                                            onChange={(e) => handleTuningChange(e.target.value)}
                                        >
                                            {Object.entries(availableTunings).map(([key, tuning]) => (
                                                <option key={key} value={key}>
                                                    {tuning.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Controls;
