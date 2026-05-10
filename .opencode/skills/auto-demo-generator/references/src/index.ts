import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
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

async function main() {
  await pass0(config, config.startUrl, DEMO_DIR);
  await pass1(config, config.startUrl, config.steps);
  await pass2(ai, config.userReq, config.steps, DEMO_DIR);
  await pass3(config, config.startUrl, config.steps, DEMO_DIR);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});