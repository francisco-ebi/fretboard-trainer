import { MeydaBackend } from './meyda-worklet-backend';
import { registerRecorderProcessor } from './base-recorder-processor';

registerRecorderProcessor('meyda-recorder-processor', () => new MeydaBackend());
