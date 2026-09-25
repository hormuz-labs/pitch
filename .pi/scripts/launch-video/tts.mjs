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
 *                [--model=gemini-3.8-flash-tts] [--no-retry]
 *   node tts.mjs --text="…the whole script…" --out=audio/vo.wav
 *
 * Writes the WAV and the script next to it (audio/vo.txt) so align.mjs can
 * time every word.
 *
 * Direction, in the script itself (Gemini 3.8, the Interactions API):
 *   {conspiratorial, speaking rapidly} Here's the thing. Your office…
 *   {sarcastic} And we know, headphones make it worse. <sigh> You miss…
 * A line opening with {…} starts a TURN: the text up to the next {…} is sent
 * verbatim with that as its speech_metadata style — a short situational
 * direction (emotion, pace, pitch), never the speaker's identity. --style is
 * the style of any text before the first {…}. <tags> (<laugh>, <sigh>,
 * <short pause>) are momentary vocal events inside the transcript. All the
 * turns go in ONE request, so it is still one continuous read. Measured on a
 * 67-word ad: 2.63 words/s this way, 2.12 with the style prepended as a
 * "Say the following in a … way:" instruction.
 *
 * Older models (generateContent) get the transcript with {…} and <…> removed
 * and --style as a "Say the following in a … way:" prefix.
 *
 * Models: gemini-3.8-flash-tts (default, the most nuanced acting),
 * gemini-3.8-flash-lite-tts (cheaper), gemini-2.5-flash-preview-tts (the
 * fallback for a rushed take), gemini-3.1-flash-tts-preview,
 * gemini-2.5-pro-preview-tts. Voices: the 30 prebuilt names (Kore, Puck,
 * Achird, Charon, …). Output: 24kHz mono WAV.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, renameSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { paceOf } from "./lib/pace.mjs";

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
let source  = args.text;
if (!source && args.script) {
  if (!existsSync(args.script)) { console.error(`--script file not found: ${args.script}`); process.exit(1); }
  source = readFileSync(args.script, "utf8");
}
source = source?.trim();
const out   = args.out ?? "audio/vo.wav";
const voice = args.voice ?? "Aoede";
const style = args.style;
const model = args.model ?? "gemini-3.8-flash-tts";
if (!source) { console.error("--text or --script is required"); process.exit(1); }
const flat = (t) => t.replace(/\s+/g, " ").trim();
const TURN = /\{([^{}\n]{1,200})\}/g;
const TAG = /<[^<>\n]{1,40}>/g;
const LEGACY = /\[[^\]\n]{1,40}\]/g;   // ElevenLabs-style [tags]: not Gemini's, never sent
// Turn styles and tags steer the read but are not spoken — count only the
// words, or a directed script looks rushed (align.mjs strips them too).
const wordCount = flat(source.replace(TURN, " ").replace(TAG, " ").replace(LEGACY, " ")).split(" ").filter(Boolean).length;

/** The script as turns: [{ text, style }], each {…} starting a new one. */
function turns() {
  const list = [];
  let current = { style, text: "" };
  let last = 0;
  for (const m of source.matchAll(TURN)) {
    current.text += source.slice(last, m.index);
    list.push(current);
    current = { style: m[1].trim(), text: "" };
    last = m.index + m[0].length;
  }
  current.text += source.slice(last);
  list.push(current);
  return list
    .map((t) => ({ style: t.style, text: flat(t.text.replace(LEGACY, " ")) }))
    .filter((t) => t.text);
}
if (wordCount < 12 && !args.allow_short) {
  console.error(`Refusing a ${wordCount}-word clip: narration is ONE continuous read of the whole script (pass --allow_short=1 for a deliberate single-line film).`);
  process.exit(1);
}

/** Gemini 3.8 and later: the Interactions API, verbatim turns with their own styles. */
async function interaction(withModel) {
  const content = turns().map((t) => ({
    type: "text",
    text: t.text,
    ...(t.style ? { annotations: [{ type: "speech_metadata", style: t.style }] } : {}),
  }));
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model: withModel,
      input: [{ type: "user_input", content }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice }] },
    }),
  });
  if (!res.ok) { console.error(`Gemini TTS HTTP ${res.status}: ${await res.text()}`); process.exit(1); }
  const json = await res.json();
  const audio = (json?.steps ?? []).flatMap((s) => s.content ?? []).find((c) => c.data && /^audio\//.test(c.mime_type ?? ""));
  if (!audio) { console.error("No audio in response:", JSON.stringify(json).slice(0, 500)); process.exit(1); }
  return { bytes: Buffer.from(audio.data, "base64"), input: /wav/.test(audio.mime_type) ? [] : ["-f", "s16le", "-ar", "24000", "-ac", "1"] };
}

