# Playwright Selector Gotchas

**`:has-text()` is not CSS** — it will silently time out. Use Playwright's `>>` combinator instead:

```
❌ "button[data-state]:has-text('Return policy?')"
✅ "h3 button >> text='Return policy?'"
✅ "button:text('Return policy?')"
```

**Verify hrefs with agent-browser** — sites redirect URLs (e.g. `/docs/components/command` → `/docs/components/radix/command`). Always confirm the exact `href` value before using `a[href='...']`.

**Avoid class names with `/`** — Tailwind classes like `group/accordion-trigger` are invalid CSS selectors. Use a structural parent (`h3 button`) or ARIA role instead.

| Intent | Selector |
|---|---|
| Button by text | `button >> text='Submit'` |
| Tab by label | `[role='tablist'] [role='tab'] >> text='Analytics'` |
| Input by placeholder | `input[placeholder='Search...']` |
| Link by text | `a >> text='Command'` |
