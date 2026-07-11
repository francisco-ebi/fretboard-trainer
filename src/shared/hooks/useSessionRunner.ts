import { useSyncExternalStore } from 'react';
import { sessionRunner, type RunnerSnapshot } from '@/shared/lib/audio/session-runner';

// Subscribes a component to the guided-session runner singleton
export const useSessionRunner = (): RunnerSnapshot =>
    useSyncExternalStore(
        (onStoreChange) => sessionRunner.subscribe(onStoreChange),
        () => sessionRunner.getSnapshot()
    );
