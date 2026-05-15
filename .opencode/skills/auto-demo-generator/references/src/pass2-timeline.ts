import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { DemoStep } from './types';

// ── Preflight ────────────────────────────────────────────────────────────────
function preflight(demoDir: string): void {
  if (!process.env.GEMINI_API_KEY) throw new Error('[pass2-timeline] GEMINI_API_KEY is not set.');
  const timestampsPath = path.join(demoDir, 'timestamps.json');
  if (!fs.existsSync(timestampsPath)) throw new Error(`[pass2-timeline] timestamps.json not found — run pass2-tts first. Expected: ${timestampsPath}`);
}

/**
 * Pass 4 — Timeline Mapping
 * Inputs:  timestamps.json
 * Outputs: timeline.json
 * Skips if timeline.json already exists.
 */
export async function pass2Timeline(
  ai: GoogleGenAI,
  demoSteps: DemoStep[],
  demoDir: string
): Promise<void> {
  preflight(demoDir);

  const timelinePath = path.join(demoDir, 'timeline.json');
  if (fs.existsSync(timelinePath)) {
    console.log('⏭️  [pass2-timeline] timeline.json already exists — skipping.');
    return;
  }

  console.log('== Pass 4: Timeline Mapping ==');
  const flowDescriptions = demoSteps.map(s => `- ${s.id}: ${s.description}`).join('\n');
  const requiredKeys = demoSteps.map(s => s.id);
  const transcriptText = fs.readFileSync(path.join(demoDir, 'timestamps.json'), 'utf8');

  const mappingPrompt = `
  You are mapping UI interactions to a voiceover timeline.
  Transcript: ${transcriptText}

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
  fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));
  console.log('✅ timeline.json saved.');
}
