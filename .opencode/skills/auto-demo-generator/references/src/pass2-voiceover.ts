import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { DemoStep } from './types';
import { parseMimeType, createWavHeader } from './utils';

export async function pass2(ai: GoogleGenAI, userReq: string, demoSteps: DemoStep[], demoDir: string, voiceName = 'Puck') {
  console.log("== Pass 2: Generating Speech & Timestamps ==");
  
  const flowDescriptions = demoSteps.map(s => `- ${s.id}: ${s.description}`).join('\n');
  const requiredKeys = demoSteps.map(s => s.id);

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
  const scriptRes = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: scriptPrompt });
  const scriptText = scriptRes.text!.trim();
  console.log("📝 Script:", scriptText);

  console.log("🎙️ Generating Voiceover...");
  const ttsRes = await ai.models.generateContent({
    model: 'gemini-3.1-flash-tts-preview',
    contents: [{ role: 'user', parts: [{ text: scriptText }] }],
    config: {
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  });

  const inlineData = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) {
    console.error(JSON.stringify(ttsRes, null, 2));
    throw new Error('TTS response missing inlineData.');
  }

  const mimeType: string = inlineData.mimeType ?? 'audio/pcm;rate=24000';
  const rawPcmBuffer = Buffer.from(inlineData.data, 'base64');
  const options = parseMimeType(mimeType);
  const finalAudioBuffer = Buffer.concat([createWavHeader(rawPcmBuffer.length, options), rawPcmBuffer]);
  fs.writeFileSync(path.join(demoDir, 'voiceover.wav'), finalAudioBuffer);

  console.log("📝 Transcribing Voiceover...");
  const transcribeAi = new GoogleGenAI({ apiKey: process.env.GEMINI_TTS_API_KEY_2 });
  const transcribeRes = await transcribeAi.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'audio/wav', data: finalAudioBuffer.toString('base64') } },
        { text: 'Listen to the audio and provide a complete transcript. Each object must have keys: "word", "startMs", "endMs".' }
      ]
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            word: { type: "STRING" },
            startMs: { type: "NUMBER" },
            endMs: { type: "NUMBER" }
          },
          required: ["word", "startMs", "endMs"]
        }
      }
    }
  });

  fs.writeFileSync(path.join(demoDir, 'timestamps.json'), transcribeRes.text!);

  console.log("🧠 Mapping timeline...");
  const mappingPrompt = `
  You are mapping UI interactions to a voiceover timeline.
  Transcript: ${transcribeRes.text!}
  
  Actions:
  ${flowDescriptions}
  
  Output a JSON object with keys for each action ID. Values should be time in seconds (e.g., 2.500) indicating when the action should happen based on the semantic context of the transcript. Make sure actions are sequential.
  `;
  
  const properties: Record<string, { type: "NUMBER" }> = {};
  requiredKeys.forEach(k => properties[k] = { type: "NUMBER" });

  const mappingRes = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: mappingPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties, required: requiredKeys }
    }
  });

  const timeline = JSON.parse(mappingRes.text!.trim());
  fs.writeFileSync(path.join(demoDir, 'timeline.json'), JSON.stringify(timeline, null, 2));
  console.log("✅ Timeline mapped natively via JSON rules.");
}