import { useEffect, useRef, useState } from 'react';
import { audioRecordingEngine, type EngineNoteEvent } from '@/shared/lib/audio/recording-engine';
import { calculatePlayedFret, isValidFret, PracticeNoteHandler } from '@/shared/lib/audio/practiceAudio';
import { FRETS } from '@/widgets/Fretboard';
import { type Question } from '@/shared/lib/srs/deck';

export interface DetectedNoteInfo {
    midi: number;
    noteName: string;
    fret: number;
    timestamp: number;
}

interface UsePracticeAudioOptions {
    enabled: boolean;
    deviceId: string | null;
    question: Question | null;
    feedback: { correct: boolean } | null;
    openStringPitches: number[];
    onAnswer: (stringIndex: number, fret: number) => void;
    onAdvance: () => void;
}

export const usePracticeAudio = ({
    enabled,
    deviceId,
    question,
    feedback,
    openStringPitches,
    onAnswer,
    onAdvance
}: UsePracticeAudioOptions) => {
    const [isListening, setIsListening] = useState(false);
    const [detectedNote, setDetectedNote] = useState<DetectedNoteInfo | null>(null);
    const [audioError, setAudioError] = useState<string | null>(null);

    const noteHandlerRef = useRef(new PracticeNoteHandler());
    const onAnswerRef = useRef(onAnswer);
    const onAdvanceRef = useRef(onAdvance);
    const questionRef = useRef(question);
    const feedbackRef = useRef(feedback);
    const openStringPitchesRef = useRef(openStringPitches);

    useEffect(() => { onAnswerRef.current = onAnswer; }, [onAnswer]);
    useEffect(() => { onAdvanceRef.current = onAdvance; }, [onAdvance]);
    useEffect(() => { questionRef.current = question; }, [question]);
    useEffect(() => { feedbackRef.current = feedback; }, [feedback]);
    useEffect(() => { openStringPitchesRef.current = openStringPitches; }, [openStringPitches]);

    // Reset note handler when question changes
    useEffect(() => {
        noteHandlerRef.current.reset();
    }, [question?.itemId]);

    useEffect(() => {
        if (!enabled) {
            audioRecordingEngine.stopRecording();
            audioRecordingEngine.onNoteEvent = null;
            setIsListening(false);
            setDetectedNote(null);
            return;
        }

        let isMounted = true;

        const startAudio = async () => {
            try {
                setAudioError(null);
                await audioRecordingEngine.init(deviceId);

                if (!isMounted) return;

                const targetString = questionRef.current?.move.to ?? 0;
                audioRecordingEngine.currentLabel = targetString;
                audioRecordingEngine.startRecording(targetString);
                setIsListening(true);

                audioRecordingEngine.onNoteEvent = (event: EngineNoteEvent) => {
                    const midi = noteHandlerRef.current.processEvent(event);
                    if (midi === null) return;

                    const currentQuestion = questionRef.current;
                    const currentFeedback = feedbackRef.current;
                    const pitches = openStringPitchesRef.current;
                    if (!currentQuestion) return;

                    const targetStringIndex = currentQuestion.move.to;
                    const playedFret = calculatePlayedFret(midi, targetStringIndex, pitches);

                    if (!isValidFret(playedFret, FRETS)) {
                        return;
                    }

                    setDetectedNote({
                        midi,
                        noteName: event.noteName,
                        fret: playedFret,
                        timestamp: performance.now()
                    });

                    if (currentFeedback) {
                        // If learner is currently reviewing a missed note, playing the correct
                        // note serves as a hands-free advance trigger
                        if (!currentFeedback.correct && playedFret === currentQuestion.target.fret) {
                            onAdvanceRef.current();
                        }
                    } else {
                        onAnswerRef.current(targetStringIndex, playedFret);
                    }
                };
            } catch (err) {
                if (isMounted) {
                    console.error('Failed to initialize audio in Practice Mode:', err);
                    setAudioError('Failed to access audio device');
                    setIsListening(false);
                }
            }
        };

        startAudio();

        return () => {
            isMounted = false;
            audioRecordingEngine.stopRecording();
            audioRecordingEngine.onNoteEvent = null;
            setIsListening(false);
        };
    }, [enabled, deviceId]);

    // Keep the engine's target string label updated when the question changes
    useEffect(() => {
        if (enabled && question) {
            audioRecordingEngine.currentLabel = question.move.to;
        }
    }, [enabled, question?.move.to]);

    return {
        isListening,
        detectedNote,
        audioError
    };
};
