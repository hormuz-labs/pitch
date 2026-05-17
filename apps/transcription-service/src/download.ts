import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = true;
console.log('Downloading model...');
await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
console.log('Model downloaded.');
process.exit(0);
