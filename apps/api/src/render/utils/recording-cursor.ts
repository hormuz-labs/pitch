import { writeFileSync } from 'node:fs'
import type { BrowserContext, Page } from 'playwright'

export type CursorShape = 'arrow' | 'hand' | 'text' | 'hidden'
export interface CursorEvent {
  time: number
  kind: 'move' | 'down' | 'up' | 'hide' | 'document' | 'scroll' | 'key'
  x: number
  y: number
  buttons: number
  shape: CursorShape
  page: number
}

const binding = '__pitchCursorTelemetryV2'

/** Observe input only: no elements, CSS, HTML sinks or cursor painted into video.
 * Capture-phase events include real CDP input. Cross-origin frames relay client
 * coordinates to the top document, applying each frame's offset/scale once. */
export const RECORDING_CURSOR_SCRIPT = `(() => {
  if (window.__pitchCursorTelemetryInstalled) return;
  window.__pitchCursorTelemetryInstalled = true;
  const channel = 'pitch-cursor-telemetry-v2';
  let position = null;
  let buttons = 0;
  let shape = 'arrow';
  const cursorShape = target => {
    if (!(target instanceof Element)) return 'arrow';
    const cursor = getComputedStyle(target).cursor;
    if (cursor === 'none') return 'hidden';
    if (cursor === 'text' || cursor === 'vertical-text') return 'text';
    if (cursor === 'pointer' || cursor === 'grab' || cursor === 'grabbing') return 'hand';
    return 'arrow';
  };
  function report(data) {
    if (Number.isFinite(data.x) && Number.isFinite(data.y)) {
      position = {x: data.x, y: data.y};
      window.__pitchPointerPosition = position;
      buttons = data.buttons;
      shape = data.shape;
    }
    if (window !== window.top) {
      window.parent.postMessage({...data, channel}, '*');
      return;
    }
    return window.${binding}(data);
  }
  for (const type of ['pointermove', 'pointerdown', 'pointerup']) {
    window.addEventListener(type, event => {
      if (event.isTrusted === false) return;
      if (event.pointerType && event.pointerType !== 'mouse') return;
      report({kind: type === 'pointerdown' ? 'down' : type === 'pointerup' ? 'up' : 'move',
        time: Date.now(), x: event.clientX, y: event.clientY,
        buttons: event.buttons, shape: cursorShape(event.target)});
    }, {capture: true, passive: true});
  }
  window.addEventListener('pointerout', event => {
    // Navigation can emit pointerout with no related target while the physical
    // mouse is still in the viewport. Do not blink the cursor off on every page.
    if (!event.relatedTarget && (event.clientX <= 0 || event.clientY <= 0 ||
        event.clientX >= innerWidth || event.clientY >= innerHeight)) {
      report({kind: 'hide', time: Date.now()});
    }
  }, {capture: true, passive: true});
  window.addEventListener('scroll', () => {
    const target = position && document.elementFromPoint(position.x, position.y);
    report({kind: 'scroll', time: Date.now(), ...(position || {}), buttons,
      shape: target ? cursorShape(target) : shape});
  }, {capture: true, passive: true});
  window.addEventListener('keydown', event => {
    if (event.isTrusted === false) return;
    // Record activity, never key values or typed text.
    report({kind: 'key', time: Date.now()});
  }, {capture: true, passive: true});
  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || data.channel !== channel) return;
    const frame = Array.from(document.querySelectorAll('iframe,frame')).find(el => el.contentWindow === event.source);
    if (!frame) return;
    if (data.kind === 'hide') return; // Leaving a child frame isn't leaving the viewport.
    if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) { report(data); return; }
    const rect = frame.getBoundingClientRect();
    const sx = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
    const sy = frame.offsetHeight ? rect.height / frame.offsetHeight : 1;
    report({...data, x: rect.left + (frame.clientLeft + data.x) * sx,
      y: rect.top + (frame.clientTop + data.y) * sy});
  });
  // Restore physical pointer position across documents for the host's next glide.
  if (window === window.top) {
    const restore = () => report({kind: 'document', time: Date.now(), visible: document.visibilityState === 'visible'}).then(state => {
      if (state && state.shape !== 'hidden' && !position) {
        position = {x: state.x, y: state.y};
        buttons = state.buttons;
        window.__pitchPointerPosition = position;
      }
      if (position) report({kind: 'move', time: Date.now(), ...position, buttons,
        shape: cursorShape(document.elementFromPoint(position.x, position.y))});
    });
    document.addEventListener('visibilitychange', restore);
    document.addEventListener('DOMContentLoaded', restore, {once: true});
    return restore();
  }
})();`

