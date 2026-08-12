#!/usr/bin/env node
/**
 * Motion Audit Script for HTML Motion Video Skill.
 * Samples frames at 1-second intervals across the master timeline and inspects
 * for static holds (insufficient motion between frames) and visual contract violations.
n * Also checks scene overlap: at every scene's midpoint, only that scene may be
 * visible — a scene that never fades out fails the audit.
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
const rawCues = await page.evaluate("window.__CUES ? window.__CUES() : []");
// Accept both canonical shapes: [{label, time}] and {label: time}
const cues = (Array.isArray(rawCues)
  ? rawCues
  : Object.entries(rawCues).map(([label, time]) => ({ label, time })))
  .filter(c => typeof c.time === "number" && Number.isFinite(c.time))
  .sort((a, b) => a.time - b.time);

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

// Scene-visibility check: at each scene's midpoint, ONLY that scene may be
// visible. A scene that never fades out accumulates under every later scene
// (the "scenes overlapping" bug) — this fails the build before render.
const OPACITY_THRESHOLD = 0.05; // non-active scenes must be below this
let overlapWarnings = 0;

if (cues.length > 1) {
  console.log(`🎭 Scene Overlap Analysis (mid-scene visibility):`);
  for (let i = 0; i < cues.length; i++) {
    const start = cues[i].time;
    const end = i + 1 < cues.length ? cues[i + 1].time : duration;
    const mid = start + (end - start) / 2;
    await page.evaluate((seekT) => { window.__SEEK(seekT); }, mid);
    const vis = await page.evaluate(() => {
      let scenes = [...document.querySelectorAll(".scene[id]")];
      if (!scenes.length) scenes = [...document.querySelectorAll("#camera > div[id]")];
      return scenes.map(el => {
        const cs = getComputedStyle(el);
        return { id: el.id, opacity: parseFloat(cs.opacity), visibility: cs.visibility };
      });
    });
    if (!vis.length) {
      console.log("  (no .scene elements found — skipping overlap check)");
      break;
    }
    // Identify the active scene element: match cue label to element id,
    // falling back to positional order.
    let activeIdx = vis.findIndex(s => s.id === cues[i].label);
    if (activeIdx === -1) activeIdx = Math.min(i, vis.length - 1);
    const offenders = [];
    vis.forEach((s, j) => {
      const effective = s.visibility === "hidden" ? 0 : s.opacity;
      if (j === activeIdx) {
        if (effective < 0.5) {
          overlapWarnings++;
          console.warn(`  ⚠️ ACTIVE SCENE INVISIBLE at t=${mid.toFixed(1)}s: #${s.id} opacity=${effective.toFixed(2)} at its own midpoint`);
        }
      } else if (effective >= OPACITY_THRESHOLD) {
        overlapWarnings++;
        offenders.push(`#${s.id} (opacity=${effective.toFixed(2)})`);
      }
    });
    if (offenders.length) {
      console.warn(`  ⚠️ SCENE OVERLAP at t=${mid.toFixed(1)}s (${cues[i].label} active): still visible → ${offenders.join(", ")}`);
    } else {
      console.log(`  ✓ Clean t=${mid.toFixed(1)}s: only ${cues[i].label} visible`);
    }
  }
  console.log("");
} else {
  const sceneCount = await page.evaluate(() =>
    document.querySelectorAll(".scene[id], #camera > div[id]").length);
  if (sceneCount > 1) {
    console.log(`🎭 Scene Overlap Analysis: SKIPPED — ${sceneCount} scenes in the DOM but __CUES() exposes fewer than 2 scene labels.`);
    console.log(`   Add one master.addLabel("sceneN", ...) per scene so the overlap check (and segment renders) can locate scene windows.\n`);
  }
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
let failed = false;
if (staticWarnings > 0) {
  failed = true;
  console.error(`❌ Found ${staticWarnings} static hold period(s)!`);
  console.error(`   Remedy: Add progressive disclosure, mid-scene events, camera pans, cursor actions, or active ambient motion.`);
}
if (overlapWarnings > 0) {
  failed = true;
  console.error(`❌ Found ${overlapWarnings} scene-visibility violation(s)!`);
  console.error(`   Remedy: In master.js, fade EVERY scene out (autoAlpha: 0) at the end of its own time window — never rely on the next scene covering it. Each scene must also start hidden and fade in at its label.`);
}
if (failed) {
  console.error(`❌ AUDIT FAILED`);
  process.exit(1);
} else {
  console.log(`✅ AUDIT PASSED: Motion is active and continuous, and scenes do not overlap. Frames saved in '${outDir}/'.\n`);
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