/** Older TTS models: generateContent, one flat prompt with the style prefixed. */
async function generateContent(withModel) {
  const text = flat(source.replace(TURN, " ").replace(TAG, " "));
  const prompt = style ? `Say the following in a ${style} way: ${text}` : text;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${withModel}:generateContent`,
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
  // Raw 16-bit PCM @ 24kHz mono.
  return { bytes: Buffer.from(b64, "base64"), input: ["-f", "s16le", "-ar", "24000", "-ac", "1"] };
}

/** One take with one model → { dur, wps }, written to `file`. */
async function record(withModel, file) {
  const { bytes, input } = /^gemini-(2|3\.1)[.-]/.test(withModel) ? await generateContent(withModel) : await interaction(withModel);
  mkdirSync(dirname(resolve(file)), { recursive: true });
  const raw = file + ".raw";
  writeFileSync(raw, bytes);
  // Trim the silence Gemini pads the read with (one take arrived with 11.7s of
  // it up front): audio.voStart in shots.js means "the voice starts here", and
  // a pace measured over dead air called a 3.5 words/s sprint "1.9, human".
  // 0.15s is left at each end so the first word is not clipped.
  execFileSync(
    "ffmpeg",
    [
      "-y", ...input, "-i", raw, "-af",
      "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse," +
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse",
      file,
    ],
    { stdio: "pipe" },
  );
  rmSync(raw);
  const dur = Number(execFileSync("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
  return { model: withModel, file, dur, wps: wordCount / Math.max(0.01, dur) };
}

// --pace=ad: the brisker short-form ad read (lib/pace.mjs); narration otherwise.
const PACE = paceOf(args.pace);
const HUMAN = PACE.target;                  // the middle of the aimed range
const rushed = (t) => t.wps > PACE.brisk;   // over this the read sprints — or the model dropped half the script
let take = await record(model, out);
// One take that comes back rushed is usually a truncated one (a 69-word script
// in 10s), and the agent's answer was three calls in a row. Re-record once
// with the other model here and keep whichever take is nearer a human pace.
if (rushed(take) && !args["no-retry"]) {
  const alt = model === "gemini-2.5-flash-preview-tts" ? "gemini-3.8-flash-tts" : "gemini-2.5-flash-preview-tts";
  console.log(`⚠ ${model}: ${take.wps.toFixed(2)} words/s (${take.dur.toFixed(1)}s for ${wordCount} words) — a sprint or a truncated take; re-recording once with ${alt}.`);
  const retry = await record(alt, out + ".retry.wav");
  if (Math.abs(retry.wps - HUMAN) < Math.abs(take.wps - HUMAN)) { renameSync(retry.file, out); take = { ...retry, file: out }; }
  else { rmSync(retry.file, { force: true }); console.log(`   ${alt} was no better (${retry.wps.toFixed(2)} words/s); keeping the first take.`); }
}
const { dur, wps } = take;
const txt = out.replace(/\.\w+$/, "") + ".txt";
// The script as written, turn styles and tags included (align.mjs strips them):
// flattening it would lose the turns on the next re-record from this file.
if (resolve(txt) !== resolve(args.script ?? "")) writeFileSync(txt, source + "\n");
console.log(`Wrote ${out} (${dur.toFixed(2)}s, ${wordCount} words, ${wps.toFixed(2)} words/s, voice=${voice}, model=${take.model})`);
console.log(`Script saved to ${txt}. Next: align.mjs --vo=${out} → cue the shots → sync.mjs --write`);
if (wps > PACE.brisk) console.log(`⚠ RUSHED read (${wps.toFixed(2)} words/s) from both models. A ${PACE.name} read sounds human at ${PACE.aim[0]}–${PACE.aim[1]} words/s. Do NOT keep this: re-record with a less hurried style or cut copy — the picture carries the energy, the voice never sprints.`);
if (wps < PACE.slow) console.log(`⚠ very slow read (< ${PACE.slow} words/s) — ask for a ${PACE.name === "ad" ? "brisker, punchier" : "natural conversational"} pace, or cut copy.`);
