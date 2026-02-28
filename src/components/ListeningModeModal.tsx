import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import './ListeningModeModal.css';

interface ListeningModeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (mode: 'performance' | 'precision') => void;
}

const ListeningModeModal: React.FC<ListeningModeModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const { t } = useTranslation();
    const [isWasmSupported, setIsWasmSupported] = useState(false);

    useEffect(() => {
        // Check for WebAssembly support
        const supported = (() => {
            try {
                if (typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function") {
                    const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
                    if (module instanceof WebAssembly.Module)
                        return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
                }
            } catch (e) {
            }
            return false;
        })();
        setIsWasmSupported(supported);
    }, []);

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="listening-modal-overlay" onClick={onClose}>
            <div className="listening-modal-content" onClick={e => e.stopPropagation()}>
                <div className="listening-modal-header">
                    <h2>{t('listeningModal.title')}</h2>
                    <button className="listening-modal-close" onClick={onClose}>×</button>
                </div>

                <p className="listening-modal-description">
                    {t('listeningModal.description')}
                </p>

                <div className="listening-mode-options">
                    {/* Performance Mode Card */}
                    <div
                        className="mode-card performance"
                        onClick={() => onConfirm('performance')}
                    >
                        <div className="mode-icon">⚡</div>
                        <div className="mode-info">
                            <h3>{t('listeningModal.performance.title')}</h3>
                            <span className="mode-tag mobile">{t('listeningModal.performance.tag')}</span>
                            <p dangerouslySetInnerHTML={{ __html: t('listeningModal.performance.desc') }} />
                        </div>
                    </div>

                    {/* Precision Mode Card */}
                    <div
                        className={`mode-card precision ${!isWasmSupported ? 'disabled' : ''}`}
                        onClick={() => isWasmSupported && onConfirm('precision')}
                    >
                        <div className="mode-icon">🎯</div>
                        <div className="mode-info">
                            <h3>{t('listeningModal.precision.title')}</h3>
                            <span className="mode-tag desktop">{t('listeningModal.precision.tag')}</span>
                            <p dangerouslySetInnerHTML={{ __html: t('listeningModal.precision.desc') }} />
                            {!isWasmSupported && <div className="wasm-warning">{t('listeningModal.precision.warning')}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ListeningModeModal;
