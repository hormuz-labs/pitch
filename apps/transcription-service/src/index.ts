import { pipeline, env } from '@xenova/transformers';
import { WaveFile } from 'wavefile';

// Ensure models are downloaded to a central cache
env.allowLocalModels = true;

const PORT = process.env.PORT || 4000;
let transcriber: any = null;

console.log('⏳ Loading Whisper tiny.en model into memory...');
pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en')
  .then((model) => {
    transcriber = model;
    console.log(`✅ Whisper model loaded! Transcription microservice listening on http://localhost:${PORT}/transcribe`);
  })
  .catch(e => {
    console.error('❌ Failed to load model:', e);
    process.exit(1);
  });

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    
    // Health check endpoint
    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response(transcriber ? 'OK' : 'LOADING', { status: transcriber ? 200 : 503 });
    }

    if (req.method === 'POST' && url.pathname === '/transcribe') {
      if (!transcriber) return new Response('Model is still loading, please wait...', { status: 503 });

      try {
        const arrayBuffer = await req.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Whisper requires 16kHz Float32 mono audio
        const wav = new WaveFile(buffer);
        wav.toBitDepth('32f');
        wav.toSampleRate(16000);

        let audioData = wav.getSamples();
        if (Array.isArray(audioData)) {
          // If stereo, convert to mono by averaging channels
          if (audioData.length > 1) {
            const SCALING_FACTOR = Math.sqrt(2);
            for (let i = 0; i < audioData[0].length; ++i) {
              audioData[0][i] = SCALING_FACTOR * (audioData[0][i] / 2 + audioData[1][i] / 2);
            }
          }
          audioData = audioData[0];
        }

        console.log(`🎙️ Transcribing audio chunk (${audioData.length} samples)...`);
        
        // Pass audio to Whisper and request word-level timestamps.
        // chunk_length_s is REQUIRED for audio longer than 30 seconds!
        const output = await transcriber(audioData, { 
          return_timestamps: 'word',
          chunk_length_s: 30,
          stride_length_s: 5
        });

        // Map the ONNX output to the pipeline's exact expected JSON format
        const timestamps = output.chunks.map((chunk: any) => ({
          word: chunk.text.trim(),
          startMs: Math.round(chunk.timestamp[0] * 1000),
          endMs: Math.round(chunk.timestamp[1] * 1000)
        }));

        console.log(`✅ Transcription complete: ${timestamps.length} words`);
        return Response.json(timestamps);
      } catch (e: any) {
        console.error('❌ Transcription error:', e);
        return new Response(e.message, { status: 500 });
      }
    }
    return new Response('Not found', { status: 404 });
  }
});
