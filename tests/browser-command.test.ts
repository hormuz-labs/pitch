import { describe, expect, it } from 'vitest'
import {
  isSlideAdvance,
  mayNavigate,
  parseBrowserCommand,
  splitWords,
} from '../.pi/lib/browser-command.ts'

describe('splitWords', () => {
  it('groups quotes and never expands anything', () => {
    expect(splitWords(`eval "el => el.src" e12`)).toEqual(['eval', 'el => el.src', 'e12'])
    expect(splitWords(`type '$(rm -rf /) \`id\`'`)).toEqual(['type', '$(rm -rf /) `id`'])
    expect(splitWords(`type "say \\"hi\\""`)).toEqual(['type', 'say "hi"'])
    expect(splitWords(`fill e3 ""`)).toEqual(['fill', 'e3', ''])
  })

  it('rejects an unclosed quote', () => {
    expect(() => splitWords(`type "open`)).toThrow(/Unclosed quote/)
  })
})

describe('parseBrowserCommand', () => {
  it('reads the verbs the agent uses', () => {
    expect(parseBrowserCommand('snapshot')).toEqual({ op: 'snapshot' })
    expect(parseBrowserCommand('snapshot "#vector-toc"')).toEqual({
      op: 'snapshot',
      selector: '#vector-toc',
    })
    expect(parseBrowserCommand('click f1e89')).toEqual({ op: 'click', ref: 'f1e89' })
    expect(parseBrowserCommand('click e5 right')).toEqual({
      op: 'click',
      ref: 'e5',
      button: 'right',
    })
    expect(parseBrowserCommand('press ArrowRight')).toEqual({ op: 'press', key: 'ArrowRight' })
    expect(parseBrowserCommand('goto https://example.com/a?b=1')).toEqual({
      op: 'goto',
      url: 'https://example.com/a?b=1',
    })
    expect(parseBrowserCommand('fill e7 Weekly usage --submit')).toEqual({
      op: 'fill',
      ref: 'e7',
      text: 'Weekly usage',
      submit: true,
    })
    expect(parseBrowserCommand('select e9 a b')).toEqual({
      op: 'select',
      ref: 'e9',
      values: ['a', 'b'],
    })
    expect(parseBrowserCommand('screenshot e4 --filename recording/x.png')).toEqual({
      op: 'screenshot',
      file: 'recording/x.png',
      ref: 'e4',
    })
    expect(parseBrowserCommand('scroll 600')).toEqual({ op: 'scroll', dy: 600, dx: 0 })
    expect(parseBrowserCommand('mousewheel 0 -300')).toEqual({ op: 'scroll', dx: 0, dy: -300 })
    expect(parseBrowserCommand('wait 99999')).toEqual({ op: 'wait', ms: 10_000 })
    expect(parseBrowserCommand('dialog-accept yes please')).toEqual({
      op: 'dialog',
      accept: true,
      text: 'yes please',
    })
  })

  it('accepts the old playwright-cli spelling', () => {
    expect(parseBrowserCommand('playwright-cli --raw -s=abc click e53')).toEqual({
      op: 'click',
      ref: 'e53',
    })
    expect(parseBrowserCommand('click [ref=e53]')).toEqual({ op: 'click', ref: 'e53' })
  })

  it('refuses anything that is not a browser step', () => {
    expect(() => parseBrowserCommand('help')).toThrow(/not a browser command/)
    expect(() => parseBrowserCommand('cat /proc/self/environ')).toThrow(/not a browser command/)
    expect(() => parseBrowserCommand('run-code "async page => 1"')).toThrow(/not a browser command/)
    expect(() => parseBrowserCommand('upload /etc/passwd')).toThrow(/not a browser command/)
    expect(() => parseBrowserCommand('state-save /tmp/x')).toThrow(/not a browser command/)
    expect(() => parseBrowserCommand('open https://x.com')).toThrow(/record-start/)
    expect(() => parseBrowserCommand('goto file:///etc/passwd')).toThrow(/http\(s\) URL/)
    expect(() => parseBrowserCommand('click body')).toThrow(/ref from the current snapshot/)
    expect(() => parseBrowserCommand('click "e1; id"')).toThrow(/ref from the current snapshot/)
    expect(() => parseBrowserCommand('screenshot')).toThrow(/--filename/)
  })

  it('knows slide advances and navigations', () => {
    expect(isSlideAdvance(parseBrowserCommand('press ArrowRight'))).toBe(true)
    expect(isSlideAdvance(parseBrowserCommand('press ArrowLeft'))).toBe(false)
    expect(mayNavigate(parseBrowserCommand('click e1'))).toBe(true)
    expect(mayNavigate(parseBrowserCommand('press Enter'))).toBe(true)
    expect(mayNavigate(parseBrowserCommand('snapshot'))).toBe(false)
  })
})
