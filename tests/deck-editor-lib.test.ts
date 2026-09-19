import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const DeckEditorLib = createRequire(import.meta.url)('../engine/js/deck-editor-lib.js') as {
  normalizeColor: (col: string) => string
  cleanDeckHtml: (html: string) => string
  retagSlides: (html: string) => { html: string; slides: { index: number; title: string }[] }
  updateChartScript: (
    scriptText: string,
    opts: {
      data?: number[]
      labels?: string[]
      backgroundColor?: string | string[]
      borderColor?: string | string[]
    },
  ) => string
  findChartScriptText: (
    html: string,
    canvasId: string,
  ) => { start: number; end: number; text: string } | null
}

const { normalizeColor, cleanDeckHtml, retagSlides, updateChartScript, findChartScriptText } =
  DeckEditorLib

describe('normalizeColor', () => {
  it('returns an empty string for empty input', () => {
    expect(normalizeColor('')).toBe('')
    expect(normalizeColor(undefined as unknown as string)).toBe('')
    expect(normalizeColor(null as unknown as string)).toBe('')
  })

  it('keeps transparent spellings transparent', () => {
    expect(normalizeColor('transparent')).toBe('transparent')
    expect(normalizeColor('TRANSPARENT')).toBe('transparent')
    expect(normalizeColor('rgba(0, 0, 0, 0)')).toBe('transparent')
    expect(normalizeColor('rgba(0,0,0,0)')).toBe('transparent')
  })

  it('passes hex colors through, lowercased and trimmed', () => {
    expect(normalizeColor('#FFFFFF')).toBe('#ffffff')
    expect(normalizeColor('  #6366F1 ')).toBe('#6366f1')
  })

  it('converts rgb() to hex', () => {
    expect(normalizeColor('rgb(255, 0, 0)')).toBe('#ff0000')
    expect(normalizeColor('rgb(99,102,241)')).toBe('#6366f1')
    expect(normalizeColor('RGB(1, 2, 3)')).toBe('#010203')
  })

  it('converts rgba() to hex, dropping a non-zero alpha', () => {
    expect(normalizeColor('rgba(255, 0, 0, 1)')).toBe('#ff0000')
    expect(normalizeColor('rgba(99, 102, 241, 0.5)')).toBe('#6366f1')
  })

  it('treats a zero alpha as transparent', () => {
    expect(normalizeColor('rgba(10, 20, 30, 0)')).toBe('transparent')
  })

  it('returns anything else trimmed and lowercased', () => {
    expect(normalizeColor('  RED ')).toBe('red')
    expect(normalizeColor('hsl(120, 50%, 50%)')).toBe('hsl(120, 50%, 50%)')
  })
})

