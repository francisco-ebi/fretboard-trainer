import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import DeviceSelector from '@/features/DeviceSelector';
import { INTERVAL_TRACKING_STORAGE_KEY } from '@/features/PredictionControls/interval-tracking';
import './ui.css';

export interface ListeningOptions {
    trackIntervals: boolean;
}

interface ListeningModeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (deviceId: string | null, options: ListeningOptions) => void;
}

// WASM support cannot change at runtime — detect once at module load
const isWasmSupported = (() => {
    try {
        if (typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function") {
            const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
            if (module instanceof WebAssembly.Module)
                return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
        }
    } catch {
        // not supported
    }
    return false;
})();

// Pre-listen dialog: pick the input device and start. Analysis runs on the
// essentia (WebAssembly) pipeline, so listening requires WASM support.
const ListeningModeModal: React.FC<ListeningModeModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const { t } = useTranslation();
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [trackIntervals, setTrackIntervals] = useState(
        () => localStorage.getItem(INTERVAL_TRACKING_STORAGE_KEY) === 'true'
    );

    const handleTrackIntervalsChange = (checked: boolean) => {
        setTrackIntervals(checked);
        localStorage.setItem(INTERVAL_TRACKING_STORAGE_KEY, String(checked));
    };

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

                <DeviceSelector onDeviceSelected={setSelectedDeviceId} />

                <label className="listening-modal-toggle">
                    <input
                        type="checkbox"
                        checked={trackIntervals}
                        onChange={e => handleTrackIntervalsChange(e.target.checked)}
                    />
                    <span className="listening-modal-toggle-text">
                        <strong>{t('listeningModal.trackIntervals.label')}</strong>
                        <span>{t('listeningModal.trackIntervals.desc')}</span>
                    </span>
                </label>

                <div className="listening-mode-options">
                    <div
                        className={`mode-card precision ${!isWasmSupported ? 'disabled' : ''}`}
                        onClick={() => isWasmSupported && onConfirm(selectedDeviceId, { trackIntervals })}
                    >
                        <div className="mode-icon">🎯</div>
                        <div className="mode-info">
                            <h3>{t('listeningModal.start.title')}</h3>
                            <p>{t('listeningModal.start.desc')}</p>
                            {!isWasmSupported && <div className="wasm-warning">{t('listeningModal.start.warning')}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ListeningModeModal;
