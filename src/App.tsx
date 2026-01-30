import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './App.css';
import TopBar from '@/components/TopBar';
import ScaleMode from '@/components/ScaleMode';
import ChordMode from '@/components/ChordMode';
import { guitarPredictionEngine } from '@/utils/audio/prediction-engine';
import { OrientationProvider } from '@/context/OrientationContext';


type AppMode = 'SCALE' | 'CHORD';

function App() {

  const { t } = useTranslation();
  const [currentMode, setCurrentMode] = useState<AppMode>('SCALE');

  return (
    <OrientationProvider>
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
          <button onClick={() => guitarPredictionEngine.init()}>Init</button>
          <button onClick={() => guitarPredictionEngine.startRecording()}>Start</button>
          <button onClick={() => guitarPredictionEngine.stopRecording()}>Stop</button>
          {currentMode === 'SCALE' ? (
            <ScaleMode />
          ) : (
            <ChordMode />
          )}
        </main>
      </div>
    </OrientationProvider>
  );
}

export default App;
