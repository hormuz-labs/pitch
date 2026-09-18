import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('apps/web/src/styles/new-project.css', 'utf8')

describe('new project composer visual contract', () => {
  it('uses a strongly scoped blue selected-mode control', () => {
    expect(css).toMatch(
      /\.lv-studio\.new-project-page \.new-composer-mode\s*\{[^}]*color:\s*var\(--new-blue\)/s,
    )
    expect(css).toMatch(/\.new-composer-mode__clear\s*\{[^}]*background:\s*var\(--new-blue\)/s)
  })

  it('keeps the composer rounded on desktop and mobile', () => {
    expect(css).toMatch(
      /\.lv-studio\.new-project-page \.new-composer-wrap \.composer-box\s*\{[^}]*border-radius:\s*24px/s,
    )
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*border-radius:\s*26px/)
  })

  it('collapses the selected mode to its icon on mobile', () => {
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.new-composer-mode > span:last-child\s*\{\s*display:\s*none/s,
    )
  })

  it('keeps the selected mode label on desktop', () => {
    expect(css).not.toMatch(/\.new-composer-mode > span:last-child\s*\{\s*display:\s*none/)
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.new-composer-mode > span:last-child\s*\{\s*display:\s*none/s,
    )
  })

  it('positions the mobile composer group lower with a balanced logo and outcome grid', () => {
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.new-create-hero > :is\([^}]+transform:\s*translateY\(20px\)/,
    )
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.new-project-wordmark\s*\{\s*width:\s*192px/,
    )
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.new-skills\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
    )
  })

  it('widens the mobile composer to a deliberate twelve pixel page gutter', () => {
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.new-create-hero\s*\{[^}]*padding:\s*72px 12px 124px/s,
    )
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.composer-wrap\.new-composer-wrap\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*padding:\s*0/s,
    )
  })
})
