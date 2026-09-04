import { describe, expect, it } from 'vitest'
import { parseSlides } from '../apps/api/src/flows/deck/index'

describe('deck slide parsing', () => {
  it('counts .slide pages and picks their first heading', () => {
    const html = `
      <html><body>
        <section class="slide title-slide"><h1>Q3 Review</h1><p>intro</p></section>
        <section class="slide"><h2>Revenue</h2></section>
        <div class="not-a-slide"><h1>ignored</h1></div>
        <section class='slide dark'><p>no heading</p></section>
      </body></html>`
    expect(parseSlides(html)).toEqual([
      { index: 1, title: 'Q3 Review' },
      { index: 2, title: 'Revenue' },
      { index: 3, title: null },
    ])
  })
})
