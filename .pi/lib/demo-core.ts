/**
 * demo-core — pure, dependency-free logic for the demo-generator tools.
 *
 * NOTHING here imports @opencode-ai/plugin, fs, or child_process. Every export is a
 * pure function of its inputs, so it is unit-testable directly (tests/demo-core.test.ts)
 * with no stubs, no module aliases, and no mocked playwright-cli. The tool wrappers in
 * ../tools/demo-generator.ts do the I/O (playwright-cli, fs, TTS) and delegate every
 * DECISION to the functions here.
 *
 * This lives in .pi/lib (NOT .pi/extensions) so OpenCode's tool auto-discovery
 * doesn't try to register it as a tool. It is imported by the tool via a relative path.
 */

export const FRAME_W = 1920
export const FRAME_H = 1080
export const DEFAULT_ZOOM = 1.7
// Auto-fit bounds: never tighter than MAX (a hard dive lands on empty container gaps),
// never looser than MIN. FILL = the fraction of the frame the element should occupy.
export const FIT_FILL = 0.5
export const FIT_ZOOM_MIN = 1.3
export const FIT_ZOOM_MAX = 2.2
// Visible typing is revealed in at most this many chunks so even long text finishes fast.
export const TYPE_MAX_STEPS = 8

export interface ElementBox {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
  // Cursor anchor: the geometric center for normal controls, or (for a large card)
  // the topmost visible text so the cursor lands on content, not an empty gap.
  ax: number
  ay: number
  // True when the browser renders a pointer cursor here (effective CSS cursor:pointer).
  hand: boolean
}

/**
 * Browser-side element-box eval (a STRING that runs in the page, not in Node). Passed
 * to `playwright-cli --raw eval`. Returns the box object DIRECTLY (no JSON.stringify —
 * with `--raw` that would double-encode; parseElementBoxJson peels it either way).
 *  • hand = the element's effective CSS cursor:pointer (inherited, so a <span> inside a
 *    button reports it too).
 *  • ax,ay = the cursor anchor: the geometric center normally, but for a LARGE element
 *    it snaps to the topmost visible text (card title) so the cursor doesn't land in an
 *    empty container gap.
 * Exported so the integration test runs this EXACT string against a real browser.
 */
export const ELEMENT_BOX_JS = `el => { const r=el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2; let ax=cx, ay=cy; if(r.width>innerWidth*0.35&&r.height>innerHeight*0.25){ let best=null; const wk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n; while((n=wk.nextNode())){ if(!n.textContent.trim())continue; const rg=document.createRange(); rg.selectNodeContents(n); const rr=rg.getBoundingClientRect(); if(rr.width<20||rr.height<8||rr.width>innerWidth||rr.bottom<0||rr.top>innerHeight)continue; if(!best||rr.top<best.top)best=rr; } if(best){ax=best.left+best.width/2; ay=best.top+best.height/2;} } return {x:r.left,y:r.top,w:r.width,h:r.height,cx:cx,cy:cy,ax:ax,ay:ay,hand:getComputedStyle(el).cursor === "pointer"}; }`

/** Clamp a point into the recorded 1920×1080 frame so the cursor never lands off-screen. */
export function clampToFrame(x: number, y: number): { x: number; y: number } {
  return { x: Math.max(0, Math.min(FRAME_W, x)), y: Math.max(0, Math.min(FRAME_H, y)) }
}

/**
 * Extract the element ref from a `playwright-cli click <ref>` / `dblclick <ref>` command.
 * Modern refs are alphanumeric hashes (e.g. `f12e1477`), not just old `e53` numerics, so
 * we take the token immediately after the click/dblclick verb and strip any surrounding
 * quotes. Returns undefined when the command has no such ref.
 */
