import React from 'react';
import { useTranslation } from 'react-i18next';
import { type Orientation, useOrientation } from '@/context/OrientationContext';
import './TopBar.css';

interface TopBarProps {
    onToggleFullScreen?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onToggleFullScreen }) => {
    const { t, i18n } = useTranslation();
    const { orientation, setOrientation } = useOrientation();

    return (
        <div className="top-bar">
            <div className="top-bar-item">
                <label htmlFor="top-language-select" className="sr-only">{t('language')}</label>
                <select
                    id="top-language-select"
                    value={i18n.resolvedLanguage}
                    onChange={(e) => i18n.changeLanguage(e.target.value)}
                    className="top-bar-select"
                >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                </select>
            </div>

            <div className="top-bar-divider"></div>

            <div className="top-bar-item">
                <label htmlFor="top-orientation-select" className="sr-only">{t('controls.orientation')}</label>
                <select
                    id="top-orientation-select"
                    value={orientation}
                    onChange={(e) => setOrientation(e.target.value as Orientation)}
                    className="top-bar-select"
                >
                    <option value="HORIZONTAL">{t('orientations.HORIZONTAL')}</option>
                    <option value="VERTICAL">{t('orientations.VERTICAL')}</option>
                </select>
            </div>

            <div className="top-bar-divider"></div>

            <div className="top-bar-item">
                <button
                    className="top-bar-icon-btn"
                    onClick={onToggleFullScreen}
                    title="Full Screen Mode"
                >
                    ⛶
                </button>
            </div>
        </div>
    );
};

export default TopBar;
