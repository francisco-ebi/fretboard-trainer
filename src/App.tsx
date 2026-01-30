import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './App.css';
import TopBar from '@/components/TopBar';
import ScaleMode from '@/components/ScaleMode';
import ChordMode from '@/components/ChordMode';
import { guitarPredictionEngine, type PredictionResult } from '@/utils/audio/prediction-engine';
import { OrientationProvider } from '@/context/OrientationContext';
import PredictionControls from '@/components/PredictionControls';


type AppMode = 'SCALE' | 'CHORD';

import { InstrumentProvider, useInstrument } from '@/context/InstrumentContext';

// Logic component to access context
const AppContent = () => {
  const { t } = useTranslation();
  const { instrument, stringCount } = useInstrument();
  const [currentPrediction, setCurrentPrediction] = useState<PredictionResult | null>(null);
  const [currentMode, setCurrentMode] = useState<AppMode>('SCALE');

  useEffect(() => {
    if (guitarPredictionEngine) {
      guitarPredictionEngine.fretPredicted$.subscribe(setCurrentPrediction);
    }
  }, []);

  const isPredictionEnabled = instrument === 'GUITAR' && stringCount === 6;

  return (
    <div className="app-container">
      <TopBar />
      <header className="app-header">
        <h1>{t('title')}</h1>
        <div className="mode-selector">
          <button
            className={`mode-btn ${currentMode === 'SCALE' ? 'active' : ''}`}
            onClick={() => setCurrentMode('SCALE')}
          >
            {t('modes.scale')}
          </button>
          <button
            className={`mode-btn ${currentMode === 'CHORD' ? 'active' : ''}`}
            onClick={() => setCurrentMode('CHORD')}
          >
            {t('modes.chord')}
          </button>
        </div>
      </header>
      <main>
        {currentMode === 'SCALE' ? (
          <ScaleMode prediction={currentPrediction} />
        ) : (
          <ChordMode prediction={currentPrediction} />
        )}
        <PredictionControls disabled={!isPredictionEnabled} />
      </main>
    </div>
  );
};

function App() {
  return (
    <OrientationProvider>
      <InstrumentProvider>
        <AppContent />
      </InstrumentProvider>
    </OrientationProvider>
  );
}

export default App;
