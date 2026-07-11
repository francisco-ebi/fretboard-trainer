import { useEffect, useState } from 'react';
import { audioRecordingEngine } from '@/shared/lib/audio/recording-engine';
import { sessionRunner, type RunnerPhase } from '@/shared/lib/audio/session-runner';
import {
    generateSessionPlan,
    MAX_FRET,
    PLUCK_POSITION_LABELS,
    STRING_LABELS,
    type Dynamics,
    type Excitation,
    type PlanPreset,
    type PluckPosition,
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

// --- Pluck-prompt visuals -------------------------------------------------
// Color encodes dynamics, an icon encodes excitation, and a body diagram
// shows the pluck position: the operator has a pick in hand and eyes on the
// frets, so the prompt must scan at a glance rather than read as a sentence.

const DYNAMICS_COLORS: Record<Dynamics, string> = {
    soft: '#7bd88f',
    medium: '#ffc107',
    hard: '#ff6b6b'
};
const DYNAMICS_LEVEL: Record<Dynamics, number> = { soft: 1, medium: 2, hard: 3 };
const POSITION_COLOR = '#8ab4ff';

const captionStyle: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, textAlign: 'center' };
const badgeBoxStyle = (border: string, background: string): React.CSSProperties => ({
    height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
    padding: '0 12px', borderRadius: '10px', border: `1.5px solid ${border}`, background
});
const badgeColumnStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'
};

const DynamicsBadge = ({ dynamics }: { dynamics: Dynamics }) => {
    const color = DYNAMICS_COLORS[dynamics];
    return (
        <div style={badgeColumnStyle}>
            <div style={{ ...badgeBoxStyle(color, `${color}1f`), alignItems: 'flex-end', paddingBottom: '9px' }}>
                {[1, 2, 3].map((level) => (
                    <span
                        key={level}
                        style={{
                            width: '7px', height: `${4 + level * 8}px`, borderRadius: '2px',
                            background: color, opacity: level <= DYNAMICS_LEVEL[dynamics] ? 1 : 0.18
                        }}
                    />
                ))}
            </div>
            <span style={{ ...captionStyle, color }}>{dynamics}</span>
        </div>
    );
};

const PickIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        {/* plectrum: rounded shoulders, tapering tip */}
        <path
            d="M12 21.5 C9.2 18 4.5 13.4 4.5 8.7 C4.5 5.2 7.8 2.8 12 2.8 C16.2 2.8 19.5 5.2 19.5 8.7 C19.5 13.4 14.8 18 12 21.5 Z"
            fill="rgba(255,255,255,0.92)"
        />
    </svg>
);

const FingerIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        {/* index finger raised from a closed hand */}
        <rect x="9.7" y="2" width="4.6" height="12.5" rx="2.3" fill="rgba(255,255,255,0.92)" />
        <rect x="4.8" y="10.2" width="14.4" height="9.8" rx="4.9" fill="rgba(255,255,255,0.92)" />
    </svg>
);

const ExcitationBadge = ({ excitation }: { excitation: Excitation }) => (
    <div style={badgeColumnStyle}>
        <div style={badgeBoxStyle('rgba(255,255,255,0.35)', 'rgba(255,255,255,0.06)')}>
            {excitation === 'pick' ? <PickIcon /> : <FingerIcon />}
        </div>
        <span style={{ ...captionStyle, opacity: 0.85 }}>{excitation}</span>
    </div>
);

// Zones in the diagram's viewBox: over the fretboard end, over the
// soundhole, and just ahead of the bridge
const POSITION_ZONES: Record<PluckPosition, { x: number; width: number }> = {
    neck: { x: 50, width: 42 },
    middle: { x: 96, width: 40 },
    bridge: { x: 140, width: 44 }
};

const PositionDiagram = ({ position }: { position: PluckPosition }) => {
    const zone = POSITION_ZONES[position];
    return (
        <div style={badgeColumnStyle}>
            <svg width="205" height="48" viewBox="0 0 210 64" aria-hidden="true">
                {/* fretboard end */}
                <rect x="0" y="24" width="62" height="16" rx="2" fill="rgba(255,255,255,0.14)" />
                {[10, 22, 34, 46, 58].map((x) => (
                    <line key={x} x1={x} y1="24" x2={x} y2="40" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
                ))}
                {/* body outline with waist */}
                <path
                    d="M62 20 C76 6 98 6 112 16 C117 20 123 20 128 16 C142 4 176 6 190 22 C196 28 196 36 190 42 C176 58 142 60 128 48 C123 44 117 44 112 48 C98 58 76 58 62 44 Z"
                    fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)" strokeWidth="1"
                />
                <circle cx="112" cy="32" r="8.5" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                {/* bridge */}
                <rect x="168" y="25" width="11" height="14" rx="2" fill="rgba(255,255,255,0.4)" />
                {/* strings */}
                {[28, 32, 36].map((y) => (
                    <line key={y} x1="0" y1={y} x2="173" y2={y} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
                ))}
                {/* active pluck zone */}
                <rect
                    x={zone.x} y="9" width={zone.width} height="46" rx="7"
                    fill="rgba(138,180,255,0.16)" stroke={POSITION_COLOR} strokeWidth="1.6"
                />
                <path d={`M${zone.x + zone.width / 2 - 5.5} 1 h11 l-5.5 7 Z`} fill={POSITION_COLOR} />
            </svg>
            <span style={{ ...captionStyle, color: POSITION_COLOR }}>{PLUCK_POSITION_LABELS[position]}</span>
        </div>
    );
};

// One dot per pluck of the current fret, colored by its dynamics: done plucks
// solid, the current one ringed, upcoming ones dimmed — progress and what's
// coming next in a single glance
const PluckDots = ({ plucks, pluckPos, ringing }: { plucks: PluckSpec[]; pluckPos: number; ringing: boolean }) => (
    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
        {plucks.map((pluck, index) => {
            const done = index < pluckPos || (index === pluckPos && ringing);
            const current = index === pluckPos;
            return (
                <span
                    key={index}
                    title={formatPluck(pluck)}
                    style={{
                        width: '11px', height: '11px', borderRadius: '50%',
                        background: DYNAMICS_COLORS[pluck.dynamics],
                        opacity: done ? 1 : current ? 0.9 : 0.25,
                        boxShadow: current ? '0 0 0 2px rgba(255,255,255,0.8)' : 'none'
                    }}
                />
            );
        })}
    </div>
);

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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
                                String {snap.currentString.stringIndex} — {snap.currentString.stringLabel} · Fret {snap.currentFret.fret} ({snap.currentFret.noteName})
                            </div>
                            <div
                                style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}
                                title={formatPluck(snap.currentPluck)}
                            >
                                <DynamicsBadge dynamics={snap.currentPluck.dynamics} />
                                <ExcitationBadge excitation={snap.currentPluck.excitation} />
                                <PositionDiagram position={snap.currentPluck.position} />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <PluckDots plucks={snap.currentFret.plucks} pluckPos={snap.pluckPos} ringing={snap.phase === 'ringing'} />
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
