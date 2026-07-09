import { MeydaBackend } from './meyda-worklet-backend';
import { runFeatureWorker } from './base-feature-worker';

runFeatureWorker(() => new MeydaBackend());
