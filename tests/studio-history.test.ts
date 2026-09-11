import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createWorkspaceCheckpoint,
  deleteWorkspaceHistory,
  readTurnHistory,
  restoreWorkspaceCheckpoint,
  saveTurnRecord,
} from '../apps/api/src/studio/history.js'

describe('studio workspace history', () => {
  let root: string
  let workspace: string

  beforeEach(() => {
    root = path.join(tmpdir(), `pitch-history-${randomUUID()}`)
    workspace = path.join(root, 'studio--user--project')
    mkdirSync(path.join(workspace, 'build'), { recursive: true })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('restores files, removals, and project output metadata atomically', async () => {
    writeFileSync(path.join(workspace, 'build', 'deck.html'), 'first')
    writeFileSync(path.join(workspace, 'keep.txt'), 'keep')
    const state = {
      outputs: '[{"kind":"pdf"}]',
      thumbnailUrl: 'https://example.com/old.jpg',
      lastError: null,
    }
    const checkpoint = await createWorkspaceCheckpoint(workspace, state)

    writeFileSync(path.join(workspace, 'build', 'deck.html'), 'second')
    rmSync(path.join(workspace, 'keep.txt'))
    writeFileSync(path.join(workspace, 'new.txt'), 'new')

    await expect(restoreWorkspaceCheckpoint(workspace, checkpoint)).resolves.toEqual(state)
    expect(readFileSync(path.join(workspace, 'build', 'deck.html'), 'utf8')).toBe('first')
    expect(readFileSync(path.join(workspace, 'keep.txt'), 'utf8')).toBe('keep')
    expect(existsSync(path.join(workspace, 'new.txt'))).toBe(false)
  })

  it('deduplicates unchanged file content across checkpoints', async () => {
    writeFileSync(path.join(workspace, 'same.txt'), 'same content')
    await createWorkspaceCheckpoint(workspace, {
      outputs: '[]',
      thumbnailUrl: null,
      lastError: null,
    })
    await createWorkspaceCheckpoint(workspace, {
      outputs: '[]',
      thumbnailUrl: null,
      lastError: null,
    })

    const blobs = path.join(root, '.pitch-history', path.basename(workspace), 'blobs')
    expect(readdirSync(blobs)).toHaveLength(1)
  })

  it('serializes concurrent turn metadata writes', async () => {
    await Promise.all([
      saveTurnRecord(workspace, {
        entryId: 'one',
        uiId: 'e1',
        text: 'First',
        checkpointId: 'checkpoint-one',
        at: 1,
      }),
      saveTurnRecord(workspace, {
        entryId: 'two',
        uiId: 'e2',
        text: 'Second',
        checkpointId: 'checkpoint-two',
        at: 2,
      }),
    ])

    const turns = await readTurnHistory(workspace)
    expect([...turns.keys()].sort()).toEqual(['one', 'two'])
    await deleteWorkspaceHistory(workspace)
    expect(existsSync(path.join(root, '.pitch-history', path.basename(workspace)))).toBe(false)
  })
})
