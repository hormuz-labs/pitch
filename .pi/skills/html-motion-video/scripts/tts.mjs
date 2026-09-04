#!/usr/bin/env node
/**
 * Gemini TTS narration generator. Requires GEMINI_API_KEY (env var, or a .env
 * file in the CWD or any parent directory) and ffmpeg.
 *
 * ONE CONTINUOUS READ. The whole script is spoken in a single call so the
 * voice keeps one breath, one arc and natural sentence-to-sentence flow.
 * Per-shot clips (a call per line) restart the intonation every 2–3 seconds
 * and leave dead air between them — that is the "robotic" sound. Never
 * generate narration line by line.
 *
 * Usage:
 *   node tts.mjs --script=audio/vo.txt --out=audio/vo.wav \
 *                [--voice=Aoede] [--style="warm, confident, unhurried; one flowing read"] \
 *                [--model=gemini-2.5-flash-preview-tts]
 *   node tts.mjs --text="…the whole script…" --out=audio/vo.wav
 *
 * Writes the WAV and the exact text spoken next to it (audio/vo.txt) so
 * align.mjs can time every word. --style is a natural-language delivery
 * direction (pace, emotion, register) that Gemini interprets without reading
 * it aloud; the arc of the read (drawing-in → proud → inviting) is written
 * into the script's punctuation and phrasing, not into separate clips.
 *
 * Voices: Aoede (bright/clear), Kore (warm), Leda (sleek/smooth),
 * Charon (deep male). Models: gemini-2.5-flash-preview-tts (default, the
 * most continuous read in our measurements), gemini-3.1-flash-tts-preview
 * (more expressive, longer sentence breaks), gemini-2.5-pro-preview-tts.
 * Output: 24kHz mono WAV.
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
let text    = args.text;
if (!text && args.script) {
  if (!existsSync(args.script)) { console.error(`--script file not found: ${args.script}`); process.exit(1); }
  text = readFileSync(args.script, "utf8");
}
text = text ? text.replace(/\s+/g, " ").trim() : text;
const out   = args.out ?? "audio/vo.wav";
const voice = args.voice ?? "Aoede";
const style = args.style;
const model = args.model ?? "gemini-2.5-flash-preview-tts";
if (!text) { console.error("--text or --script is required"); process.exit(1); }
const wordCount = text.split(/\s+/).filter(Boolean).length;
if (wordCount < 12 && !args.allow_short) {
  console.error(`Refusing a ${wordCount}-word clip: narration is ONE continuous read of the whole script (pass --allow_short=1 for a deliberate single-line film).`);
  process.exit(1);
}

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
const dur = Number(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim());
const txt = out.replace(/\.\w+$/, "") + ".txt";
writeFileSync(txt, text + "\n");
console.log(`Wrote ${out} (${dur.toFixed(2)}s, ${wordCount} words, ${(wordCount / dur).toFixed(2)} words/s, voice=${voice}, model=${model})`);
console.log(`Script saved to ${txt}. Next: align.mjs --vo=${out} → cue the shots → sync.mjs --write`);
const wps = wordCount / dur;
if (wps > 2.45) console.log(`⚠ RUSHED read (${wps.toFixed(2)} words/s). A narrator sounds human at 1.9–2.4 words/s. Do NOT keep this: re-record with an unhurried, conversational style — the picture carries the energy, the voice never sprints.`);
if (wps < 1.6) console.log("⚠ very slow read (< 1.6 words/s) — ask for a natural conversational pace, or cut copy.");
