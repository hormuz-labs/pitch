import { GoogleGenAI } from '@google/genai';
import mime from 'mime';
import fs from 'fs';
import path from 'path';
import { DemoStep } from './types';
import { parseMimeType, createWavHeader } from './utils';

export async function pass2(ai: GoogleGenAI, userReq: string, demoSteps: DemoStep[], demoDir: string) {
  console.log("== Pass 2: Generating Speech & Timestamps ==");
  
  const flowDescriptions = demoSteps.map(s => `- ${s.id}: ${s.description}`).join('\n');
  const requiredKeys = demoSteps.map(s => s.id);

  const scriptPrompt = `
  Write a direct, concise voiceover script for a product demo video based on this requirement: "${userReq}".
  The video follows these steps sequentially: 
  ${flowDescriptions}
  
  CRITICAL PACING RULES:
  - DO NOT use conversational filler words, padding, or lengthy descriptions. Keep instructions bare and simple (e.g. "Click the search bar.", "Type nike shoes.").
  - To ensure there is a pause between actions, you MUST insert multiple ellipses (... ... ...) between the spoken instructions. This creates a natural silence in the voiceover so the actions have time to execute without adding unnecessary words.
  - Example: "Click the search bar. ... ... ... Now type nike shoes. ... ... ... Click the search button. ... ... ..."
  - The more ellipses you add, the longer the pause. Add at least three sets of ellipses between every single action.
  
  The script should be energetic and professional but minimal in word count. Do NOT include any stage directions like [clicks].
  `;
  const scriptRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: scriptPrompt });
  const scriptText = scriptRes.text!.trim();
  console.log("📝 Script:", scriptText);

  console.log("🎙️ Generating Voiceover...");
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-tts-preview',
    config: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } } },
    contents: [{ role: 'user', parts: [{ text: scriptText }] }],
  });

  let finalAudioBuffer: Buffer;
  let responseMimeType = 'audio/pcm;rate=24000';
  
  const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData || !inlineData.data) {
     throw new Error("Failed to get audio data from model");
  }
  if (inlineData.mimeType) responseMimeType = inlineData.mimeType;
  
  const rawPcmBuffer = Buffer.from(inlineData.data, 'base64');
  finalAudioBuffer = rawPcmBuffer;
  if (mime.getExtension(responseMimeType) !== 'wav') {
    const options = parseMimeType(responseMimeType);
    finalAudioBuffer = Buffer.concat([createWavHeader(rawPcmBuffer.length, options), rawPcmBuffer]);
  }
  fs.writeFileSync(path.join(demoDir, 'voiceover.wav'), finalAudioBuffer);

  console.log("📝 Transcribing Voiceover...");
  const transcribeRes = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
    model: 'gemini-2.5-flash',
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