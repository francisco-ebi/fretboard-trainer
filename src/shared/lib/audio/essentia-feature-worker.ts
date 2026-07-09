import { EssentiaBackend } from './essentia-worklet-backend';
import { runFeatureWorker } from './base-feature-worker';

runFeatureWorker(() => new EssentiaBackend());
