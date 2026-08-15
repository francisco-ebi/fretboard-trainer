import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import './styles/App.css';
import '@/app/styles/FullScreenStyles.css';
import TopBar from '@/widgets/TopBar';
import ScaleMode from '@/pages/ScaleMode';
import ChordMode from '@/pages/ChordMode';
import PracticeMode from '@/pages/PracticeMode';

import { OrientationProvider } from '@/app/providers';


type AppMode = 'SCALE' | 'CHORD' | 'PRACTICE' | 'LIBRARY' | 'VISUAL';

import PredictionControls from '@/features/PredictionControls';
import { ReloadPrompt } from '@/app/providers';

import { InstrumentProvider, useInstrument } from '@/app/providers';
import { NamingProvider } from '@/app/providers';

// Dynamic Import
const RecordingControls = lazy(() => import('@/widgets/RecordingControls'));
const VisualAnalysis = lazy(() => import('@/pages/VisualAnalysis'));
const ChordLibrary = lazy(() => import('@/pages/ChordLibrary'));

// Logic component to access context
const AppContent = () => {
  const { t } = useTranslation();
  const { instrument, stringCount } = useInstrument();
  const [currentMode, setCurrentModeState] = useState<AppMode>(() => {
    const params = new URLSearchParams(window.location.search);
    // ?chords on a fresh navigation is a shared queue link → open the
    // Library. The queue hook also mirrors the queue into the URL while the
    // user works, tagging its writes in history.state — reloading such a
    // URL must keep the user's own mode instead of hijacking them.
    if (params.has('chords') && !window.history.state?.chordQueueSync) {
      localStorage.setItem('app-mode', 'LIBRARY');
      return 'LIBRARY';
    }
    return (localStorage.getItem('app-mode') as AppMode) || 'SCALE';
  });

  const setCurrentMode = (mode: AppMode) => {
    setCurrentModeState(mode);
    localStorage.setItem('app-mode', mode);
  };

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
    // Prediction engine subscription moved directly to Fretboard components
  }, []);

  const isPredictionEnabled = instrument === 'GUITAR' && stringCount === 6;
  const showPredictionControls = import.meta.env.VITE_ENABLE_PREDICTION_CONTROLS === 'true';
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
            <button
              className={`mode-btn ${currentMode === 'PRACTICE' ? 'active' : ''}`}
              onClick={() => setCurrentMode('PRACTICE')}
            >
              {t('modes.practice')}
            </button>
            <button
              className={`mode-btn ${currentMode === 'LIBRARY' ? 'active' : ''}`}
              onClick={() => setCurrentMode('LIBRARY')}
            >
              {t('modes.library')}
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
          <ScaleMode isFullScreen={isFullScreen} />
        ) : currentMode === 'CHORD' ? (
          <ChordMode isFullScreen={isFullScreen} />
        ) : currentMode === 'PRACTICE' ? (
          <PracticeMode isFullScreen={isFullScreen} />
        ) : currentMode === 'LIBRARY' ? (
          <Suspense fallback={<div>Loading Library...</div>}>
            <ChordLibrary isFullScreen={isFullScreen} />
          </Suspense>
        ) : (
          <Suspense fallback={<div>Loading Analytics...</div>}>
            <VisualAnalysis />
          </Suspense>
        )}

        {showPredictionControls && currentMode === 'SCALE' && !isFullScreen && (
          <PredictionControls disabled={!isPredictionEnabled} />
        )}
      </main>
      <ReloadPrompt />
    </div>
  );
};

function App() {
  return (
    <OrientationProvider>
      <InstrumentProvider>
        <NamingProvider>
          <AppContent />
        </NamingProvider>
      </InstrumentProvider>
    </OrientationProvider>
  );
}

export default App;
