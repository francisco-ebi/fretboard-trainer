import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import './App.css';
import '@/components/FullScreenStyles.css';
import TopBar from '@/components/TopBar';
import ScaleMode from '@/components/ScaleMode';
import ChordMode from '@/components/ChordMode';
import { guitarPredictionEngine, type PredictionResult } from '@/utils/audio/prediction-engine';
import { OrientationProvider } from '@/context/OrientationContext';


type AppMode = 'SCALE' | 'CHORD' | 'VISUAL';

import { InstrumentProvider } from '@/context/InstrumentContext';

// Dynamic Import
const RecordingControls = lazy(() => import('./components/RecordingControls'));
const VisualAnalysis = lazy(() => import('./components/VisualAnalysis'));

// Logic component to access context
const AppContent = () => {
  const { t } = useTranslation();
  // const { instrument, stringCount } = useInstrument();
  const [currentPrediction, setCurrentPrediction] = useState<PredictionResult | null>(null);
  const [currentMode, setCurrentMode] = useState<AppMode>('SCALE');

  const [isFullScreen, setIsFullScreen] = useState(false);

  // Secret Recording Mode
  const [showRecorder, setShowRecorder] = useState(false);
  const keyBufferRef = useRef('');

  // Cheat code listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If modal is open, check for Escape
      if (showRecorder && e.key === 'Escape') {
        setShowRecorder(false);
        return;
      }
      // If in full screen, Escape exits
      if (isFullScreen && e.key === 'Escape') {
        setIsFullScreen(false);
        return;
      }

      // Buffer logic
      const newBuffer = (keyBufferRef.current + e.key).slice(-6).toLowerCase();
      keyBufferRef.current = newBuffer;

      if (newBuffer === 'record') {
        setShowRecorder(true);
        keyBufferRef.current = ''; // Reset buffer
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showRecorder, isFullScreen]);

  useEffect(() => {
    const root = document.getElementById('root');
    if (isFullScreen) {
      root?.classList.add('fullscreen-mode');
    } else {
      root?.classList.remove('fullscreen-mode');
    }
  }, [isFullScreen]);

  useEffect(() => {
    if (guitarPredictionEngine) {
      guitarPredictionEngine.fretPredicted$.subscribe(setCurrentPrediction);
    }
  }, []);

  // const isPredictionEnabled = instrument === 'GUITAR' && stringCount === 6;

  return (
    <div className={`app-container ${isFullScreen ? 'fullscreen' : ''}`}>
      {!isFullScreen && (
        <TopBar onToggleFullScreen={() => setIsFullScreen(true)} />
      )}
      {!isFullScreen && (
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
            {/*  <button
              className={`mode-btn ${currentMode === 'VISUAL' ? 'active' : ''}`}
              onClick={() => setCurrentMode('VISUAL')}
            >
              Visual
            </button> */}
          </div>
        </header>
      )}

      {/* Full Screen Exit Button */}
      {isFullScreen && (
        <button
          className="fullscreen-exit-btn"
          onClick={() => setIsFullScreen(false)}
          aria-label="Exit Full Screen"
        >
          ×
        </button>
      )}

      <main className={isFullScreen ? 'fullscreen-main' : ''}>
        {/* Secret Modal */}
        {showRecorder && (
          <div className="modal-overlay" onClick={() => setShowRecorder(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowRecorder(false)}>×</button>
              <h2>Recording Studio</h2>
              <Suspense fallback={<div>Loading Recorder...</div>}>
                <RecordingControls />
              </Suspense>
            </div>
          </div>
        )}

        {currentMode === 'SCALE' ? (
          <ScaleMode prediction={currentPrediction} isFullScreen={isFullScreen} />
        ) : currentMode === 'CHORD' ? (
          <ChordMode prediction={currentPrediction} isFullScreen={isFullScreen} />
        ) : (
          <Suspense fallback={<div>Loading Analytics...</div>}>
            <VisualAnalysis />
          </Suspense>
        )}
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
