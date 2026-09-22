import type { BrowserContext } from 'playwright'

/** CDP page video omits the OS pointer. Paint actual mouse input into the page
 * pixels, before capture, so all later cuts/crops/speed changes carry it along.
 * A script string avoids closing over server variables in browser evaluation. */
export const RECORDING_CURSOR_SCRIPT = `(() => {
  const key = '__pitchRecordingCursorV1';
  if (window[key]) return;
  window[key] = true;
  const channel = 'pitch-recording-cursor-v1';
  let host, pointer, ring, pulse;
  window.__pitchPointerPosition = null;

  function mount() {
    if (!document.documentElement) return false;
    if (!host) {
      host = document.createElement('pitch-recording-cursor');
      host.setAttribute('aria-hidden', 'true');
      host.setAttribute('popover', 'manual');
      host.style.cssText = 'all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:visible!important;pointer-events:none!important;z-index:2147483647!important;';
      const shadow = host.attachShadow({mode: 'open'});
      shadow.innerHTML = '<style>:host::backdrop{display:none!important}*{pointer-events:none!important}.pointer{position:absolute;left:0;top:0;width:24px;height:24px;filter:drop-shadow(0 1px 1px #0004)}.ring{position:absolute;left:-9px;top:-9px;width:24px;height:24px;box-sizing:border-box;border:1.5px solid #64748b;background:#ffffff30;border-radius:50%;opacity:0}svg{display:block;width:24px;height:24px;overflow:visible}</style><div class="pointer"><div class="ring"></div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3 Q2.5 2.5 2.8 3.6 L8.6 20 Q9 21 9.5 20 L12.3 13.2 Q12.5 12.6 13.1 12.4 L20 9.6 Q21 9.2 20 8.8 Z" fill="#fff" stroke="#17202e" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round"/></svg></div>';
      pointer = shadow.querySelector('.pointer');
      ring = shadow.querySelector('.ring');
    }
    if (!host.isConnected) document.documentElement.appendChild(host);
    // Top layer keeps the pointer visible over dialogs and fullscreen content.
    if (host.showPopover && !host.matches(':popover-open')) host.showPopover();
    return true;
  }

  function paint(data) {
    if (window !== window.top) {
      window.parent.postMessage({...data, channel}, '*');
      return;
    }
    if (data.kind === 'hide') {
      if (pointer) pointer.style.visibility = 'hidden';
      return;
    }
    if (!mount()) return;
    pointer.style.visibility = 'visible';
    window.__pitchPointerPosition = {x: data.x, y: data.y};
    // Arrow tip, not the icon centre, is the browser's real client coordinate.
    pointer.style.transform = 'translate(' + (data.x - 3) + 'px,' + (data.y - 3) + 'px)';
    if (data.kind === 'down') {
      if (pulse) pulse.cancel();
      pulse = ring.animate([
        {opacity: 0.65, transform: 'scale(0.7)'},
        {opacity: 0, transform: 'scale(1.35)'}
      ], {duration: 360, fill: 'forwards'});
    }
  }

  // Capture phase also sees controls whose application handlers stop bubbling.
  for (const type of ['pointermove', 'pointerdown', 'pointerup']) {
    window.addEventListener(type, event => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      paint({kind: type === 'pointerdown' ? 'down' : 'move', x: event.clientX, y: event.clientY});
    }, {capture: true, passive: true});
  }
  window.addEventListener('pointerout', event => {
    if (!event.relatedTarget) paint({kind: 'hide'});
  }, {capture: true, passive: true});
  window.addEventListener('blur', () => paint({kind: 'hide'}));
  document.addEventListener('toggle', event => {
    if (host && event.target !== host && event.newState === 'open' && host.matches(':popover-open')) {
      host.hidePopover(); host.showPopover();
    }
  }, true);

  // Child frames (including cross-origin ones) report only pointer coordinates.
  // Relay through each parent so nested frame offsets/scales are applied once.
  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || data.channel !== channel || !['move', 'down', 'hide'].includes(data.kind)) return;
    const frame = Array.from(document.querySelectorAll('iframe,frame')).find(el => el.contentWindow === event.source);
    if (!frame) return;
    if (data.kind === 'hide') { paint(data); return; }
    if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
    const rect = frame.getBoundingClientRect();
    const sx = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
    const sy = frame.offsetHeight ? rect.height / frame.offsetHeight : 1;
    paint({kind: data.kind, x: rect.left + (frame.clientLeft + data.x) * sx,
      y: rect.top + (frame.clientTop + data.y) * sy});
  });
})();`

export async function installRecordingCursor(context: BrowserContext): Promise<void> {
  // Future documents/popups/frames, plus already-open preparation pages.
  await context.addInitScript({ content: RECORDING_CURSOR_SCRIPT })
  await Promise.all(
    context
      .pages()
      .flatMap(page => page.frames().map(frame => frame.evaluate(RECORDING_CURSOR_SCRIPT))),
  )
}
