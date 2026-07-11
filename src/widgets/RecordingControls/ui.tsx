import { audioRecordingEngine, type DatasetEntry } from '@/shared/lib/audio/recording-engine';
import { useEffect, useRef, useState } from 'react';
import DeviceSelector from '@/features/DeviceSelector';
import GuidedSession from './GuidedSession';
import { useSessionRunner } from '@/shared/hooks/useSessionRunner';

// Remembered across sessions so multi-day passes keep a consistent provenance tag
const GUITAR_TAG_STORAGE_KEY = 'recording-guitar-tag';

const RecordingControls = () => {
    const [activeRecording, setActiveRecording] = useState<number | null>(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    // The engine is a singleton, so sequences survive closing/reopening the modal
    const [totalSequences, setTotalSequences] = useState(audioRecordingEngine.dataset.length);
    const [importStatus, setImportStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    // Sequences a previous session autosaved but never downloaded
    const [pendingAutosave, setPendingAutosave] = useState(0);
    // Provenance tag stamped onto every captured sequence (protocol §7)
    const [guitarTag, setGuitarTag] = useState(() => localStorage.getItem(GUITAR_TAG_STORAGE_KEY) ?? '');
    const fileInputRef = useRef<HTMLInputElement>(null);
    // While the guided runner drives the engine, manual controls must not
    // fight it over the string label
    const guided = useSessionRunner();
    const guidedActive = guided.phase !== 'idle' && guided.phase !== 'done';

    useEffect(() => {
        audioRecordingEngine.guitarId = guitarTag;
        localStorage.setItem(GUITAR_TAG_STORAGE_KEY, guitarTag);
    }, [guitarTag]);

    useEffect(() => {
        audioRecordingEngine.onDataCaptured = (nota, total) => {
            console.log(`Nota: ${nota} | Total muestras: ${total}`);
            setTotalSequences(total);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        audioRecordingEngine.getPendingAutosaveCount().then((count) => {
            if (!cancelled) setPendingAutosave(count);
        });
        return () => { cancelled = true; };
    }, []);

    const handleRestoreAutosave = async () => {
        try {
            const total = await audioRecordingEngine.restoreAutosave();
            setTotalSequences(total);
            setImportStatus({ kind: 'ok', text: `Restored ${pendingAutosave} autosaved sequences — ${total} in memory` });
            setPendingAutosave(0);
        } catch (error) {
            setImportStatus({ kind: 'error', text: `Restore failed: ${error instanceof Error ? error.message : String(error)}` });
        }
    };

    const handleDiscardAutosave = async () => {
        if (!window.confirm(`Discard ${pendingAutosave} autosaved sequences from the previous session? They exist nowhere else.`)) return;
        try {
            await audioRecordingEngine.discardAutosave();
            setPendingAutosave(0);
            setImportStatus({ kind: 'ok', text: 'Previous session autosave discarded' });
        } catch (error) {
            setImportStatus({ kind: 'error', text: `Discard failed: ${error instanceof Error ? error.message : String(error)}` });
        }
    };

    const handleStartRecording = (index: number) => {
        setActiveRecording(index);
        audioRecordingEngine.startRecording(index);
    };

    const handleStopRecording = () => {
        setActiveRecording(null);
        audioRecordingEngine.stopRecording();
    };
    const handleTrainModel = async () => {
        const { trainModel } = await import('@/shared/lib/audio/model');
        // Empty → normal stratified split; a tag → leave-one-guitar-out
        // generalization experiment on that guitar (protocol §7)
        const holdOut = window.prompt('Hold out a guitar tag for a LOGO experiment?\n(leave empty for the normal stratified split)', '');
        if (holdOut === null) return; // cancelled
        trainModel([], holdOut.trim() ? { holdOutGuitarId: holdOut.trim() } : {});
    };
    const handleStats = async () => {
        const { calculateStatistics } = await import('@/shared/lib/audio/dataset-preparation');
        const { fetchDataset } = await import('@/shared/lib/audio/dataset-loader');
        const dataset = await fetchDataset<DatasetEntry[]>('essentia-acoustic-ts/guitar_dataset.json');
        const stats = calculateStatistics(dataset);
        const blob = new Blob([JSON.stringify(stats, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'guitar_dataset_stats_1777920241509.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        // Allow re-selecting the same file after an error
        event.target.value = '';
        if (!file) return;

        try {
            const { parseDatasetFile } = await import('@/shared/lib/audio/dataset-import');
            let raw: unknown;
            try {
                raw = JSON.parse(await file.text());
            } catch {
                throw new Error('not a valid JSON file');
            }
            const entries = parseDatasetFile(raw);
            const total = audioRecordingEngine.importDataset(entries);
            setTotalSequences(total);
            setImportStatus({ kind: 'ok', text: `Imported ${entries.length} sequences from ${file.name} — ${total} in memory` });
        } catch (error) {
            setImportStatus({ kind: 'error', text: `Import failed: ${error instanceof Error ? error.message : String(error)}` });
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pendingAutosave > 0 && (
                <div
                    data-testid="autosave-banner"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                        padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid rgba(255, 193, 7, 0.5)', background: 'rgba(255, 193, 7, 0.08)',
                        fontSize: '0.85rem'
                    }}
                >
                    <span>
                        Autosaved session found: <strong>{pendingAutosave}</strong> sequences were never downloaded.
                    </span>
                    <button className="mode-btn" onClick={handleRestoreAutosave} disabled={activeRecording !== null || guidedActive}>Restore</button>
                    <button className="mode-btn" onClick={handleDiscardAutosave}>Discard</button>
                </div>
            )}
            <DeviceSelector onDeviceSelected={setSelectedDeviceId} />
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label htmlFor="guitar-tag-input" style={{ fontSize: '0.85rem' }}>Guitar tag:</label>
                <input
                    id="guitar-tag-input"
                    type="text"
                    value={guitarTag}
                    onChange={(e) => setGuitarTag(e.target.value)}
                    disabled={activeRecording !== null || guidedActive}
                    placeholder="e.g. strat-daddario-10s"
                    title="Provenance tag stamped onto every captured sequence — one stable id per instrument + string set. Enables leave-one-guitar-out evaluation and per-family models."
                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'inherit' }}
                />
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="mode-btn" onClick={() => audioRecordingEngine.init(selectedDeviceId)}>Init</button>
            </div>

            <GuidedSession manualActive={activeRecording !== null} />

            <div style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.9 }}>Manual (fallback)</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                    <button
                        key={index}
                        className={`mode-btn ${activeRecording === index ? 'active' : ''}`}
                        onClick={() => handleStartRecording(index)}
                        disabled={guidedActive}
                    >
                        Start {index}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="mode-btn" onClick={handleStopRecording} disabled={guidedActive}>Stop</button>
                <button className="mode-btn" onClick={handleStats}>Generate stats</button>
                <button
                    className="mode-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={activeRecording !== null || guidedActive}
                    title="Resume a multi-day recording: load a previously downloaded dataset file; new sequences append to it"
                >
                    Import dataset
                </button>
                <button className="mode-btn" onClick={() => audioRecordingEngine.downloadDataset()}>Download</button>
                <button className="mode-btn" onClick={handleTrainModel}>Train</button>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
                data-testid="dataset-import-input"
            />

            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                Sequences in memory: {totalSequences}
            </div>
            {importStatus && (
                <div style={{ fontSize: '0.85rem', color: importStatus.kind === 'error' ? '#ff6b6b' : '#7bd88f' }}>
                    {importStatus.text}
                </div>
            )}
        </div>
    );
};

export default RecordingControls;
