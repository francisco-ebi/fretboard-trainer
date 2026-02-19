import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import './HelpSection.css';
import NoteMarker from '@/components/NoteMarker';

const HelpSection: React.FC = () => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <motion.div
            className="help-section"
            animate={{ maxWidth: isOpen ? 600 : 250 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
        >
            <div className="help-card">
                <div
                    className="help-header"
                    onClick={() => setIsOpen(!isOpen)}
                    role="button"
                    aria-expanded={isOpen}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setIsOpen(!isOpen);
                        }
                    }}
                >
                    {t('help.summary')}
                    <motion.span
                        className="arrow"
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        ▼
                    </motion.span>
                </div>
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            className="help-content-wrapper"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                        >
                            <div className="help-content">
                                <div className="help-example">
                                    <div className="example-marker-container">
                                        <NoteMarker
                                            note="C"
                                            isRoot={false}
                                            namingSystem="ENGLISH"
                                            interval="3"
                                            isCharacteristic={false}
                                            shouldShake={false}
                                            octave={3}
                                        />
                                    </div>
                                </div>
                                <div className="help-legend">
                                    <div className="legend-item">
                                        <span className="legend-label">{t('help.noteName')}:</span>
                                        <span className="legend-desc">{t('help.noteNameDesc')}</span>
                                    </div>
                                    <div className="legend-item">
                                        <span className="legend-label">{t('help.octave')}:</span>
                                        <span className="legend-desc">{t('help.octaveDesc')}</span>
                                    </div>
                                    <div className="legend-item">
                                        <span className="legend-label">{t('help.interval')}:</span>
                                        <span className="legend-desc">{t('help.intervalDesc')}</span>
                                    </div>
                                    <div className="legend-divider"></div>

                                    <div className="legend-item color-info">
                                        <span className="color-dot root"></span>
                                        <span className="legend-desc">{t('help.rootColor')}</span>
                                    </div>
                                    <div className="legend-item color-info">
                                        <span className="color-dot interval-3"></span>
                                        <span className="legend-desc">{t('help.thirdColor')}</span>
                                    </div>
                                    <div className="legend-item color-info">
                                        <span className="color-dot interval-5"></span>
                                        <span className="legend-desc">{t('help.fifthColor')}</span>
                                    </div>
                                    <div className="legend-item color-info">
                                        <span className="color-dot interval-7"></span>
                                        <span className="legend-desc">{t('help.seventhColor')}</span>
                                    </div>
                                    <div className="legend-item color-info">
                                        <span className="color-dot other"></span>
                                        <span className="legend-desc">{t('help.otherColor')}</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

export default HelpSection;
