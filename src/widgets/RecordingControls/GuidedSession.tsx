import { useEffect, useState } from 'react';
import { audioRecordingEngine } from '@/shared/lib/audio/recording-engine';
import { sessionRunner, type RunnerPhase } from '@/shared/lib/audio/session-runner';
import {
    generateSessionPlan,
    MAX_FRET,
    PLUCK_POSITION_LABELS,
    STRING_LABELS,
    type PlanPreset,
    type PluckSpec
} from '@/shared/lib/audio/session-plan';
import { useSessionRunner } from '@/shared/hooks/useSessionRunner';

// Voice prompts let the operator keep eyes and hands on the guitar
const SPEECH_STORAGE_KEY = 'guided-speech-enabled';

const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
};

const formatPluck = (pluck: PluckSpec) =>
    `${pluck.dynamics} · ${pluck.excitation} · ${PLUCK_POSITION_LABELS[pluck.position]}`;

const ACTIVE_PHASES: RunnerPhase[] = ['transition', 'armWait', 'prompting', 'ringing', 'paused'];

const inputStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.05)', color: 'inherit'
};
const bannerStyle = (color: string): React.CSSProperties => ({
    padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem',
    border: `1px solid ${color}80`, background: `${color}14`
});

const GuidedSession = ({ manualActive }: { manualActive: boolean }) => {
    const snap = useSessionRunner();
    const [preset, setPreset] = useState<PlanPreset>('passA');
    const [singleString, setSingleString] = useState(5);
    const [fretStart, setFretStart] = useState(0);
    const [fretEnd, setFretEnd] = useState(MAX_FRET);
    const [speechEnabled, setSpeechEnabled] = useState(
        () => (localStorage.getItem(SPEECH_STORAGE_KEY) ?? 'true') === 'true'
    );
    const [startError, setStartError] = useState<string | null>(null);

    const sessionActive = ACTIVE_PHASES.includes(snap.phase);

    // No unmount cleanup: the session (and its announcements) survives an
    // accidental modal close — Escape closes the modal, and aborting an
    // hour-long recording that way would be brutal.
    useEffect(() => {
        localStorage.setItem(SPEECH_STORAGE_KEY, String(speechEnabled));
        sessionRunner.onAnnounce = speechEnabled ? speak : null;
    }, [speechEnabled]);

    useEffect(() => {
        if (!sessionActive) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
            if (event.code !== 'Space') return;
            event.preventDefault();
            if (snap.phase === 'transition') sessionRunner.confirmReady();
            else if (snap.phase === 'paused') sessionRunner.resume();
            else sessionRunner.pause();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [sessionActive, snap.phase]);

    const handleStart = () => {
        if (!audioRecordingEngine.audioContext) {
            setStartError('Press Init first — the microphone is not running.');
            return;
        }
        try {
            const plan = generateSessionPlan(
                preset === 'single'
                    ? { preset, stringIndex: singleString, fretStart, fretEnd }
                    : { preset }
            );
            setStartError(null);
            sessionRunner.start(plan);
        } catch (error) {
            setStartError(error instanceof Error ? error.message : String(error));
        }
    };

    const handleAbort = () => {
        if (window.confirm('Abort the guided session? Sequences already captured stay in memory — Download still works.')) {
            sessionRunner.abort();
        }
    };

    const canSkipPluck = snap.phase === 'prompting' || snap.phase === 'ringing';
    const canSkipFret = canSkipPluck || snap.phase === 'armWait';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.9 }}>Guided session</div>

            {!sessionActive && snap.phase !== 'done' && (
                <>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select value={preset} onChange={(e) => setPreset(e.target.value as PlanPreset)} style={inputStyle}>
                            <option value="passA">Pass A — strings 5→0 · frets 0–9</option>
                            <option value="passB">Pass B — strings 0→5 · frets 10–18</option>
                            <option value="full">Full — strings 5→0 · frets 0–18</option>
                            <option value="single">Single string…</option>
                        </select>
                        {preset === 'single' && (
                            <>
                                <select value={singleString} onChange={(e) => setSingleString(Number(e.target.value))} style={inputStyle}>
                                    {[5, 4, 3, 2, 1, 0].map((index) => (
                                        <option key={index} value={index}>{index} — {STRING_LABELS[index]}</option>
                                    ))}
                                </select>
                                <label style={{ fontSize: '0.85rem' }}>frets</label>
                                <input type="number" min={0} max={MAX_FRET} value={fretStart}
                                    onChange={(e) => setFretStart(Number(e.target.value))} style={{ ...inputStyle, width: '60px' }} />
                                <span>–</span>
                                <input type="number" min={0} max={MAX_FRET} value={fretEnd}
                                    onChange={(e) => setFretEnd(Number(e.target.value))} style={{ ...inputStyle, width: '60px' }} />
                            </>
                        )}
                        <button className="mode-btn" onClick={handleStart} disabled={manualActive}
                            title="The runner sets the string label itself and walks you through every fret and pluck variation">
                            Start session
                        </button>
                        <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <input type="checkbox" checked={speechEnabled} onChange={(e) => setSpeechEnabled(e.target.checked)} />
                            Voice prompts
                        </label>
                    </div>
                    {startError && <div style={{ fontSize: '0.85rem', color: '#ff6b6b' }}>{startError}</div>}
                </>
            )}

            {sessionActive && (
                <>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {snap.phase === 'paused'
                            ? <button className="mode-btn" onClick={() => sessionRunner.resume()}>Resume (Space)</button>
                            : <button className="mode-btn" onClick={() => sessionRunner.pause()}>Pause (Space)</button>}
                        <button className="mode-btn" onClick={() => sessionRunner.skipPluck()} disabled={!canSkipPluck}>Skip pluck</button>
                        <button className="mode-btn" onClick={() => sessionRunner.skipFret()} disabled={!canSkipFret}
                            title="Buzzing fret? Skip it — skipped frets are listed in the summary; copy them into the metadata file (protocol §2)">
                            Skip fret
                        </button>
                        <button className="mode-btn" onClick={() => sessionRunner.skipString()}>Skip string</button>
                        <button className="mode-btn" onClick={handleAbort}>Abort</button>
                    </div>

                    {snap.phase === 'transition' && snap.currentString && (
                        <div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
                                Next: String {snap.currentString.stringIndex} — {snap.currentString.stringLabel}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span>Re-check tuning · starting in {Math.ceil(snap.countdownMs / 1000)} s…</span>
                                <button className="mode-btn" onClick={() => sessionRunner.confirmReady()}>I'm ready (Space)</button>
                            </div>
                        </div>
                    )}

                    {snap.phase === 'armWait' && (
                        <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>Recording armed — keep silent…</div>
                    )}

                    {(snap.phase === 'prompting' || snap.phase === 'ringing') && snap.currentString && snap.currentFret && snap.currentPluck && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
                                String {snap.currentString.stringIndex} — {snap.currentString.stringLabel} · Fret {snap.currentFret.fret} ({snap.currentFret.noteName})
                            </div>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{formatPluck(snap.currentPluck)}</span>
                                <span style={{ opacity: 0.8 }}>pluck {snap.pluckPos + 1}/{snap.currentFret.plucks.length}</span>
                                <span style={{ opacity: 0.8 }}>cell sequences: {snap.cellSequences}</span>
                                {snap.phase === 'ringing' && <span style={{ color: '#7bd88f' }}>✓ counted — let it ring</span>}
                                {snap.lastNote && (
                                    <span style={{
                                        padding: '2px 8px', borderRadius: '6px', fontSize: '0.85rem',
                                        background: snap.lastNote.match ? 'rgba(123,216,143,0.15)' : 'rgba(255,107,107,0.15)',
                                        color: snap.lastNote.match ? '#7bd88f' : '#ff6b6b'
                                    }}>
                                        heard: {snap.lastNote.noteName}
                                    </span>
                                )}
                            </div>
                            {snap.paceHint && (
                                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Pace: let each note ring ~2 s, then mute before the next pluck.</div>
                            )}
                        </div>
                    )}

                    {snap.phase === 'paused' && (
                        <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                            Paused — recording stopped. Resume re-arms with 2 s of silence at the same spot.
                        </div>
                    )}

                    {snap.wrongStringAlert && (
                        <div style={bannerStyle('#ff6b6b')}>
                            <strong>Check your string and fret</strong> — several notes in a row didn't match the plan.
                        </div>
                    )}
                    {snap.tuningRecheckDue && (
                        <div style={bannerStyle('#ffc107')}>
                            ~15 min on this string — pause and re-check tuning (drifted strings mislabel notes wholesale).
                        </div>
                    )}
                </>
            )}

            {snap.phase === 'done' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                        Session complete — {snap.totalSessionSequences} sequences captured
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button className="mode-btn" onClick={() => audioRecordingEngine.downloadDataset()}>Download dataset + stats</button>
                        <button className="mode-btn" onClick={() => sessionRunner.reset()}>New session</button>
                    </div>
                </div>
            )}

            {(sessionActive || snap.phase === 'done') && snap.perString.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {snap.perString.map((progress, index) => (
                        <div key={progress.stringIndex} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.85rem' }}>
                            <span style={{ width: '90px', fontWeight: index === snap.stringPos && sessionActive ? 700 : 400 }}>
                                S{progress.stringIndex} {progress.label}
                            </span>
                            <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px' }}>
                                <div style={{
                                    width: `${progress.fretsTotal > 0 ? (progress.fretsDone / progress.fretsTotal) * 100 : 0}%`,
                                    height: '100%', background: '#7bd88f', borderRadius: '3px'
                                }} />
                            </div>
                            <span style={{ opacity: 0.8 }}>
                                {progress.fretsDone}/{progress.fretsTotal} frets · {progress.sequences} seq
                                {progress.skippedFrets.length > 0 && ` · skipped: ${progress.skippedFrets.join(', ')}`}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {sessionActive && snap.warnings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.8rem', opacity: 0.8 }}>
                    {snap.warnings.slice(-3).map((warning, index) => (
                        <div key={`${warning.atMs}-${index}`}>⚠ {warning.text}</div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default GuidedSession;
