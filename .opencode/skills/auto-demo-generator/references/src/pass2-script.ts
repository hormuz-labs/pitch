import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { DemoStep } from './types';

// ── Preflight ────────────────────────────────────────────────────────────────
function preflight(demoDir: string): void {
  if (!process.env.GEMINI_API_KEY) throw new Error('[pass2-script] GEMINI_API_KEY is not set.');
  if (!fs.existsSync(demoDir)) throw new Error(`[pass2-script] demoDir does not exist: ${demoDir}`);
}

/**
 * Pass 2 — Script Generation
 * Outputs: script.txt
 * Skips if script.txt already exists.
 */
export async function pass2Script(
  ai: GoogleGenAI,
  userReq: string,
  demoSteps: DemoStep[],
  demoDir: string
): Promise<string> {
  preflight(demoDir);

  const scriptPath = path.join(demoDir, 'script.txt');
  if (fs.existsSync(scriptPath)) {
    const cached = fs.readFileSync(scriptPath, 'utf8').trim();
    console.log('⏭️  [pass2-script] script.txt already exists — skipping.');
    console.log('📝 Script:', cached);
    return cached;
  }

  console.log('== Pass 2: Script Generation ==');
  const flowDescriptions = demoSteps.map(s => `- ${s.id}: ${s.description}`).join('\n');

  const scriptPrompt = `
  Write a natural, engaging voiceover script for a product demo video based on this requirement: "${userReq}".
  The video follows these steps sequentially:
  ${flowDescriptions}

  CRITICAL PACING AND TONE RULES:
  - The tone should be friendly, professional, and conversational. Speak as if you are an expert presenter enthusiastically showing off a cool product or feature.
  - Instead of robotic instructions (e.g. "Click the search bar. Type nike."), narrate the journey naturally and explain the value or result.
  - Only insert a single ellipsis (...) when two UI actions happen back-to-back with no natural speaking gap between them. Do NOT add ellipses between sentences that already have natural pacing.
  - Example: "Let's dive right in by hitting the search bar. We'll look for Nike shoes to see the latest drops. ... And just click search to see the awesome results."

  Do NOT include any stage directions or markdown like [clicks] or **bold**.
  `;

  const scriptRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: scriptPrompt });
  const scriptText = scriptRes.text!.trim();
  fs.writeFileSync(scriptPath, scriptText);
  console.log('✅ script.txt saved.');
  console.log('📝 Script:', scriptText);
  return scriptText;
}
