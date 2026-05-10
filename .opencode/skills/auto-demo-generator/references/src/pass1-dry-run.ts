import { chromium } from 'playwright';
import { DemoConfig, DemoStep } from './types';

export async function pass1(config: DemoConfig, startUrl: string, demoSteps: DemoStep[]) {
  console.log("== Pass 1: Generic Flow Validation ==");
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
        // force: true bypasses Playwright's actionability checks (pointer-events,
        // covered-by-overlay) which can time out for elements inside dialogs /
        // cmdk command-palettes that are technically "covered" by their own backdrop.
        await loc.click({ force: true });
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