/** Input and video share the worker's wall clock. No tool-return timestamps or
 * inferred paths between clicks. Incomplete takes leave an explicit sentinel. */
export class CursorRecording {
  private pageIds = new Map<Page, number>()
  private active: Page | null = null
  private current = { x: 32, y: 1048, buttons: 0, shape: 'hidden' as CursorShape }
  private events: CursorEvent[] = []
  private startTime = 0
  private file: string | null = null
  private failure: Error | null = null

  select(page: Page | null, time = Date.now()): void {
    if (page === this.active) return
    this.active = page
    if (page && !this.pageIds.has(page)) this.pageIds.set(page, this.pageIds.size)
    this.record('document', time)
  }

  receive(page: Page, data: any): typeof this.current {
    if (data?.kind === 'document' && typeof data.visible === 'boolean') {
      if (data.visible) this.select(page)
      else if (this.active === page) this.select(null)
    }
    if (page !== this.active) return this.current
    if (!data || !['move', 'down', 'up', 'hide', 'document', 'scroll', 'key'].includes(data.kind))
      return this.current
    const now = Date.now()
    // Browser Date.now() and capture Date.now() run on the same host. Reject bad
    // clocks rather than moving input silently to the time the binding returns.
    if (!Number.isFinite(data.time) || Math.abs(data.time - now) > 10_000) {
      this.failure = new Error('Cursor telemetry clock is outside the capture clock')
      return this.current
    }
    if (Number.isFinite(data.x) && Number.isFinite(data.y)) {
      if (!['arrow', 'hand', 'text', 'hidden'].includes(data.shape)) return this.current
      this.current = {
        x: data.x,
        y: data.y,
        buttons: Number.isInteger(data.buttons) ? data.buttons & 31 : 0,
        shape: data.shape,
      }
    }
    if (data.kind === 'hide') this.current.shape = 'hidden'
    this.record(data.kind, data.time)
    return this.current
  }

  private record(kind: CursorEvent['kind'], time: number): void {
    if (!this.file || time < this.startTime) return
    if (this.events.length >= 1_000_000) {
      this.failure = new Error('Cursor telemetry exceeded one million events; take is incomplete')
      return
    }
    this.events.push({
      time: (time - this.startTime) / 1000,
      kind,
      ...this.current,
      shape: this.active ? this.current.shape : 'hidden',
      page: this.active ? this.pageIds.get(this.active)! : -1,
    })
  }

  start(file: string, startTime: number): void {
    this.file = file
    this.startTime = startTime
    this.events = []
    this.failure = null
    writeFileSync(file, JSON.stringify({ version: 2, complete: false, startTime }))
    this.record('document', startTime)
  }

  stop(endTime: number): void {
    if (!this.file) return
    if (this.failure) throw this.failure
    const duration = (endTime - this.startTime) / 1000
    const events = this.events
      .filter(event => event.time <= duration)
      .sort((a, b) => a.time - b.time)
    writeFileSync(
      this.file,
      JSON.stringify({
        version: 2,
        complete: true,
        startTime: this.startTime,
        duration,
        width: 1920,
        height: 1080,
        events,
      }),
    )
    this.file = null
  }
}

export async function installRecordingCursor(context: BrowserContext): Promise<CursorRecording> {
  const recorder = new CursorRecording()
  await context.exposeBinding(binding, ({ page, frame }, data) => {
    // Only top-level documents submit: child input has been coordinate-mapped.
    if (frame !== page.mainFrame()) return null
    return recorder.receive(page, data)
  })
  await context.addInitScript({ content: RECORDING_CURSOR_SCRIPT })
  await Promise.all(
    context
      .pages()
      .flatMap(page => page.frames().map(frame => frame.evaluate(RECORDING_CURSOR_SCRIPT))),
  )
  return recorder
}
