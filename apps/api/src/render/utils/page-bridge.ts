import { randomUUID } from 'node:crypto'
import type { Page } from 'playwright'

/** A private CDP binding, independent of Playwright's shared page-global binding
 * controller. The recorder and playwright-cli attach as separate clients; their
 * exposeBinding controllers cannot safely share that global across navigation. */
export async function installPageBridge(
  page: Page,
  name: string,
  script: string,
  receive: (data: any) => unknown | Promise<unknown>,
): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page)
  const native = `__pitchNative_${randomUUID().replaceAll('-', '')}`
  const state = `${native}_state`
  let closed = false
  let scriptId: string | undefined
  const source = `(() => {
    if (window !== window.top || window[${JSON.stringify(state)}]) return;
    const pending = new Map();
    let sequence = 0, disposed = false;
    window[${JSON.stringify(state)}] = {
      resolve(id, ok, value) {
        const item = pending.get(id);
        if (!item) return;
        pending.delete(id); clearTimeout(item.timer);
        if (ok) item.resolve(value); else item.reject(new Error(value));
      },
      dispose() {
        disposed = true;
        for (const item of pending.values()) { clearTimeout(item.timer); item.resolve(null); }
        pending.clear();
      }
    };
    window[${JSON.stringify(name)}] = data => {
      if (disposed) return Promise.resolve(null);
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id); reject(new Error('Capture input bridge did not respond'));
        }, 10000);
        pending.set(id, {resolve, reject, timer});
        try { window[${JSON.stringify(native)}](JSON.stringify({id, data})); }
        catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    };
    const result = ${script}
    window.dispatchEvent(new Event(${JSON.stringify(`${name}:ready`)}));
    return result;
  })();`
  const onBinding = async (event: {
    name: string
    payload: string
    executionContextId: number
  }) => {
    if (closed || event.name !== native || event.payload.length > 64 * 1024) return
    let packet: { id: number; data: unknown }
    try {
      packet = JSON.parse(event.payload)
      if (!packet || !Number.isSafeInteger(packet.id)) return
    } catch {
      return
    }
    let ok = true
    let value: unknown
    try {
      value = await receive(packet.data)
    } catch (error) {
      ok = false
      value = error instanceof Error ? error.message : String(error)
    }
    if (closed) return
    // Reply in the originating document, never in its successor after navigation.
    await cdp
      .send('Runtime.evaluate', {
        expression: `window[${JSON.stringify(state)}]?.resolve(${packet.id},${ok},${JSON.stringify(value ?? null)})`,
        contextId: event.executionContextId,
        returnByValue: true,
      })
      .catch(() => {
        /* The originating document may have navigated away. */
      })
  }
  const onClose = () => {
    void close()
  }
  const close = async () => {
    if (closed) return
    closed = true
    page.off('close', onClose)
    cdp.off('Runtime.bindingCalled', onBinding)
    await cdp
      .send('Runtime.evaluate', {
        expression: `window[${JSON.stringify(state)}]?.dispose()`,
      })
      .catch(() => {})
    if (scriptId)
      await cdp
        .send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId })
        .catch(() => {})
    await cdp.send('Runtime.removeBinding', { name: native }).catch(() => {})
    await cdp.detach().catch(() => {})
  }
  cdp.on('Runtime.bindingCalled', onBinding)
  page.once('close', onClose)
  try {
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Runtime.addBinding', { name: native })
    const registered = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source })
    scriptId = registered.identifier
    const result = await cdp.send('Runtime.evaluate', {
      expression: source,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails)
      throw new Error(
        `Capture bridge initialization failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
      )
    return close
  } catch (error) {
    await close()
    throw error
  }
}
