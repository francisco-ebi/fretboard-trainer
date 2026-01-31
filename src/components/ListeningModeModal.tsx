import React, { useEffect, useState } from 'react';
import './ListeningModeModal.css'; // We'll create this next

interface ListeningModeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (mode: 'performance' | 'precision') => void;
}

const ListeningModeModal: React.FC<ListeningModeModalProps> = ({ isOpen, onClose, onConfirm }) => {
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

    return (
        <div className="listening-modal-overlay" onClick={onClose}>
            <div className="listening-modal-content" onClick={e => e.stopPropagation()}>
                <div className="listening-modal-header">
                    <h2>Select Listening Mode</h2>
                    <button className="listening-modal-close" onClick={onClose}>×</button>
                </div>

                <p className="listening-modal-description">
                    Choose the audio processing engine that best fits your device.
                </p>

                <div className="listening-mode-options">
                    {/* Performance Mode Card */}
                    <div
                        className="mode-card performance"
                        onClick={() => onConfirm('performance')}
                    >
                        <div className="mode-icon">⚡</div>
                        <div className="mode-info">
                            <h3>Performance Mode</h3>
                            <span className="mode-tag mobile">Recommended for Mobile</span>
                            <p>Uses <strong>Meyda</strong>. Optimized for speed and lower battery usage. Best for smartphones or older devices.</p>
                        </div>
                    </div>

                    {/* Precision Mode Card */}
                    <div
                        className={`mode-card precision ${!isWasmSupported ? 'disabled' : ''}`}
                        onClick={() => isWasmSupported && onConfirm('precision')}
                    >
                        <div className="mode-icon">🎯</div>
                        <div className="mode-info">
                            <h3>Precision Mode</h3>
                            <span className="mode-tag desktop">Recommended for Desktop</span>
                            <p>Uses <strong>Essentia.js</strong>. Offers higher accuracy but requires more processing power.</p>
                            {!isWasmSupported && <div className="wasm-warning">⚠️ WebAssembly not supported</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ListeningModeModal;
