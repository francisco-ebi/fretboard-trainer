import React from 'react';
import { useTranslation } from 'react-i18next';
import './HelpSection.css';
import NoteMarker from './NoteMarker';

const HelpSection: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div className="help-section">
            <details>
                <summary>{t('help.summary')}</summary>
                <div className="help-content">
                    <div className="help-example">
                        <h4>{t('help.example')}</h4>
                        <div className="example-marker-container">
                            <NoteMarker
                                note="C"
                                isRoot={false}
                                namingSystem="ENGLISH"
                                interval="3M"
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
                            <span className="color-dot interval"></span>
                            <span className="legend-desc">{t('help.intervalColor')}</span>
                        </div>
                    </div>
                </div>
            </details>
        </div>
    );
};

export default HelpSection;
