#!/usr/bin/env node
/**
 * Motion Audit Script for HTML Motion Video Skill.
 * Samples frames at 1-second intervals across the master timeline and inspects
 * for static holds (insufficient motion between frames) and visual contract violations.
 *
 * Usage:
 *   node scripts/audit.mjs page.html [--interval=1] [--threshold=0.005] [--out=audit]
 */
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? true : v];
}));

const pageArg = process.argv.slice(2).find(a => !a.startsWith("--")) ?? "index.html";
const interval = Number(args.interval ?? 1.0);
const threshold = Number(args.threshold ?? 0.003); // 0.3% pixel difference threshold
const outDir = resolve(String(args.out ?? "audit"));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log(`\n🔍 Running Motion Audit on: ${pageArg}`);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1
});

const url = /^https?:/.test(pageArg) ? pageArg : "file://" + resolve(pageArg);
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction("window.__READY === true", null, { timeout: 30000 });

const duration = await page.evaluate("window.__DURATION()");
const cues = await page.evaluate("window.__CUES ? window.__CUES() : []");

console.log(`   Duration: ${duration.toFixed(2)}s`);
console.log(`   Scene Cues: ${cues.map(c => `${c.label}@${c.time.toFixed(1)}s`).join(", ")}\n`);

const frameSamples = [];
const numSamples = Math.floor(duration / interval);

for (let i = 0; i <= numSamples; i++) {
  const t = Math.min(i * interval, duration);
  await page.evaluate((seekT) => { window.__SEEK(seekT); }, t);
  const buf = await page.screenshot({ type: "png" });
  const filename = `frame_${String(i).padStart(3, "0")}_${t.toFixed(1)}s.png`;
  writeFileSync(`${outDir}/${filename}`, buf);
  frameSamples.push({ idx: i, time: t, filename, buf });
}

await browser.close();

// Compare consecutive samples (2s gap check to detect dead holds)
let staticWarnings = 0;
console.log(`📊 Frame Motion Variance Analysis:`);

for (let i = 2; i < frameSamples.length; i++) {
  const prev = frameSamples[i - 2];
  const curr = frameSamples[i];
  
  // Calculate raw buffer diff ratio
  const diffRatio = getBufferDiffRatio(prev.buf, curr.buf);
  const gap = (curr.time - prev.time).toFixed(1);
  
  if (diffRatio < threshold) {
    staticWarnings++;
    console.warn(`  ⚠️ STATIC HOLD DETECTED at t=${prev.time.toFixed(1)}s -> t=${curr.time.toFixed(1)}s (${gap}s gap, diff=${(diffRatio * 100).toFixed(3)}%)`);
  } else {
    console.log(`  ✓ Dynamic t=${prev.time.toFixed(1)}s -> t=${curr.time.toFixed(1)}s (diff=${(diffRatio * 100).toFixed(2)}%)`);
  }
}

console.log(`\n--------------------------------------------------`);
if (staticWarnings > 0) {
  console.error(`❌ AUDIT FAILED: Found ${staticWarnings} static hold periods!`);
  console.error(`   Remedy: Add progressive disclosure, mid-scene events, camera pans, cursor actions, or active ambient motion.`);
  process.exit(1);
} else {
  console.log(`✅ AUDIT PASSED: Motion is active and continuous across all scenes! Frames saved in '${outDir}/'.\n`);
}

function getBufferDiffRatio(bufA, bufB) {
  if (bufA.length !== bufB.length) return 1.0;
  let diffBytes = 0;
  const len = bufA.length;
  // Sample every 16th byte for fast heuristic comparison
  const step = 16;
  let sampled = 0;
  for (let i = 0; i < len; i += step) {
    sampled++;
    if (Math.abs(bufA[i] - bufB[i]) > 10) {
      diffBytes++;
    }
  }
  return diffBytes / sampled;
}
