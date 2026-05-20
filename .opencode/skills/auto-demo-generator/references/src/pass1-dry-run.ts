import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { DemoConfig, DemoStep } from './types';

// ── Preflight ────────────────────────────────────────────────────────────────
function preflight(config: DemoConfig): void {
  if (!config.startUrl) throw new Error('[pass1-dry-run] config.startUrl is required.');
  if (!config.steps || config.steps.length === 0) throw new Error('[pass1-dry-run] config.steps is empty.');
}

export async function pass1(config: DemoConfig, startUrl: string, demoSteps: DemoStep[]) {
  preflight(config);

  console.log("== Pass 1: Flow Validation (Dry Run) ==");
  const VIDEO_WIDTH = config.width || 1920;
  const VIDEO_HEIGHT = config.height || 1080;
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } });
  const page = await context.newPage();
  
  await page.goto(startUrl);
  await page.waitForLoadState('networkidle');

  let prevUrl = page.url();

  for (const step of demoSteps) {
    if (step.selector) {
      console.log(`Validating step: ${step.id} — locating: ${step.selector}`);

      // Wait for the element to be visible (not just attached — dialogs/popups may
      // mount the node in the DOM while still off-screen or inside a hidden layer)
      const loc = page.locator(step.selector).first();
      await loc.waitFor({ state: 'visible', timeout: 20000 });
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      if (step.action === 'click') {
        if (step.selector && step.selector.startsWith('a >> text=')) {
          // It's a sidebar navigation link. Wait for layout, click normally, and poll for URL change.
          await page.waitForTimeout(500);
          await loc.scrollIntoViewIfNeeded();
          await loc.click().catch(() => loc.click({ force: true }));
          
          for (let i = 0; i < 20; i++) {
            if (page.url() !== prevUrl) break;
            await page.waitForTimeout(100);
          }
        } else {
          await loc.click({ force: true });
        }
        await page.waitForTimeout(600);

        // Wait for any client-side navigation to settle
        const newUrl = page.url();
        if (newUrl !== prevUrl) {
          console.log(`  → Navigated to: ${newUrl}`);
          await page.waitForLoadState('networkidle').catch(() => {});
          await page.waitForTimeout(1000);
          prevUrl = newUrl;
        }
      } else if (step.action === 'type') {
        // fill() sets the value directly and fires an `input` event, which is
        // enough for most frameworks (React controlled inputs, cmdk, etc.).
        // A short pause afterwards lets any async filter / suggestion logic settle
        // before the next step tries to locate its element.
        await loc.fill(step.value!);
        await page.waitForTimeout(800);
      }

      await page.waitForTimeout(400);
    }
  }

  await browser.close();
  console.log("✅ Flow validated successfully.");
}