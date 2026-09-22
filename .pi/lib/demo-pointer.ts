/** Host-side Playwright run-code, not page-side synthetic mouse events. The real
 * pointer reaches its target before the subsequent CLI click is dispatched. */
export function pointerGlideCode(ref: string): string {
  if (!/^[a-zA-Z0-9]+$/.test(ref)) throw new Error('Pointer movement requires a snapshot ref')
  return `async page => {
    const target = page.locator(${JSON.stringify(`aria-ref=${ref}`)});
    await target.waitFor({state: 'visible'});
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) throw new Error('Pointer target has no visible box');
    const end = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    const start = await page.evaluate(() => window.__pitchPointerPosition || {x: 32, y: innerHeight - 32});
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance < 2) return;
    const duration = Math.min(1100, Math.max(350, distance * 0.7));
    const steps = Math.ceil(duration / (1000 / 60));
    await page.mouse.move(start.x, start.y);
    const began = Date.now();
    for (let i = 1; i <= steps; i++) {
      const due = began + duration * i / steps;
      await page.waitForTimeout(Math.max(0, due - Date.now()));
      const t = i / steps;
      const eased = t * t * (3 - 2 * t);
      await page.mouse.move(start.x + (end.x - start.x) * eased, start.y + (end.y - start.y) * eased);
    }
    await page.waitForTimeout(100);
  }`
}
