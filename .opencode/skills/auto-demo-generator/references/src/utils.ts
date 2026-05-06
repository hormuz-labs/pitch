import { WavConversionOptions } from './types';

export function parseMimeType(mimeType: string): WavConversionOptions {
  const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
  const [_, format] = fileType.split('/');
  const options: Partial<WavConversionOptions> = { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 };
  if (format && format.toLowerCase().startsWith('l')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) options.bitsPerSample = bits;
  }
  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim());
    if (key === 'rate') options.sampleRate = parseInt(value, 10);
  }
  return options as WavConversionOptions;
}

export function createWavHeader(dataLength: number, options: WavConversionOptions) {
  const { numChannels, sampleRate, bitsPerSample } = options;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8); buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28); buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

export const getSetupCinematic = (svgContent: string) => `
window.setupCinematic = () => {
  const svg = \`${svgContent}\`;
  const cursor = document.createElement('img');
  cursor.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  cursor.id = 'cinematic-cursor';
  cursor.style.cssText = 'position:fixed; top:540px; left:960px; z-index:999999; pointer-events:none; transition: left 1.2s cubic-bezier(0.25, 1, 0.5, 1), top 1.2s cubic-bezier(0.25, 1, 0.5, 1), transform 0.2s; margin-top:-2px; margin-left:-2px; transform-origin: 2px 2px;';
  document.body.appendChild(cursor);

  const rippleContainer = document.createElement('div');
  rippleContainer.id = 'ripple-container';
  rippleContainer.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; z-index:999998; pointer-events:none;';
  document.body.appendChild(rippleContainer);

  document.documentElement.style.transition = 'transform 1.5s cubic-bezier(0.25, 1, 0.5, 1)';
  document.documentElement.style.transformOrigin = '0 0';
};

window.moveCursor = (x, y, duration = 1.2) => {
  const cursor = document.getElementById('cinematic-cursor');
  if(cursor) { 
    cursor.style.transition = \`left \${duration}s cubic-bezier(0.25, 1, 0.5, 1), top \${duration}s cubic-bezier(0.25, 1, 0.5, 1), transform 0.2s\`;
    cursor.style.left = x + 'px'; 
    cursor.style.top = y + 'px'; 
  }
};

window.clickCursor = () => {
  const cursor = document.getElementById('cinematic-cursor');
  if(cursor) { cursor.style.transform = 'scale(0.8)'; setTimeout(() => cursor.style.transform = 'scale(1)', 200); }
};

window.spawnRipple = (x, y) => {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute; left:'+x+'px; top:'+y+'px; width:0px; height:0px; border-radius:50%; background:rgba(0,0,0,0.15); transform:translate(-50%, -50%); pointer-events:none; border:1px solid rgba(0,0,0,0.1); transition:all 0.4s ease-out;';
  document.getElementById('ripple-container').appendChild(el);
  requestAnimationFrame(() => { el.style.width = '120px'; el.style.height = '120px'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 400);
};

window.zoomCamera = (scale, cx, cy, duration = 1.2) => {
  let camX = Math.min(0, Math.max(960 - cx * scale, 1920 - 1920 * scale));
  let camY = Math.min(0, Math.max(540 - cy * scale, 1080 - 1080 * scale));
  document.documentElement.style.transition = \`transform \${duration}s cubic-bezier(0.25, 1, 0.5, 1)\`;
  document.documentElement.style.transform = 'translate(' + camX + 'px, ' + camY + 'px) scale(' + scale + ')';
};
`;
