import React, { useState } from 'react';
// import { useTranslation } from 'react-i18next';
import { guitarPredictionEngine } from '@/utils/audio/prediction-engine';
import './PredictionControls.css';

const PredictionControls: React.FC = () => {
    // const { t } = useTranslation();
    const [isListening, setIsListening] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const toggleListening = async () => {
        if (isListening) {
            // Stop
            guitarPredictionEngine.stopRecording();
            setIsListening(false);
        } else {
            // Start
            setIsLoading(true);
            try {
                // Determine if we need to init (naive check, engine handles idempotent init mostly, but let's just call it)
                await guitarPredictionEngine.init();
                await guitarPredictionEngine.startRecording();
                setIsListening(true);
            } catch (error) {
                console.error("Failed to start prediction engine:", error);
                // Could verify if we should show a toast here
            } finally {
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="prediction-controls">
            <button
                className={`control-btn ${isListening ? 'stop' : 'start'}`}
                onClick={toggleListening}
                disabled={isLoading}
            >
                {isLoading ? (
                    <div className="loading-spinner" />
                ) : (
                    <>
                        <div className={`status-dot ${isListening ? 'pulsing' : ''}`} />
                        {isListening ? 'Stop Listening' : 'Start Listening'}
                    </>
                )}
            </button>
        </div>
    );
};

export default PredictionControls;
