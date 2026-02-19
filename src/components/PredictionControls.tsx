import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { guitarPredictionEngine } from '@/utils/audio/prediction-engine';
import './PredictionControls.css';

interface PredictionControlsProps {
    disabled?: boolean;
}

const PredictionControls: React.FC<PredictionControlsProps> = ({ disabled = false }) => {
    const { t } = useTranslation();
    const [isListening, setIsListening] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleStartClick = () => {
        if (disabled) return;

        if (isListening) {
            // If already listening, just stop
            stopListening();
        } else {
            // If not listening, start directly
            startListening();
        }
    };

    const stopListening = () => {
        guitarPredictionEngine.stopRecording();
        setIsListening(false);
    };

    const startListening = async () => {
        setIsLoading(true);
        try {
            await guitarPredictionEngine.init();
            await guitarPredictionEngine.startRecording();
            setIsListening(true);
        } catch (error) {
            console.error("Failed to start prediction engine:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="prediction-controls">
            <button
                className={`control-btn ${isListening ? 'stop' : 'start'}`}
                onClick={handleStartClick}
                disabled={isLoading || disabled}
                style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                title={disabled ? "Only available for 6-string Guitar" : ""}
            >
                {isLoading ? (
                    <div className="loading-spinner" />
                ) : (
                    <>
                        <div className={`status-dot ${isListening ? 'pulsing' : ''}`} />
                        {isListening ? t('controls.stopListening') : t('controls.startListening')}
                    </>
                )}
            </button>

        </div>
    );
};

export default PredictionControls;
