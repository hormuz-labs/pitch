#!/usr/bin/env node
/**
 * Gemini TTS voiceover generator. Requires GEMINI_API_KEY (env var, or a .env
 * file in the CWD or any parent directory) and ffmpeg.
 *
 * Usage:
 *   node tts.mjs --text="Meet the Digital Dirham." --out=audio/vo_hero.wav \
 *                [--voice=Aoede] [--style="warm, proud, unveiling, measured pace"] \
 *                [--model=gemini-2.5-flash-preview-tts]
 *
 * --style is a natural-language delivery direction (pace, emotion, register).
 * It is prepended as a spoken-style instruction, which Gemini TTS interprets
 * without reading it aloud. Give every clip a scene-specific style.
 *
 * Voices: Aoede (bright/clear), Kore (warm), Leda (sleek/smooth),
 * Charon (deep male). Output: 24kHz mono WAV.
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

let key = process.env.GEMINI_API_KEY;
if (!key) {
  // Walk up from CWD looking for a .env with GEMINI_API_KEY (repo root has one)
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const p = join(dir, ".env");
    if (existsSync(p)) {
      const m = readFileSync(p, "utf8").match(/^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)/m);
      if (m) { key = m[1].trim(); break; }
    }
    if (dirname(dir) === dir) break;
  }
}
if (!key) { console.error("GEMINI_API_KEY not set and no .env found. Export GEMINI_API_KEY=..."); process.exit(1); }

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const i = a.indexOf("="); return [a.slice(2, i), a.slice(i + 1)];
}));
const text  = args.text;
const out   = args.out ?? "vo.wav";
const voice = args.voice ?? "Aoede";
const style = args.style;
const model = args.model ?? "gemini-2.5-flash-preview-tts";
if (!text) { console.error("--text is required"); process.exit(1); }

const prompt = style ? `Say the following in a ${style} way: ${text}` : text;

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  }
);
if (!res.ok) { console.error(`Gemini TTS HTTP ${res.status}: ${await res.text()}`); process.exit(1); }
const json = await res.json();
const b64 = json?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
if (!b64) { console.error("No audio in response:", JSON.stringify(json).slice(0, 500)); process.exit(1); }

// Gemini TTS returns raw 16-bit PCM @ 24kHz mono — wrap it into a WAV via ffmpeg.
mkdirSync(dirname(resolve(out)), { recursive: true });
const raw = out + ".pcm";
writeFileSync(raw, Buffer.from(b64, "base64"));
execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${raw}" "${out}"`, { stdio: "pipe" });
rmSync(raw);
const dur = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
console.log(`Wrote ${out} (${Number(dur).toFixed(2)}s, voice=${voice})`);
