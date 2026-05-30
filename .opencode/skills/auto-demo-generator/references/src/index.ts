import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { DemoConfig } from './types';
import { pass0 } from './pass0-intro';
import { generateOutro } from './pass0-outro';
import { pass1 } from './pass1-dry-run';
import { pass2Script } from './pass2-script';
import { pass2Tts } from './pass2-tts';
import { pass2Timeline } from './pass2-timeline';
import { pass3Record } from './pass3-record';
import { pass4Ffmpeg } from './pass4-ffmpeg';

dotenv.config();

// ── Global preflight ──────────────────────────────────────────────────────────
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is not set. Aborting.');
  process.exit(1);
}
if (!process.env.TRANSCRIPTION_SERVICE_URL) {
  console.error('❌ TRANSCRIPTION_SERVICE_URL is not set in .env. Aborting.');
  process.exit(1);
}

const configFile = process.argv[2];
if (!configFile || !fs.existsSync(configFile)) {
  console.error('❌ Usage: bun run src/index.ts <path-to-demo-config.json>');
  process.exit(1);
}

// DEMO_DIR is the directory containing demo-config.json.
// All intermediate artifacts (script.txt, voiceover.wav, …) land here.
const DEMO_DIR = path.dirname(path.resolve(configFile));
if (!fs.existsSync(DEMO_DIR)) fs.mkdirSync(DEMO_DIR, { recursive: true });

const config: DemoConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));

if (!config.startUrl)    { console.error('❌ config.startUrl is required.');              process.exit(1); }
if (!config.userReq)     { console.error('❌ config.userReq is required.');               process.exit(1); }
if (!config.steps?.length) { console.error('❌ config.steps must be a non-empty array.'); process.exit(1); }

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Strict Preflight Checks ───────────────────────────────────────────────────
const cursorStyle = config.cursorStyle || 'black';
const cursorFile = path.join(DEMO_DIR, 'assets', 'icons', `cursor-${cursorStyle}.svg`);
if (!fs.existsSync(cursorFile)) {
  console.error(`❌ Missing cursor SVG! Expected: ${cursorFile}\nDid you forget to copy the assets/ directory?`);
  process.exit(1);
}

const clickSfx = path.join(DEMO_DIR, 'assets', 'sounds', 'click.mp3');
const keySfx = path.join(DEMO_DIR, 'assets', 'sounds', 'keyboard.mp3');
if (!fs.existsSync(clickSfx) || !fs.existsSync(keySfx)) {
  console.error(`❌ Missing SFX files! Expected:\n- ${clickSfx}\n- ${keySfx}\nDid you forget to copy the assets/ directory?`);
  process.exit(1);
}

// ── Phase reporting ───────────────────────────────────────────────────────────
const JOB_ID = process.env.JOB_ID;

const PHASE_SEQUENCE = [
  'workspace_init',
  'selector_collection',
  'intro_sequence',
  'flow_validation',
  'voiceover_generation',
  'video_recording',
  'ffmpeg_postprocessing',
];

const completedPhases = new Set<string>();

function reportPhase(phase: string, status: 'running' | 'completed' | 'failed'): void {
  if (!JOB_ID) return;

  // Retroactively mark all prior phases completed when resuming mid-pipeline
  const currentIndex = PHASE_SEQUENCE.indexOf(phase);
  if (currentIndex > 0) {
    for (let i = 0; i < currentIndex; i++) {
      const prior = PHASE_SEQUENCE[i];
      if (!completedPhases.has(prior)) {
        try {
          const root = path.resolve(__dirname, '../../..');
          execSync(`bun apps/job-cli/src/index.ts phase --job-id ${JOB_ID} --phase ${prior} --status completed`, { cwd: root, stdio: 'inherit', timeout: 15000 });
          completedPhases.add(prior);
        } catch { /* non-fatal */ }
      }
    }
  }

  try {
    const root = path.resolve(__dirname, '../../..');
    execSync(`bun apps/job-cli/src/index.ts phase --job-id ${JOB_ID} --phase ${phase} --status ${status}`, { cwd: root, stdio: 'inherit', timeout: 15000 });
    if (status === 'completed') completedPhases.add(phase);
  } catch (e: any) {
    console.warn(`[phase-reporter] Failed to report [${phase}=${status}]: ${e.message}`);
  }
}

// ── Resume helpers ─────────────────────────────────────────────────────────────
function artifactFile(name: string): string { return path.join(DEMO_DIR, name); }

function artifactExists(name: string): boolean {
  const file = artifactFile(name);
  if (!fs.existsSync(file)) return false;
  // Binary outputs (mp4, wav, webm, png) just need to exist
  const binaryExts = ['.mp4', '.wav', '.webm', '.png'];
  if (binaryExts.some(ext => name.endsWith(ext))) return true;
  // Text artifacts: read content to verify integrity
  try {
    const content = fs.readFileSync(file, 'utf8').trim();
    if (content.length === 0) return false;
    return content.startsWith('/') ? fs.existsSync(content) : true;
  } catch { return false; }
}

