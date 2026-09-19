import { describe, expect, it } from 'vitest'
import { shouldReturnEmptyProjectToNew } from '../src/solid/studio/helpers'

const empty = {
  initialLoading: false,
  loadFailed: false,
  projectStatus: 'empty' as const,
  busy: false,
  entryCount: 0,
  assetCount: 0,
  hasPreview: false,
}

describe('empty Studio project routing', () => {
  it('returns a verified empty project to the canonical new-project page', () => {
    expect(shouldReturnEmptyProjectToNew(empty)).toBe(true)
  })

  it('keeps projects that are loading, working, failed, or contain material', () => {
    expect(shouldReturnEmptyProjectToNew({ ...empty, initialLoading: true })).toBe(false)
    expect(shouldReturnEmptyProjectToNew({ ...empty, loadFailed: true })).toBe(false)
    expect(shouldReturnEmptyProjectToNew({ ...empty, busy: true })).toBe(false)
    expect(shouldReturnEmptyProjectToNew({ ...empty, projectStatus: 'failed' })).toBe(false)
    expect(shouldReturnEmptyProjectToNew({ ...empty, entryCount: 1 })).toBe(false)
    expect(shouldReturnEmptyProjectToNew({ ...empty, assetCount: 1 })).toBe(false)
    expect(shouldReturnEmptyProjectToNew({ ...empty, hasPreview: true })).toBe(false)
  })
})