describe('cleanDeckHtml', () => {
  it('removes the editor-only style block', () => {
    const html =
      '<head><style id="pitch-editor-style">[contenteditable="true"] { color: red; }</style><style>.slide { color: blue; }</style></head>'
    expect(cleanDeckHtml(html)).toBe('<head><style>.slide { color: blue; }</style></head>')
  })

  it('strips studio-injected engine scripts (inspector pair, bridge, lib with token)', () => {
    const html =
      '<body><div class="slide">x</div>' +
      '<script>window.STUDIO_INSPECTOR={"container":".slide"}</script>' +
      '<script src="../../engine/js/inspector.js?token=abc"></script>' +
      '<script src="../../engine/js/deck-editor.js?token=abc"></script>' +
      '<script src="http://localhost:5173/api/files/engine/js/deck-editor-lib.js?token=JWT"></script>' +
      '</body>'
    const out = cleanDeckHtml(html)
    expect(out).toBe('<body><div class="slide">x</div></body>')
    expect(out).not.toContain('engine/js/')
    expect(out).not.toContain('STUDIO_INSPECTOR')
    expect(out).not.toContain('JWT')
  })

  it('keeps chart init scripts and other inline scripts', () => {
    const html =
      '<div data-chart="1"><canvas id="chart_abc"></canvas></div>' +
      "<script>(function(){function go(){var el=document.getElementById('chart_abc');if(el&&window.Chart){new window.Chart(el, {});}else{setTimeout(go,60);}}go();})();</script>"
    expect(cleanDeckHtml(html)).toBe(html)
  })

  it('removes selected-for-styling from class lists and keeps other classes', () => {
    const html = '<div class="slide selected-for-styling dark" id="a">x</div>'
    expect(cleanDeckHtml(html)).toBe('<div class="slide dark" id="a">x</div>')
  })

  it('drops the class attribute entirely when it becomes empty', () => {
    expect(cleanDeckHtml('<p class="selected-for-styling">y</p>')).toBe('<p>y</p>')
    expect(cleanDeckHtml("<p class='selected-for-styling'>y</p>")).toBe('<p>y</p>')
  })

  it('drops pre-existing empty class attributes', () => {
    expect(cleanDeckHtml('<p class="">y</p>')).toBe('<p>y</p>')
  })

  it('does not remove classes that merely contain the marker as a substring', () => {
    const html = '<div class="selected-for-styling-extra">z</div>'
    expect(cleanDeckHtml(html)).toBe(html)
  })

  it('removes contenteditable and spellcheck attributes', () => {
    const html = '<h1 contenteditable="true" spellcheck="false" class="t">Hi</h1>'
    expect(cleanDeckHtml(html)).toBe('<h1 class="t">Hi</h1>')
  })

  it('removes data-studio-mark attributes', () => {
    const html = '<div class="slide" data-studio-mark="3"><span data-studio-mark="4">s</span></div>'
    expect(cleanDeckHtml(html)).toBe('<div class="slide"><span>s</span></div>')
  })

  it('removes inspector hover and numbered target overlays from saved decks', () => {
    const html =
      '<body><section class="slide"><h1 data-studio-mark="1">Title</h1></section>' +
      '<div id="studio-inspect-overlay" style="position:fixed"><div>h1</div></div>' +
      '<div data-studio-box="1" style="position:fixed"><div>1</div></div></body>'
    const cleaned = cleanDeckHtml(html)
    expect(cleaned).toBe('<body><section class="slide"><h1>Title</h1></section></body>')
    expect(cleaned).not.toContain('studio-inspect')
    expect(cleaned).not.toContain('data-studio-box')
  })

  it('is idempotent', () => {
    const dirty =
      '<style id="pitch-editor-style">x{}</style><div class="slide selected-for-styling" contenteditable="true" spellcheck="false" data-studio-mark="1"><h1 class="main-title selected-for-styling">T</h1></div>'
    const once = cleanDeckHtml(dirty)
    expect(cleanDeckHtml(once)).toBe(once)
    expect(once).toBe('<div class="slide"><h1 class="main-title">T</h1></div>')
  })

  it('leaves chart scripts byte-identical even when they mention the markers', () => {
    const script =
      '<script>const s = "contenteditable=\\"true\\" data-studio-mark"; new Chart(document.getElementById("chart-1"), { data: { labels: ["Q1"] } });</script>'
    const html = `<div class="slide selected-for-styling">${script}</div>`
    const cleaned = cleanDeckHtml(html)
    expect(cleaned).toContain(script)
    expect(cleaned).toBe(`<div class="slide">${script}</div>`)
  })

  it('leaves inline styles and surrounding whitespace untouched', () => {
    const html = '<div class="slide" style="color: rgb(1, 2, 3);  margin: 0 ;">\n  <p>x</p>\n</div>'
    expect(cleanDeckHtml(html)).toBe(html)
  })
})

