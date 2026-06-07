# Playwright Selector Gotchas

**`:has-text()` is not standard CSS inside `:has()`** — Playwright combinators (`>>`) and custom pseudo-classes like `:has-text()` or `:text()` are handled by Playwright's engine. Passing them inside standard functional CSS pseudo-classes like `:has(...)` or `:not(...)` will cause syntax errors. 
* Use Playwright's split `>>` operator instead, or use XPath relative axes:
```
❌ "div:has(h3 >> text='Test Nurse') >> .button"
❌ "div:has(h3:has-text('Test Nurse')) >> .button"
✅ "h3:has-text('Test Nurse') >> xpath=../.. >> .button"
✅ "button >> text='Return policy?'"
✅ "button:text('Return policy?')"
```

**Never guess element attributes (Email, Password, etc.)** — Always use `playwright-cli` (specifically `playwright-cli get attr <ref> placeholder/name/id`) to fetch exact attribute values before writing selectors. Labels and placeholders are frequently different from visual text (e.g. "Email" visually vs. placeholder="Enter your email or phone number").

**Prefer Tag-Agnostic Selectors for Inputs** — Avoid prepending `input` to attribute selectors like `input[name='benefits']`. Features looking like text fields might be implemented as `<textarea>` or custom elements. Omitting the tag name makes the selector robust:
```
❌ "input[name='benefits']"
✅ "[name='benefits']"
```

**Verify hrefs with playwright-cli** — sites redirect URLs (e.g. `/docs/components/command` → `/docs/components/radix/command`). Always confirm the exact `href` value before using `a[href='...']`.

**Avoid class names with `/`** — Tailwind classes like `group/accordion-trigger` are invalid CSS selectors. Use a structural parent (`h3 button`) or ARIA role instead.

**⏱️ Fail Fast: Use Aggressive Timeouts for Exploration & Scraping**
By default, Playwright waits **30 seconds** (`30000ms`) for elements before throwing an error. When writing custom scripts or performing live explorations (e.g., `explore.ts`), waiting 30 seconds for a missing element severely slows down the agent's feedback loop and costs valuable reasoning time.
* **The Rule**: Always set a short, aggressive timeout (e.g., **3 to 5 seconds**) on wait and action methods when writing ad-hoc scripts. If the element is not there, let the script crash immediately so you can self-correct instantly.
* **How to implement**:
  ```typescript
  // ❌ BAD: Stalls the agent for 30 seconds on failure
  await page.click('text="Test Nurse"'); 
  
  // ✅ GOOD: Fails in 3 seconds, triggering immediate correction
  await page.click('text="Test Nurse"', { timeout: 3000 }); 
  
  // ✅ GOOD: Short wait before acting
  await page.waitForSelector('text="Test Nurse"', { timeout: 3000 });
  ```

| Intent | Selector |
|---|---|
| Button by text | `button >> text='Submit'` |
| Tab by label | `[role='tablist'] [role='tab'] >> text='Analytics'` |
| Input by placeholder | `[placeholder='Search...']` |
| Link by text | `a >> text='Command'` |
