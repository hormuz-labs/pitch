/**
 * A minimal PNG reader, so the audit can compare frames by PIXEL rather than
 * by compressed byte.
 *
 * Compressed-byte equality is not a visual comparison: a tiny rasterization
 * difference near the top shifts nearly every compressed byte after it.
 *
 * Decoding is deliberately narrow: 8-bit non-interlaced RGB/RGBA/grey, which
 * is everything Playwright's screenshots are.
 */
import { inflateSync } from "node:zlib";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** → { width, height, channels, data } with `data` as raw 8-bit samples. */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || !buf.subarray(0, 8).equals(PNG_MAGIC)) throw new Error("not a PNG");
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || !CHANNELS[colorType]) {
    throw new Error(`unsupported PNG (depth ${bitDepth}, color ${colorType}, interlace ${interlace})`);
  }

  const channels = CHANNELS[colorType];
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.allocUnsafe(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      const v = line[x];
      cur[x] =
        filter === 0 ? v :
        filter === 1 ? (v + a) & 0xff :
        filter === 2 ? (v + b) & 0xff :
        filter === 3 ? (v + ((a + b) >> 1)) & 0xff :
        filter === 4 ? (v + paeth(a, b, c)) & 0xff :
        v;
    }
  }
  return { width, height, channels, data: out };
}

/**
 * Fraction of pixels that differ by more than `tolerance` on any channel.
 * `step` samples every Nth pixel — 4 is plenty at 1920x1080 and keeps the
 * comparison well under a frame's capture time.
 */
export function pixelDiffRatio(pngA, pngB, { tolerance = 8, step = 4 } = {}) {
  const a = decodePng(pngA);
  const b = decodePng(pngB);
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) return 1;
  const ch = a.channels;
  const pixels = a.width * a.height;
  let differing = 0, sampled = 0;
  for (let p = 0; p < pixels; p += step) {
    sampled++;
    const i = p * ch;
    for (let k = 0; k < ch; k++) {
      if (Math.abs(a.data[i + k] - b.data[i + k]) > tolerance) { differing++; break; }
    }
  }
  return sampled ? differing / sampled : 0;
}
