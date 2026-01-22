import { useState } from 'react';
import './App.css'; // We might remove this if we use index.css for everything, but keeping for standard structure
import Fretboard from './components/Fretboard';
import Controls from './components/Controls';
import { getScale, type Note, type ScaleType } from './utils/musicTheory';

function App() {
  const [selectedRoot, setSelectedRoot] = useState<Note>('C');
  const [selectedScale, setSelectedScale] = useState<ScaleType>('MAJOR');

  const scaleNotes = getScale(selectedRoot, selectedScale);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Guitar Fretboard Trainer</h1>
        <p>Visualize scales and master the fretboard.</p>
      </header>

      <main>
        <Controls
          selectedRoot={selectedRoot}
          onRootChange={setSelectedRoot}
          selectedScale={selectedScale}
          onScaleChange={setSelectedScale}
        />

        <div className="fretboard-wrapper">
          <Fretboard
            selectedRoot={selectedRoot}
            scaleNotes={scaleNotes}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
