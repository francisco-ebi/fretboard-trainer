import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { guitarPredictionEngine } from '@/shared/lib/audio/prediction-engine';
import ListeningModeModal, { type ListeningOptions } from '@/features/ListeningModeModal';
import { intervalTrackingEnabled$ } from './interval-tracking';
import { StatusDot, Spinner } from '@/shared/ui';
import './ui.css';

interface PredictionControlsProps {
    disabled?: boolean;
}

const PredictionControls: React.FC<PredictionControlsProps> = ({ disabled = false }) => {
    const { t } = useTranslation();
    const [isListening, setIsListening] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showModeModal, setShowModeModal] = useState(false);

    const handleStartClick = () => {
        if (disabled) return;

        if (isListening) {
            // If already listening, just stop
            stopListening();
        } else {
            // If not listening, show modal to choose mode
            setShowModeModal(true);
        }
    };

    const stopListening = () => {
        guitarPredictionEngine.stopRecording();
        intervalTrackingEnabled$.next(false);
        setIsListening(false);
    };

    const startListening = async (deviceId: string | null, options: ListeningOptions) => {
        setShowModeModal(false);
        setIsLoading(true);
        try {
            await guitarPredictionEngine.init(deviceId);
            await guitarPredictionEngine.startRecording();
            intervalTrackingEnabled$.next(options.trackIntervals);
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
                    <Spinner />
                ) : (
                    <>
                        <StatusDot pulsing={isListening} />
                        {isListening ? t('controls.stopListening') : t('controls.startListening')}
                    </>
                )}
            </button>

            <ListeningModeModal
                isOpen={showModeModal}
                onClose={() => setShowModeModal(false)}
                onConfirm={startListening}
            />
        </div>
    );
};

export default PredictionControls;
