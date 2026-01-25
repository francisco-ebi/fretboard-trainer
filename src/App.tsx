import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './App.css'; // We might remove this if we use index.css for everything, but keeping for standard structure
import Fretboard, { type Orientation } from './components/Fretboard';
import Controls from './components/Controls';
import HelpSection from './components/HelpSection';
import TopBar from './components/TopBar';
import { getScale, type Note, type ScaleType, type NamingSystem, type Instrument } from './utils/musicTheory';

function App() {
  const { t } = useTranslation();
  const [selectedRoot, setSelectedRoot] = useState<Note>('C');
  const [selectedScale, setSelectedScale] = useState<ScaleType>('MAJOR');
  const [namingSystem, setNamingSystem] = useState<NamingSystem>('ENGLISH');
  const [instrument, setInstrument] = useState<Instrument>('GUITAR');
  const [tuningOffsets, setTuningOffsets] = useState<number[]>([]);

  const handleInstrumentChange = (newInstrument: Instrument) => {
    setInstrument(newInstrument);
    setTuningOffsets([]); // Reset to standard tuning when changing instrument
  };

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

  const scaleNotes = getScale(selectedRoot, selectedScale);

  return (
    <div className="app-container">
      <TopBar
        orientation={orientation}
        onOrientationChange={setOrientation}
      />
      <header className="app-header">
        <h1>{t('title')}</h1>
        <p></p>
      </header>

      <main>
        <Controls
          selectedRoot={selectedRoot}
          onRootChange={setSelectedRoot}
          selectedScale={selectedScale}
          onScaleChange={setSelectedScale}
          namingSystem={namingSystem}
          onNamingSystemChange={setNamingSystem}
          instrument={instrument}
          onInstrumentChange={handleInstrumentChange}
          tuningOffsets={tuningOffsets}
          onTuningChange={setTuningOffsets}
        />

        <HelpSection />

        <div className="fretboard-wrapper">
          <Fretboard
            selectedRoot={selectedRoot}
            scaleNotes={scaleNotes}
            namingSystem={namingSystem}
            instrument={instrument}
            tuningOffsets={tuningOffsets}
            orientation={orientation}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