describe('retagSlides', () => {
  it('tags .slide elements with 1-based ids in document order and reads h1 titles', () => {
    const html =
      '<section class="slide title-slide"><h1>Q3 Review</h1></section>' +
      '<section class="slide"><h1>Revenue</h1></section>'
    const { html: out, slides } = retagSlides(html)
    expect(slides).toEqual([
      { index: 1, title: 'Q3 Review' },
      { index: 2, title: 'Revenue' },
    ])
    expect(out).toContain('id="slide-node-1"')
    expect(out).toContain('id="slide-node-2"')
  })

  it('replaces an existing id rather than adding a second one', () => {
    const { html } = retagSlides('<div class="slide" id="old-id"><h1>A</h1></div>')
    expect(html).toContain('id="slide-node-1"')
    expect(html).not.toContain('old-id')
  })

  it('ignores elements whose class list does not contain slide', () => {
    const html =
      '<div class="not-a-slide"><h1>ignored</h1></div><div class="slide"><h1>kept</h1></div>'
    const { html: out, slides } = retagSlides(html)
    expect(slides).toEqual([{ index: 1, title: 'kept' }])
    expect(out).toContain('<div class="not-a-slide"><h1>ignored</h1></div>')
    expect(out.match(/slide-node/g)).toHaveLength(1)
  })

  it('renumbers after a middle slide is deleted', () => {
    const three =
      '<div class="slide"><h1>One</h1></div><div class="slide"><h1>Two</h1></div><div class="slide"><h1>Three</h1></div>'
    const first = retagSlides(three)
    expect(first.slides.map(s => s.title)).toEqual(['One', 'Two', 'Three'])
    // simulate deleting the middle slide and re-tagging
    const remaining =
      '<div class="slide" id="slide-node-1"><h1>One</h1></div><div class="slide" id="slide-node-3"><h1>Three</h1></div>'
    const second = retagSlides(remaining)
    expect(second.slides).toEqual([
      { index: 1, title: 'One' },
      { index: 2, title: 'Three' },
    ])
    expect(second.html).toContain('id="slide-node-2"><h1>Three</h1>')
    expect(second.html).not.toContain('slide-node-3')
  })

  it('uses a .main-title element when there is no h1', () => {
    const html = '<div class="slide"><p class="main-title">Quarterly <b>Results</b></p></div>'
    expect(retagSlides(html).slides).toEqual([{ index: 1, title: 'Quarterly Results' }])
  })

  it('prefers whichever of h1 / .main-title comes first in the slide', () => {
    const html = '<div class="slide"><p class="main-title">First</p><h1>Second</h1></div>'
    expect(retagSlides(html).slides[0].title).toBe('First')
    const swapped = '<div class="slide"><h1>First</h1><p class="main-title">Second</p></div>'
    expect(retagSlides(swapped).slides[0].title).toBe('First')
  })

  it('falls back to Slide N when there is no heading', () => {
    const html =
      '<section class="slide dark"><p>no heading</p></section><section class="slide"></section>'
    expect(retagSlides(html).slides).toEqual([
      { index: 1, title: 'Slide 1' },
      { index: 2, title: 'Slide 2' },
    ])
  })

  it('collapses whitespace and caps the title at 80 characters', () => {
    const long = `<div class="slide"><h1>  ${'word '.repeat(30)}  </h1></div>`
    const title = retagSlides(long).slides[0].title
    expect(title).toBe('word '.repeat(30).trim().slice(0, 80))
    expect(title.length).toBeLessThanOrEqual(80)
  })

  it('handles single-quoted class attributes', () => {
    const { html, slides } = retagSlides("<section class='slide dark'><h1>Solo</h1></section>")
    expect(slides).toEqual([{ index: 1, title: 'Solo' }])
    expect(html).toContain("class='slide dark'")
    expect(html).toContain('id="slide-node-1"')
  })
})