export function parseClickRef(cmd: string): string | undefined {
  const parts = cmd.split(' ')
  for (let i = 0; i < parts.length - 1; i++) {
    if ((parts[i] === 'click' || parts[i] === 'dblclick') && parts[i + 1]) {
      return parts[i + 1]!.replace(/^["']|["']$/g, '')
    }
  }
  return undefined
}

/**
 * Parse the stdout of the getElementBox `--raw eval`. With `--raw`, playwright-cli
 * JSON-encodes the eval's return value, so an already-stringified return comes back
 * DOUBLE-encoded (`"{\"x\":1,...}"`); a single JSON.parse of that yields a string, not an
 * object, and every zoom/click then silently records nothing. So: parse, and if the
 * result is still a string, parse again. Returns null when the payload isn't a valid box.
 */
export function parseElementBoxJson(stdout: string): ElementBox | null {
  try {
    let parsed = JSON.parse(stdout.trim()) as any
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    if (
      parsed &&
      Number.isFinite(parsed.cx) &&
      Number.isFinite(parsed.cy) &&
      Number.isFinite(parsed.w) &&
      Number.isFinite(parsed.h)
    ) {
      return {
        x: parsed.x,
        y: parsed.y,
        w: parsed.w,
        h: parsed.h,
        cx: parsed.cx,
        cy: parsed.cy,
        // Fall back to the geometric center if the anchor wasn't computed.
        ax: Number.isFinite(parsed.ax) ? parsed.ax : parsed.cx,
        ay: Number.isFinite(parsed.ay) ? parsed.ay : parsed.cy,
        hand: !!parsed.hand,
      }
    }
  } catch {}
  return null
}

/**
 * Camera framing for a zoom-in on an element. Auto-fits the zoom so the element fills
 * ~FIT_FILL of the frame (clamped to [MIN,MAX]); an explicit zoom is capped by the fit so
 * a hard dive never lands on an empty container center. The camera center is clamped to
 * keep the zoom window fully inside the frame (near an edge it pans as far as it can).
 */
export function computeZoomFraming(
  box: { w: number; h: number; cx: number; cy: number },
  explicitZoom?: number,
): { cx: number; cy: number; zoom: number } {
  let zoom = explicitZoom ?? DEFAULT_ZOOM
  if (box.w > 0 && box.h > 0) {
    const fit = Math.min((FRAME_W * FIT_FILL) / box.w, (FRAME_H * FIT_FILL) / box.h)
    const fitZoom = Math.max(FIT_ZOOM_MIN, Math.min(FIT_ZOOM_MAX, fit))
    zoom = explicitZoom == null ? fitZoom : Math.min(explicitZoom, fitZoom)
  }
  const halfW = FRAME_W / 2 / zoom
  const halfH = FRAME_H / 2 / zoom
  const cx = Math.max(halfW, Math.min(FRAME_W - halfW, box.cx))
  const cy = Math.max(halfH, Math.min(FRAME_H - halfH, box.cy))
  return { cx, cy, zoom }
}

/** Next tab id = one past the highest existing tab id. */
export function nextTabId(tabCreationTimes: Record<string | number, number>): number {
  return Math.max(0, ...Object.keys(tabCreationTimes).map(Number)) + 1
}

/**
 * Split text into the chunks to type for visible character-by-character entry. Short text
 * (≤ maxSteps chars) types one char per step; longer text is chunked so it finishes in at
 * most `maxSteps` steps. Empty text yields no steps.
 */
export function chunkTypedText(text: string, maxSteps: number = TYPE_MAX_STEPS): string[] {
  const chars = [...text]
  if (chars.length === 0) return []
  const chunkSize = Math.max(1, Math.ceil(chars.length / maxSteps))
  const out: string[] = []
  for (let i = 0; i < chars.length; i += chunkSize) out.push(chars.slice(i, i + chunkSize).join(''))
  return out
}

/** Parse a TTS response mime type (e.g. `audio/L16;rate=24000`) into PCM parameters. */
export function parseMimeType(mimeType: string): {
  numChannels: number
  sampleRate: number
  bitsPerSample: number
} {
  const [, ...params] = mimeType.split(';').map(s => s.trim())
  const options = { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 }
  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim())
    if (key === 'rate' && value) options.sampleRate = parseInt(value, 10)
  }
  return options
}

/** Build a 44-byte WAV/RIFF header for the given PCM data length and format. */
export function createWavHeader(
  dataLength: number,
  options: { numChannels: number; sampleRate: number; bitsPerSample: number },
): Buffer {
  const { numChannels, sampleRate, bitsPerSample } = options
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  return buffer
}
