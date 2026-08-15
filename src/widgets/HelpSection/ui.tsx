import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import './ui.css';
import { NoteMarker } from '@/entities/note';
import { Disclosure } from '@/shared/ui';

const HelpSection: React.FC = () => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <motion.div
            className="help-section"
            animate={{ maxWidth: isOpen ? 600 : 250 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
        >
            <Disclosure className="help-card" summary={t('help.summary')} open={isOpen} onToggle={setIsOpen}>
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
            </Disclosure>
        </motion.div>
    );
};

export default HelpSection;
