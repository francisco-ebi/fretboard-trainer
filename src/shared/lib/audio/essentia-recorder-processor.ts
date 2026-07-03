import { EssentiaBackend } from './essentia-worklet-backend';
import { registerRecorderProcessor } from './base-recorder-processor';

registerRecorderProcessor('essentia-recorder-processor', () => new EssentiaBackend());
