import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { DemoConfig } from './types';
import { pass0 } from './pass0-intro';
import { pass1 } from './pass1-dry-run';
import { pass2 } from './pass2-voiceover';
import { pass3 } from './pass3-cinematic-record';

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}

/**
 * V4.4 Cinematic Pipeline Reference (Modularized Engine + JIT Layout)
 * Defines UI interactions via a JSON array.
 * Grabs live bounding boxes Just-In-Time (JIT) during recording
 * to perfectly handle dynamic layouts, ads, and responsive shifts.
 */

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- CONFIGURATION (Passed via JSON file as first CLI argument) ---
const configFile = process.argv[2];
if (!configFile || !fs.existsSync(configFile)) {
  throw new Error("Please provide a valid path to a configuration JSON file as the first argument.");
}

const DEMO_DIR = path.dirname(path.resolve(configFile));
if (!fs.existsSync(DEMO_DIR)) fs.mkdirSync(DEMO_DIR, { recursive: true });

const config: DemoConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));

if (!config.startUrl) throw new Error("config.startUrl is required.");
if (!config.userReq) throw new Error("config.userReq is required.");
if (!config.steps || config.steps.length === 0) throw new Error("config.steps is required and cannot be empty.");

// ── Phase reporting helper ────────────────────────────────────────────────────
// JOB_ID is injected by the worker prompt and must be available in the environment.
const JOB_ID = process.env.JOB_ID;

const PHASE_SEQUENCE = [
  'workspace_init',
  'selector_collection',
  'intro_sequence',
  'flow_validation',
  'voiceover_generation',
  'video_recording',
  'ffmpeg_postprocessing'
];

const completedPhases = new Set<string>();

/**
 * Reports a phase progress update to the backend via job-cli.
 * Auto-completes any prior phases if we are resuming from a later step.
 * FIRE-AND-FORGET: a failure here must NEVER abort the pipeline.
 */
function reportPhase(phase: string, status: 'running' | 'completed' | 'failed'): void {
  if (!JOB_ID) return; // running outside of a job context (e.g. local dev) — skip silently

  // If a later phase starts running or completes, retroactively mark all prior phases as completed
  const currentIndex = PHASE_SEQUENCE.indexOf(phase);
  if (currentIndex > 0) {
    for (let i = 0; i < currentIndex; i++) {
      const priorPhase = PHASE_SEQUENCE[i];
      if (!completedPhases.has(priorPhase)) {
        try {
          const repoRoot = path.resolve(__dirname, '../../..');
          execSync(
            `bun apps/job-cli/src/index.ts phase --job-id ${JOB_ID} --phase ${priorPhase} --status completed`,
            { cwd: repoRoot, stdio: 'inherit', timeout: 15000 }
          );
          completedPhases.add(priorPhase);
        } catch (e) {
          // ignore backfill errors
        }
      }
    }
  }

  try {
    const repoRoot = path.resolve(__dirname, '../../..');
    execSync(
      `bun apps/job-cli/src/index.ts phase --job-id ${JOB_ID} --phase ${phase} --status ${status}`,
      { cwd: repoRoot, stdio: 'inherit', timeout: 15000 }
    );
    if (status === 'completed') {
      completedPhases.add(phase);
    }
  } catch (e: any) {
    // Non-fatal: log and continue so the pipeline is never blocked by reporting
    console.warn(`[phase-reporter] Failed to report phase [${phase}=${status}]: ${e.message}`);
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
async function main() {
  // Phase 0.5 — Cinematic Intro
  reportPhase('intro_sequence', 'running');
  try {
    await pass0(config, config.startUrl, DEMO_DIR);
    reportPhase('intro_sequence', 'completed');
  } catch (e) {
    reportPhase('intro_sequence', 'failed');
    throw e;
  }

  // Phase 1 — Flow Validation
  reportPhase('flow_validation', 'running');
  try {
    await pass1(config, config.startUrl, config.steps);
    reportPhase('flow_validation', 'completed');
  } catch (e) {
    reportPhase('flow_validation', 'failed');
    throw e;
  }

  // Phase 2 + 2.5 — Voiceover Generation & Timeline Mapping
  reportPhase('voiceover_generation', 'running');
  try {
    await pass2(ai, config.userReq, config.steps, DEMO_DIR);
    reportPhase('voiceover_generation', 'completed');
  } catch (e) {
    reportPhase('voiceover_generation', 'failed');
    throw e;
  }

  // Phase 3 + 4 — Video Recording & FFmpeg Post-Processing
  reportPhase('video_recording', 'running');
  try {
    await pass3(config, config.startUrl, config.steps, DEMO_DIR);
    // pass3 includes FFmpeg post-processing internally — report both
    reportPhase('video_recording', 'completed');
    reportPhase('ffmpeg_postprocessing', 'running');
    reportPhase('ffmpeg_postprocessing', 'completed');
  } catch (e) {
    reportPhase('video_recording', 'failed');
    reportPhase('ffmpeg_postprocessing', 'failed');
    throw e;
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});