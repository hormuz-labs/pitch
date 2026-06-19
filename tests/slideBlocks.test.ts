import { describe, it, expect } from 'vitest';
import { createBlockHTML, createTableHTML, createImageBlockHTML, createIconBlockHTML, ICONS, createQrBlockHTML, layerStyle, searchBlocks, ALL_BLOCKS, createSlideHTML, SLIDE_TEMPLATES, createChartConfig } from '../apps/web/src/lib/slideBlocks';

describe('createBlockHTML — text & structure', () => {
  it('paragraph: returns a paragraph element with body text', () => {
    const html = createBlockHTML('paragraph');
    expect(html).toMatch(/^<p\b/);
    expect(html).toContain('</p>');
  });

  it('title: returns an h1 using the template main-title class', () => {
    const html = createBlockHTML('title');
    expect(html).toMatch(/^<h1\b/);
    expect(html).toContain('main-title');
  });

  it('heading1..4: return the matching heading tag', () => {
    expect(createBlockHTML('heading1')).toMatch(/^<h1\b/);
    expect(createBlockHTML('heading2')).toMatch(/^<h2\b/);
    expect(createBlockHTML('heading3')).toMatch(/^<h3\b/);
    expect(createBlockHTML('heading4')).toMatch(/^<h4\b/);
  });

  it('blockquote: returns a blockquote element', () => {
    expect(createBlockHTML('blockquote')).toMatch(/^<blockquote\b/);
  });

  it('label: returns a span styled as a pill label', () => {
    const html = createBlockHTML('label');
    expect(html).toMatch(/^<span\b/);
  });

  it('bulleted list: returns a <ul> with list items', () => {
    const html = createBlockHTML('bulleted');
    expect(html).toMatch(/^<ul\b/);
    expect((html.match(/<li/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('numbered list: returns an <ol> with list items', () => {
    const html = createBlockHTML('numbered');
    expect(html).toMatch(/^<ol\b/);
    expect((html.match(/<li/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('todo list: returns a list whose items carry a checkbox', () => {
    const html = createBlockHTML('todo');
    expect(html).toMatch(/^<ul\b/);
    expect(html).toContain('type="checkbox"');
  });

  it('divider: returns an <hr>', () => {
    expect(createBlockHTML('divider')).toMatch(/^<hr\b/);
  });
});

describe('createTableHTML — dynamic size', () => {
  it('builds a rows×cols grid for arbitrary sizes', () => {
    const html = createTableHTML(3, 5);
    expect(html).toMatch(/^<table\b/);
    expect((html.match(/<tr/g) || []).length).toBe(3);
    expect((html.match(/<t[dh]/g) || []).length).toBe(15);
  });

  it('supports a single row and a single column', () => {
    expect((createTableHTML(1, 4).match(/<tr/g) || []).length).toBe(1);
    expect((createTableHTML(4, 1).match(/<t[dh]/g) || []).length).toBe(4);
  });

  it('clamps non-positive or huge sizes into a safe range', () => {
    expect((createTableHTML(0, 0).match(/<tr/g) || []).length).toBeGreaterThanOrEqual(1);
    const big = createTableHTML(999, 999);
    expect((big.match(/<tr/g) || []).length).toBeLessThanOrEqual(20);
  });
});

describe('createBlockHTML — smart layouts', () => {
  it('stats: three big-number stat items', () => {
    const html = createBlockHTML('stats');
    expect(html).toMatch(/^<div\b/);
    expect((html.match(/data-stat/g) || []).length).toBe(3);
  });

  it('bar-stats: labelled horizontal bars', () => {
    const html = createBlockHTML('bar-stats');
    expect((html.match(/data-bar/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('process: numbered steps', () => {
    const html = createBlockHTML('process');
    expect((html.match(/data-step/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('timeline: dated entries', () => {
    expect((createBlockHTML('timeline').match(/data-tl/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('columns: a two-column layout', () => {
    expect((createBlockHTML('columns').match(/data-col/g) || []).length).toBe(2);
  });

  it('pros-cons: a pros box and a cons box', () => {
    const html = createBlockHTML('pros-cons');
    expect(html.toLowerCase()).toContain('pros');
    expect(html.toLowerCase()).toContain('cons');
  });
});

describe('createSlideHTML — new slide templates', () => {
  it('SLIDE_TEMPLATES lists choices with id + label', () => {
    expect(SLIDE_TEMPLATES.length).toBeGreaterThan(2);
    expect(SLIDE_TEMPLATES[0]).toHaveProperty('id');
    expect(SLIDE_TEMPLATES[0]).toHaveProperty('label');
  });

  it('every template renders a .slide container with a .content region', () => {
    for (const t of SLIDE_TEMPLATES) {
      const html = createSlideHTML(t.id);
      expect(html).toMatch(/^<div[^>]*class="slide/);
      expect(html).toContain('class="content"');
    }
  });

  it('blank template has no heading; title template has a main title', () => {
    expect(createSlideHTML('blank')).not.toContain('<h1');
    expect(createSlideHTML('title')).toMatch(/<h1|main-title/);
  });

  it('two-column template renders two columns', () => {
    expect((createSlideHTML('two-column').match(/data-col/g) || []).length).toBe(2);
  });

  it('unknown template falls back to a blank slide', () => {
    // @ts-expect-error testing runtime fallback for an invalid id
    expect(createSlideHTML('nope')).toMatch(/class="slide/);
  });
});

describe('createChartConfig — data charts', () => {
  it('bar/line/pie carry the requested type and a populated dataset', () => {
    for (const k of ['bar', 'line', 'pie'] as const) {
      const c = createChartConfig(k);
      expect(c.type).toBe(k);
      expect(c.data.datasets.length).toBeGreaterThanOrEqual(1);
      expect(c.data.labels.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('serializes to JSON containing the keys the chart editor edits', () => {
    const json = JSON.stringify(createChartConfig('bar'));
    expect(json).toContain('"labels"');
    expect(json).toContain('"data"');
    expect(json).toContain('"backgroundColor"');
    expect(json).toContain('"borderColor"');
  });
});

describe('searchBlocks', () => {
  it('ALL_BLOCKS lists insertable blocks with labels', () => {
    expect(ALL_BLOCKS.length).toBeGreaterThan(5);
    expect(ALL_BLOCKS[0]).toHaveProperty('type');
    expect(ALL_BLOCKS[0]).toHaveProperty('label');
  });

  it('finds a block by label keyword (case-insensitive)', () => {
    const hits = searchBlocks('quote');
    expect(hits.some((b) => b.type === 'blockquote')).toBe(true);
  });

  it('matches on keyword synonyms (e.g. "bullet" → bulleted list)', () => {
    expect(searchBlocks('bullet').some((b) => b.type === 'bulleted')).toBe(true);
  });

  it('returns the full list for an empty query', () => {
    expect(searchBlocks('').length).toBe(ALL_BLOCKS.length);
  });
});

describe('createBlockHTML — callout boxes', () => {
  const callouts = ['note', 'info', 'warning', 'success', 'caution', 'question'] as const;

  it.each(callouts)('callout-%s: returns a div carrying role="note"', (kind) => {
    const html = createBlockHTML(`callout-${kind}`);
    expect(html).toMatch(/^<div\b/);
    expect(html).toContain('role="note"');
  });

  it('different callout kinds use different accent colors', () => {
    const info = createBlockHTML('callout-info');
    const warning = createBlockHTML('callout-warning');
    expect(info).not.toEqual(warning);
  });
});

describe('createImageBlockHTML', () => {
  it('embeds the given src and includes an alt attribute', () => {
    const html = createImageBlockHTML('https://example.com/cat.png');
    expect(html).toMatch(/^<img\b/);
    expect(html).toContain('src="https://example.com/cat.png"');
    expect(html).toContain('alt=');
  });

  it('escapes quotes in the src so the attribute cannot be broken out of', () => {
    const html = createImageBlockHTML('x"><script>alert(1)</script>');
    expect(html).not.toContain('"><script>');
  });

  it('rejects javascript: URLs by returning an empty string', () => {
    expect(createImageBlockHTML('javascript:alert(1)')).toBe('');
  });
});

describe('createIconBlockHTML', () => {
  it('exposes a non-empty catalog of icon names', () => {
    expect(Array.isArray(ICONS)).toBe(true);
    expect(ICONS.length).toBeGreaterThan(0);
  });

  it('returns inline SVG for a known icon with an accessible label', () => {
    const html = createIconBlockHTML(ICONS[0]);
    expect(html).toMatch(/^<svg\b/);
    expect(html).toMatch(/role="img"/);
    expect(html).toContain('aria-label=');
  });

  it('returns empty string for an unknown icon', () => {
    expect(createIconBlockHTML('definitely-not-an-icon')).toBe('');
  });
});

describe('createQrBlockHTML', () => {
  it('produces an <img> with a data-URL QR for the given text', async () => {
    const html = await createQrBlockHTML('https://trypitch.co');
    expect(html).toMatch(/^<img\b/);
    expect(html).toContain('src="data:image/');
    expect(html).toContain('alt=');
  });

  it('returns empty string for empty input', async () => {
    expect(await createQrBlockHTML('')).toBe('');
  });
});

describe('layerStyle', () => {
  it('inline: clears absolute positioning and z-index (normal flow)', () => {
    expect(layerStyle('inline')).toEqual({ position: '', zIndex: '' });
  });

  it('front: absolute and above the text layer (z >= 20)', () => {
    const s = layerStyle('front');
    expect(s.position).toBe('absolute');
    expect(Number(s.zIndex)).toBeGreaterThanOrEqual(20);
  });

  it('back: absolute and behind the text layer (z < 10)', () => {
    const s = layerStyle('back');
    expect(s.position).toBe('absolute');
    expect(Number(s.zIndex)).toBeLessThan(10);
  });
});
