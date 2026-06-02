import { DemoConfig, DemoStep } from './types';
import { openBrowser } from './browser';

function preflight(config: DemoConfig): void {
  if (!config.startUrl) throw new Error('[pass1-dry-run] config.startUrl is required.');
  if (!config.steps || config.steps.length === 0) throw new Error('[pass1-dry-run] config.steps is empty.');
}

export async function pass1(config: DemoConfig, startUrl: string, demoSteps: DemoStep[]) {
  preflight(config);
  console.log("== Pass 1: Flow Validation (Dry Run) ==");
  const VIDEO_WIDTH = config.width || 1920;
  const VIDEO_HEIGHT = config.height || 1080;
  const session = await openBrowser({
    contextOptions: {
      viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
      extraHTTPHeaders: config.extraHTTPHeaders,
    },
  });
  const { context } = session;
  if (config.extraCookies && config.extraCookies.length > 0) {
    const cookies = config.extraCookies.map(c => ({
      ...c,
      url: c.url || (c.domain ? undefined : startUrl)
    }));
    await context.addCookies(cookies as any);
  }
  const page = await context.newPage();
  await page.goto(startUrl, { waitUntil: 'load' });
  await page.waitForTimeout(5000);
  let prevUrl = page.url();

  for (const step of demoSteps) {
    if (step.selector) {
      console.log(`Validating step: ${step.id} — locating: ${step.selector}`);
      const loc = page.locator(step.selector).first();
      await loc.waitFor({ state: 'visible', timeout: 20000 });
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      if (step.action === 'click') {
        if (step.selector && step.selector.startsWith('a >> text=')) {
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
        const newUrl = page.url();
        if (newUrl !== prevUrl) {
          console.log(`  → Navigated to: ${newUrl}`);
          await page.waitForTimeout(5000);
          prevUrl = newUrl;
        }
      } else if (step.action === 'type') {
        await loc.fill(step.value!);
        await page.waitForTimeout(800);
      }

      await page.waitForTimeout(400);
    }
  }

  await session.close();
  console.log("✅ Flow validated successfully.");
}