function removeArtifact(name: string): void {
  const file = artifactFile(name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// ── Pipeline ──────────────────────────────────────────────────────────────────
async function main() {
  // ── Async Preflight: Check Transcription Service Health ────────────────────
  try {
    const healthUrl = new URL('/health', process.env.TRANSCRIPTION_SERVICE_URL!).toString();
    const healthRes = await fetch(healthUrl, { method: 'GET' });
    if (!healthRes.ok) {
      if (healthRes.status === 503) {
        console.error('❌ Transcription service is running but model is still loading into memory. Wait a moment and retry.');
      } else {
        console.error(`❌ Transcription service returned HTTP ${healthRes.status}`);
      }
      process.exit(1);
    }
  } catch (e: any) {
    console.error(`❌ Transcription service at ${process.env.TRANSCRIPTION_SERVICE_URL} is unreachable! Start it first before running jobs. (${e.message})`);
    process.exit(1);
  }

  // Pass 0 — Cinematic Intro
  if (artifactExists('intro-path.txt')) {
    console.log('⏭️  [resume] Intro already exists — skipping.');
    reportPhase('intro_sequence', 'completed');
  } else {
    reportPhase('intro_sequence', 'running');
    try {
      await pass0(config, config.startUrl, DEMO_DIR);
      reportPhase('intro_sequence', 'completed');

      // Upload thumbnail immediately so the dashboard shows a branded preview
      // while the rest of the pipeline is still running.
      if (JOB_ID) {
        const thumbnailPathFile = path.join(DEMO_DIR, 'thumbnail-path.txt');
        if (fs.existsSync(thumbnailPathFile)) {
          const thumbnailFile = fs.readFileSync(thumbnailPathFile, 'utf8').trim();
          if (fs.existsSync(thumbnailFile)) {
            try {
              const root = path.resolve(__dirname, '../../..');
              execSync(`bun apps/job-cli/src/index.ts thumbnail --job-id ${JOB_ID} --file "${thumbnailFile}"`, { cwd: root, stdio: 'inherit', timeout: 30000 });
              console.log('✅ Thumbnail uploaded.');
            } catch (e: any) { console.warn(`⚠️  Thumbnail upload failed (non-fatal): ${e.message}`); }
          }
        }
      }
    } catch (e) { reportPhase('intro_sequence', 'failed'); throw e; }
  }

  // Pass 0.5 — Cinematic Outro
  if (artifactExists('outro-path.txt')) {
    console.log('⏭️  [resume] Outro already exists — skipping.');
  } else {
    try {
      await generateOutro(config, DEMO_DIR);
    } catch (e: any) { console.warn(`⚠️ Outro generation failed (non-fatal): ${e.message}`); }
  }

  // Pass 1 — Flow Validation (always re-run — fast and cheap)
  reportPhase('flow_validation', 'running');
  try {
    await pass1(config, config.startUrl, config.steps);
    reportPhase('flow_validation', 'completed');
  } catch (e) { reportPhase('flow_validation', 'failed'); throw e; }

  // Pass 2 — Script Generation
  if (artifactExists('script.txt')) {
    console.log('⏭️  [resume] Script already exists — skipping.');
  } else {
    reportPhase('voiceover_generation', 'running');
    try {
      await pass2Script(ai, config.userReq, config.steps, DEMO_DIR);
    } catch (e) { reportPhase('voiceover_generation', 'failed'); throw e; }
  }

  // Pass 3 — TTS + Transcription
  if (artifactExists('voiceover.wav') && artifactExists('timestamps.json')) {
    console.log('⏭️  [resume] Voiceover + transcription already exist — skipping.');
  } else {
    try {
      await pass2Tts(ai, DEMO_DIR, config.voice ?? 'Puck');
    } catch (e) { reportPhase('voiceover_generation', 'failed'); throw e; }
  }

  // Pass 4 — Timeline Mapping
  if (artifactExists('timeline.json')) {
    console.log('⏭️  [resume] Timeline already exists — skipping.');
  } else {
    try {
      await pass2Timeline(ai, config.steps, DEMO_DIR);
      reportPhase('voiceover_generation', 'completed');
    } catch (e) { reportPhase('voiceover_generation', 'failed'); throw e; }
  }

  // Pass 5 — Raw Video Recording
  if (artifactExists('raw-video-path.txt')) {
    console.log('⏭️  [resume] Raw video already recorded — skipping.');
    reportPhase('video_recording', 'completed');
  } else {
    reportPhase('video_recording', 'running');
    try {
      await pass3Record(config, config.startUrl, config.steps, DEMO_DIR);
      reportPhase('video_recording', 'completed');
    } catch (e) { reportPhase('video_recording', 'failed'); throw e; }
  }

  // Pass 6 — FFmpeg Post-Processing
  const outputFilename = config.outputPath || 'demo-final.mp4';
  if (artifactExists(outputFilename)) {
    console.log('⏭️  [resume] Final video already exists — skipping.');
    console.log(`✨ Final video: ${artifactFile(outputFilename)}`);
    reportPhase('ffmpeg_postprocessing', 'completed');
  } else {
    reportPhase('ffmpeg_postprocessing', 'running');
    try {
      await pass4Ffmpeg(config, config.steps, DEMO_DIR);
      reportPhase('ffmpeg_postprocessing', 'completed');
      console.log('🎉 Demo pipeline completed successfully!');
      process.exit(0);
    } catch (e) { reportPhase('ffmpeg_postprocessing', 'failed'); throw e; }
  }
}

main().catch(e => {
  console.error(e);
  
  // Try to send telegram alert on total failure
  try {
    const root = path.resolve(__dirname, '../../..');
    const msg = `🚨 Fatal Pipeline Crash for Job ${JOB_ID || 'Unknown'}: ${e.message}`;
    execSync(`bun run .opencode/skills/auto-demo-generator/references/scripts/notify.ts --message "${msg}"`, { cwd: root, stdio: 'inherit', timeout: 15000 });
  } catch (notifyErr) {
    console.warn(`Failed to send telegram crash report:`, notifyErr);
  }
  
  process.exit(1);
});
