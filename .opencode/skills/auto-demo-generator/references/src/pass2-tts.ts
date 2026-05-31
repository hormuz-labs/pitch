import { GoogleGenAI } from '@google/genai';
import mime from 'mime';
import fs from 'fs';
import path from 'path';
import { parseMimeType, createWavHeader } from './utils';

function preflight(demoDir: string): void {
  if (!process.env.GEMINI_API_KEY) throw new Error('[pass2-tts] GEMINI_API_KEY is not set.');
  if (!process.env.TRANSCRIPTION_SERVICE_URL) throw new Error('[pass2-tts] TRANSCRIPTION_SERVICE_URL is not set in .env');
  const scriptPath = path.join(demoDir, 'script.txt');
  if (!fs.existsSync(scriptPath)) throw new Error(`[pass2-tts] script.txt not found — run pass2-script first. Expected: ${scriptPath}`);
}

export async function pass2Tts(
  ai: GoogleGenAI,
  demoDir: string,
  voiceName: string = 'Puck'
): Promise<void> {
  preflight(demoDir);
  const voicePath = path.join(demoDir, 'voiceover.wav');
  const timestampsPath = path.join(demoDir, 'timestamps.json');

  if (fs.existsSync(voicePath) && fs.existsSync(timestampsPath)) {
    console.log('⏭️  [pass2-tts] voiceover.wav + timestamps.json already exist — skipping.');
    return;
  }

  const scriptText = fs.readFileSync(path.join(demoDir, 'script.txt'), 'utf8').trim();

  if (!fs.existsSync(voicePath)) {
    console.log('== Pass 3: TTS Voiceover Generation ==');
    const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const ttsReqBody = {
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ role: 'user', parts: [{ text: scriptText }] }],
      generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
    };

    const ttsRes = await fetch(ttsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ttsReqBody),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      throw new Error(`[pass2-tts] TTS API failed: ${ttsRes.status} ${errText}`);
    }

    const ttsData = await ttsRes.json();
    const inlineData = ttsData.candidates?.[0]?.content?.parts?.[0]?.inlineData || ttsData.inlineData;
    if (!inlineData?.data) {
      console.error(JSON.stringify(ttsData, null, 2));
      throw new Error('[pass2-tts] TTS response missing inlineData.');
    }

    let responseMimeType = 'audio/pcm;rate=24000';
    if (inlineData.mimeType) responseMimeType = inlineData.mimeType;

    const rawPcmBuffer = Buffer.from(inlineData.data, 'base64');
    let finalAudioBuffer: Buffer = rawPcmBuffer;
    if (mime.getExtension(responseMimeType) !== 'wav') {
      const options = parseMimeType(responseMimeType);
      finalAudioBuffer = Buffer.concat([createWavHeader(rawPcmBuffer.length, options), rawPcmBuffer]);
    }
    fs.writeFileSync(voicePath, finalAudioBuffer);
    console.log('✅ voiceover.wav saved.');
  } else {
    console.log('⏭️  [pass2-tts] voiceover.wav already exists — skipping TTS.');
  }

  if (!fs.existsSync(timestampsPath)) {
    console.log('== Pass 3: Transcription (Local Microservice) ==');
    const finalAudioBuffer = fs.readFileSync(voicePath);
    const transcribeRes = await fetch(process.env.TRANSCRIPTION_SERVICE_URL!, {
      method: 'POST',
      body: finalAudioBuffer,
      headers: { 'Content-Type': 'audio/wav' }
    });

    if (!transcribeRes.ok) {
      throw new Error(`[pass2-tts] Transcription service failed: ${transcribeRes.status} ${await transcribeRes.text()}`);
    }

    const timestamps = await transcribeRes.json();
    fs.writeFileSync(timestampsPath, JSON.stringify(timestamps, null, 2));
    console.log('✅ timestamps.json saved.');
  } else {
    console.log('⏭️  [pass2-tts] timestamps.json already exists — skipping transcription.');
  }
}
