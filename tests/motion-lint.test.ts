import { describe, expect, it } from 'vitest'
import { motionFindings } from '../.pi/scripts/launch-video/lib/motion-lint.mjs'

const page = {
  kind: 'page',
  shot: 'slide',
  t: 12.2,
  el: 'div.ds',
  travel: 1400,
  share: 0.73,
  fills: 1,
}
const pop = {
  kind: 'pop',
  shot: 'inputs',
  t: 2.17,
  el: 'div.card',
  travel: 1500,
  share: 0.78,
  ease: 'expo.out',
  firstFrame: 404,
}

describe('motionFindings', () => {
  it('fails a composition sliding as one page and names where', () => {
    const [line] = motionFindings([page])
    expect(line.level).toBe('fail')
    expect(line.msg).toContain('#slide div.ds at 12.2s')
    expect(line.msg).toContain('fills 100% of the frame, travels 73% of it')
  })

  it('notes a long move at full speed on its first frame, without failing', () => {
    const [line] = motionFindings([pop])
    expect(line.level).toBe('warn')
    expect(line.msg).toContain('1500px on expo.out, 404px in frame one')
  })

  it('says nothing about a film without either, and keeps a scoped run to its shots', () => {
    expect(motionFindings([])).toEqual([])
    expect(motionFindings([page, pop], ['inputs']).map(l => l.level)).toEqual(['warn'])
  })
})
