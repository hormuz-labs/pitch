import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { DemoStep } from './types';
import { parseMimeType, createWavHeader, splitScriptIntoChunks } from './utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TTS_CONCURRENCY = 3;        // max parallel Gemini TTS requests
const TARGET_CHUNK_WORDS = 75;    // ~30 s of speech at ~2.5 words/s

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Call Gemini TTS for a single text chunk via the SDK. Returns raw PCM Buffer + mimeType. */
async function generateTtsChunk(
  ai: GoogleGenAI,
  text: string,
  voiceName: string,
): Promise<{ pcm: Buffer; mimeType: string }> {
  const res = await ai.models.generateContent({
    model: 'gemini-3.1-flash-tts-preview',
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  });

  const inlineData = res.candidates?.[0]?.content?.parts?.[0]?.inlineData;

  if (!inlineData?.data) {
    console.error(JSON.stringify(res, null, 2));
    throw new Error('TTS response missing inlineData.');
  }

  const mimeType: string = inlineData.mimeType ?? 'audio/pcm;rate=24000';
  const pcm = Buffer.from(inlineData.data, 'base64');
  return { pcm, mimeType };
}

/**
 * Wrap a raw PCM buffer in a WAV header (no-op if already WAV).
 * All chunks from Gemini TTS use the same sample-rate / channel layout, so
 * we can safely concatenate the raw PCM data and build a single WAV header
 * over the combined payload.
 */
function pcmToWav(pcm: Buffer, mimeType: string): { wav: Buffer; options: ReturnType<typeof parseMimeType> } {
  const options = parseMimeType(mimeType);
  const wav = Buffer.concat([createWavHeader(pcm.length, options), pcm]);
  return { wav, options };
}

/**
 * Run an array of async tasks with a fixed concurrency cap.
 * Returns results in the same order as the input array.
 */
async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Transcription helper — calls Gemini with a single WAV chunk
// ---------------------------------------------------------------------------
async function transcribeChunk(
  ai: GoogleGenAI,
  wavBuffer: Buffer,
  offsetMs: number,
): Promise<Array<{ word: string; startMs: number; endMs: number }>> {
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: wavBuffer.toString('base64'),
            },
          },
          {
            text: 'Listen to the audio and provide a complete transcript. Each object must have keys: "word", "startMs", "endMs". Times are relative to the start of this audio clip.',
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            word: { type: 'STRING' },
            startMs: { type: 'NUMBER' },
            endMs: { type: 'NUMBER' },
          },
          required: ['word', 'startMs', 'endMs'],
        },
      },
    },
  });

  const words: Array<{ word: string; startMs: number; endMs: number }> =
    JSON.parse(res.text!);

  // Shift all timestamps by the chunk's offset so they are absolute
  return words.map(w => ({
    word: w.word,
    startMs: w.startMs + offsetMs,
    endMs: w.endMs + offsetMs,
  }));
}

// ---------------------------------------------------------------------------
// Compute the duration of a WAV buffer (excluding the 44-byte header)
// ---------------------------------------------------------------------------
function wavDurationMs(pcmLength: number, sampleRate: number, bitsPerSample: number, numChannels: number): number {
  const bytesPerSample = bitsPerSample / 8;
  const bytesPerMs = (sampleRate * numChannels * bytesPerSample) / 1000;
  return pcmLength / bytesPerMs;
}

