import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './App.css';
import TopBar from '@/components/TopBar';
import ScaleMode from '@/components/ScaleMode';
import ChordMode from '@/components/ChordMode';
import { type Orientation } from '@/components/Fretboard';
import RecordingControls from '@/components/RecordingControls';


type AppMode = 'SCALE' | 'CHORD';

function App() {
  const { t } = useTranslation();
  const [currentMode, setCurrentMode] = useState<AppMode>('SCALE');

  // Auto-detect orientation on start and change
  const [orientation, setOrientation] = useState<Orientation>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(orientation: portrait)').matches ? 'VERTICAL' : 'HORIZONTAL';
    }
    return 'HORIZONTAL';
  });

  useEffect(() => {
    const handleOrientationChange = (e: MediaQueryListEvent) => {
      setOrientation(e.matches ? 'VERTICAL' : 'HORIZONTAL');
    };

    const mediaQuery = window.matchMedia('(orientation: portrait)');

    // Ensure state is correct on mount (redundant if using lazy init, but safe)
    if (mediaQuery.matches && orientation !== 'VERTICAL') {
      setOrientation('VERTICAL');
    } else if (!mediaQuery.matches && orientation !== 'HORIZONTAL') {
      setOrientation('HORIZONTAL');
    }

    mediaQuery.addEventListener('change', handleOrientationChange);

    return () => {
      mediaQuery.removeEventListener('change', handleOrientationChange);
    };
  }, [orientation]);

  return (
    <div className="app-container">
      <TopBar
        orientation={orientation}
        onOrientationChange={setOrientation}
      />
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
        <RecordingControls />
        {currentMode === 'SCALE' ? (
          <ScaleMode orientation={orientation} />
        ) : (
          <ChordMode orientation={orientation} />
        )}
      </main>
    </div>
  );
}

export default App;