describe('updateChartScript', () => {
  // Shape produced by createChartConfig in the old slideBlocks.ts.
  const generatorScript = `
new Chart(document.getElementById('chart-1'), {
  type: 'bar',
  data: {
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    datasets: [{
      label: 'Series 1',
      data: [12, 19, 8, 15],
      backgroundColor: '#6366f1',
      borderColor: '#4f46e5',
      borderWidth: 2,
    }],
  },
  options: { responsive: true },
});`

  it('rewrites labels and data with JSON-stringified values', () => {
    const out = updateChartScript(generatorScript, {
      labels: ['Jan', 'Feb'],
      data: [5, 9],
    })
    expect(out).toContain('"labels":["Jan","Feb"]')
    expect(out).toContain('"data":[5,9]')
    expect(out).not.toContain("['Q1', 'Q2', 'Q3', 'Q4']")
    expect(out).not.toContain('[12, 19, 8, 15]')
    // untouched parts survive
    expect(out).toContain("label: 'Series 1'")
    expect(out).toContain("borderColor: '#4f46e5'")
  })

  it('rewrites scalar colors', () => {
    const out = updateChartScript(generatorScript, {
      backgroundColor: '#ff0000',
      borderColor: '#00ff00',
    })
    expect(out).toContain('"backgroundColor":"#ff0000"')
    expect(out).toContain('"borderColor":"#00ff00"')
    expect(out).not.toContain("'#6366f1'")
    expect(out).not.toContain("'#4f46e5'")
  })

  it('replaces a scalar color with an array', () => {
    const out = updateChartScript(generatorScript, { backgroundColor: ['#111111', '#222222'] })
    expect(out).toContain('"backgroundColor":["#111111","#222222"]')
  })

  it('replaces an array color with a scalar (pie config)', () => {
    const pie =
      "backgroundColor: ['#6366f1', '#22c55e', '#f59e0b', '#ef4444'],\nborderColor: '#ffffff',"
    const out = updateChartScript(pie, { backgroundColor: '#123456' })
    expect(out).toContain('"backgroundColor":"#123456"')
    expect(out).not.toContain("'#6366f1', '#22c55e'")
    expect(out).toContain("borderColor: '#ffffff'")
  })

  it('handles quoted keys and double-quoted values', () => {
    const quoted = `{ "labels": ["A", "B"], 'data': [1, 2], "backgroundColor": "#aabbcc", 'borderColor': '#ddeeff' }`
    const out = updateChartScript(quoted, {
      labels: ['X'],
      data: [7],
      backgroundColor: '#000000',
      borderColor: '#111111',
    })
    expect(out).toContain('"labels":["X"]')
    expect(out).toContain('"data":[7]')
    expect(out).toContain('"backgroundColor":"#000000"')
    expect(out).toContain('"borderColor":"#111111"')
  })

  it('only replaces the fields that are provided', () => {
    const out = updateChartScript(generatorScript, { data: [1, 2, 3] })
    expect(out).toContain('"data":[1,2,3]')
    expect(out).toContain("labels: ['Q1', 'Q2', 'Q3', 'Q4']")
    expect(out).toContain("backgroundColor: '#6366f1'")
  })

  it('changes nothing when no fields are provided', () => {
    expect(updateChartScript(generatorScript, {})).toBe(generatorScript)
  })

  it('replaces only the first data array (the dataset, not a later one)', () => {
    const script = 'data: [1, 2], data: [3, 4]'
    expect(updateChartScript(script, { data: [9] })).toBe('"data":[9], data: [3, 4]')
  })
})

describe('findChartScriptText', () => {
  it('finds the inline script that mentions the canvas id among several scripts', () => {
    const before = '<script>console.log("other");</script>'
    const chart =
      '<script>new Chart(document.getElementById("chart-7"), { data: { labels: ["Q1"] } });</script>'
    const after = '<script>console.log("later");</script>'
    const html = `<body>${before}${chart}${after}</body>`
    const found = findChartScriptText(html, 'chart-7')
    expect(found).not.toBeNull()
    expect(found!.text).toContain('chart-7')
    expect(html.slice(found!.start, found!.end)).toBe(chart)
  })

  it('skips scripts with a src attribute even when their text mentions the id', () => {
    const html =
      '<script src="https://cdn.example/chart.js">// chart-1 shim</script>' +
      '<script>new Chart(document.getElementById("chart-1"), {});</script>'
    const found = findChartScriptText(html, 'chart-1')
    expect(found).not.toBeNull()
    expect(found!.text).toContain('new Chart')
    expect(found!.text).not.toContain('shim')
  })

  it('returns null when no inline script mentions the canvas id', () => {
    const html = '<script>console.log("nothing");</script><script src="/x.js"></script>'
    expect(findChartScriptText(html, 'chart-9')).toBeNull()
    expect(findChartScriptText('', 'chart-9')).toBeNull()
    expect(findChartScriptText('<script>chart-9</script>', '')).toBeNull()
  })

  it('round-trips with updateChartScript: locate, rewrite, splice back', () => {
    const chart =
      '<script>new Chart(document.getElementById("chart-3"), { data: { labels: ["Q1"], datasets: [{ data: [12, 19] }] } });</script>'
    const html = `<div class="slide"><canvas id="chart-3"></canvas></div>${chart}`
    const found = findChartScriptText(html, 'chart-3')!
    const rewritten = updateChartScript(found.text, { data: [42] })
    const next = `${html.slice(0, found.start)}<script>${rewritten}</script>${html.slice(found.end)}`
    expect(next).toContain('"data":[42]')
    expect(next).toContain('<canvas id="chart-3"></canvas>')
  })
})