// ---------------------------------------------------------------------------
// Main pass2 export
// ---------------------------------------------------------------------------
export async function pass2(
  ai: GoogleGenAI,
  userReq: string,
  demoSteps: DemoStep[],
  demoDir: string,
  voiceName = 'Puck',
) {
  console.log('== Pass 2: Generating Speech & Timestamps ==');

  const flowDescriptions = demoSteps.map(s => `- ${s.id}: ${s.description}`).join('\n');
  const requiredKeys = demoSteps.map(s => s.id);

  // ── 1. Generate voiceover script ─────────────────────────────────────────
  const scriptPrompt = `
  Write a natural, engaging voiceover script for a product demo video based on this requirement: "${userReq}".
  The video follows these steps sequentially: 
  ${flowDescriptions}
  
  CRITICAL PACING AND TONE RULES:
  - The tone should be friendly, professional, and conversational. Speak as if you are an expert presenter enthusiastically showing off a cool product or feature.
  - Instead of robotic instructions (e.g. "Click the search bar. Type nike."), narrate the journey naturally and explain the value or result (e.g. "Let's start by heading over to the search bar so we can find exactly what we need. We'll type in Nike shoes and see what comes up.").
  - Only insert a single ellipsis (...) when two UI actions happen back-to-back with no natural speaking gap between them — this gives the automation just enough time to execute. Do NOT add ellipses between sentences that already have natural pacing or where there is narration bridging the actions.
  - Example: "Let's dive right in by hitting the search bar. We'll look for Nike shoes to see the latest drops. ... And just click search to see the awesome results."
  
  Do NOT include any stage directions or markdown like [clicks] or **bold**.
  `;
  const scriptRes = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: scriptPrompt,
  });
  const scriptText = scriptRes.text!.trim();
  console.log('📝 Script:', scriptText);

  // ── 2. Split script into ~30-second chunks ────────────────────────────────
  const chunks = splitScriptIntoChunks(scriptText, TARGET_CHUNK_WORDS);
  console.log(`🔀 Script split into ${chunks.length} chunk(s) for TTS.`);

  // ── 3. Generate TTS for all chunks (concurrency = TTS_CONCURRENCY) ────────
  console.log('🎙️ Generating Voiceover (chunked)...');
  const ttsTasks = chunks.map(
    (chunk, i) => () => {
      console.log(`  → TTS chunk ${i + 1}/${chunks.length}`);
      return generateTtsChunk(ai, chunk, voiceName);
    },
  );
  const ttsResults = await pLimit(ttsTasks, TTS_CONCURRENCY);

  // ── 4. Build per-chunk WAV buffers and compute byte/time offsets ──────────
  type ChunkMeta = {
    pcm: Buffer;
    wav: Buffer;
    options: ReturnType<typeof parseMimeType>;
    durationMs: number;
    offsetMs: number;
  };

  const chunkMetas: ChunkMeta[] = [];
  let cumulativeOffsetMs = 0;

  for (const { pcm, mimeType } of ttsResults) {
    const { wav, options } = pcmToWav(pcm, mimeType);
    const durationMs = wavDurationMs(pcm.length, options.sampleRate, options.bitsPerSample, options.numChannels);
    chunkMetas.push({ pcm, wav, options, durationMs, offsetMs: cumulativeOffsetMs });
    cumulativeOffsetMs += durationMs;
  }

  // ── 5. Stitch all PCM payloads into one WAV file ──────────────────────────
  // All chunks share the same encoding (same Gemini TTS model/voice), so we
  // concatenate the raw PCM data and emit a single WAV header.
  const combinedPcm = Buffer.concat(chunkMetas.map(c => c.pcm));
  const sharedOptions = chunkMetas[0].options;
  const finalAudioBuffer = Buffer.concat([
    createWavHeader(combinedPcm.length, sharedOptions),
    combinedPcm,
  ]);
  fs.writeFileSync(path.join(demoDir, 'voiceover.wav'), finalAudioBuffer);
  console.log(`✅ voiceover.wav written (${(finalAudioBuffer.length / 1024).toFixed(1)} KB, ${(cumulativeOffsetMs / 1000).toFixed(1)}s)`);

  // ── 6. Transcribe each chunk in parallel (concurrency = TTS_CONCURRENCY) ──
  console.log('📝 Transcribing Voiceover (chunked)...');
  const transcribeTasks = chunkMetas.map(
    ({ wav, offsetMs }, i) =>
      () => {
        console.log(`  → Transcribing chunk ${i + 1}/${chunkMetas.length} (offset ${offsetMs.toFixed(0)} ms)`);
        return transcribeChunk(ai, wav, offsetMs);
      },
  );
  const transcribeResults = await pLimit(transcribeTasks, TTS_CONCURRENCY);

  // Flatten all word-level results into one sorted array
  const allWords = transcribeResults
    .flat()
    .sort((a, b) => a.startMs - b.startMs);

  fs.writeFileSync(path.join(demoDir, 'timestamps.json'), JSON.stringify(allWords, null, 2));
  console.log(`✅ timestamps.json written (${allWords.length} words)`);

  // ── 7. Map UI actions to the voiceover timeline ───────────────────────────
  console.log('🧠 Mapping timeline...');
  const mappingPrompt = `
  You are mapping UI interactions to a voiceover timeline.
  Transcript: ${JSON.stringify(allWords)}
  
  Actions:
  ${flowDescriptions}
  
  Output a JSON object with keys for each action ID. Values should be time in seconds (e.g., 2.500) indicating when the action should happen based on the semantic context of the transcript. Make sure actions are sequential.
  `;

  const properties: Record<string, { type: 'NUMBER' }> = {};
  requiredKeys.forEach(k => (properties[k] = { type: 'NUMBER' }));

  const mappingRes = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: mappingPrompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties, required: requiredKeys },
    },
  });

  const timeline = JSON.parse(mappingRes.text!.trim());
  fs.writeFileSync(path.join(demoDir, 'timeline.json'), JSON.stringify(timeline, null, 2));
  console.log('✅ Timeline mapped natively via JSON rules.');
}
