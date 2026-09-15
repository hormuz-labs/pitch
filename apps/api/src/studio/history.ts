import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

const HISTORY_ROOT = '.pitch-history'
const turnWrites = new Map<string, Promise<void>>()

export interface ProjectCheckpointState {
  outputs: unknown
  thumbnailUrl: string | null
  lastError: string | null
}

interface SnapshotFile {
  path: string
  kind: 'file' | 'symlink'
  blob?: string
  target?: string
  mode: number
}

interface Snapshot {
  version: 1
  id: string
  createdAt: string
  directories: Array<{ path: string; mode: number }>
  files: SnapshotFile[]
  project: ProjectCheckpointState
}

export interface TurnRecord {
  entryId: string
  uiId: string
  text: string
  checkpointId: string
  at: number
}

interface TurnHistory {
  version: 1
  turns: Record<string, TurnRecord>
}

/** Where a workspace's turn checkpoints live: a sibling of the workspace, never inside it. */
export function historyDir(workspace: string): string {
  return path.join(path.dirname(workspace), HISTORY_ROOT, path.basename(workspace))
}

function safeRelative(rel: string): string {
  const normalized = rel.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..'))
    throw new Error(`Invalid checkpoint path: ${rel}`)
  return normalized
}

async function walk(
  root: string,
  rel = '',
  directories: Snapshot['directories'] = [],
  files: SnapshotFile[] = [],
): Promise<{ directories: Snapshot['directories']; files: SnapshotFile[] }> {
  const dir = path.join(root, rel)
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const child = rel ? `${rel}/${entry.name}` : entry.name
    const absolute = path.join(root, child)
    const stat = await lstat(absolute)
    if (entry.isDirectory()) {
      directories.push({ path: child, mode: stat.mode })
      await walk(root, child, directories, files)
    } else if (entry.isFile()) {
      files.push({ path: child, kind: 'file', mode: stat.mode })
    } else if (entry.isSymbolicLink()) {
      files.push({
        path: child,
        kind: 'symlink',
        target: await readlink(absolute),
        mode: stat.mode,
      })
    }
  }
  return { directories, files }
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${randomUUID()}.tmp`
  await writeFile(tmp, `${JSON.stringify(value)}\n`)
  await rename(tmp, file)
}

async function readSnapshot(workspace: string, id: string): Promise<Snapshot> {
  if (!/^[a-f0-9-]+$/i.test(id)) throw new Error('Invalid checkpoint id')
  const file = path.join(historyDir(workspace), 'checkpoints', `${id}.json`)
  const parsed = JSON.parse(await readFile(file, 'utf8')) as Snapshot
  if (parsed.version !== 1 || parsed.id !== id) throw new Error('Invalid workspace checkpoint')
  return parsed
}

export async function createWorkspaceCheckpoint(
  workspace: string,
  project: ProjectCheckpointState,
): Promise<string> {
  const root = historyDir(workspace)
  const blobs = path.join(root, 'blobs')
  const checkpoints = path.join(root, 'checkpoints')
  await mkdir(blobs, { recursive: true })
  await mkdir(checkpoints, { recursive: true })

  const snapshot: Snapshot = {
    version: 1,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...(await walk(workspace)),
    project,
  }
  for (const file of snapshot.files) {
    if (file.kind !== 'file') continue
    const source = path.join(workspace, file.path)
    const tmp = path.join(blobs, `${randomUUID()}.tmp`)
    try {
      await copyFile(source, tmp)
      const blob = await hashFile(tmp)
      const destination = path.join(blobs, blob)
      if (!existsSync(destination)) {
        await rename(tmp, destination).catch(error => {
          if (!existsSync(destination)) throw error
        })
      }
      file.blob = blob
    } finally {
      await rm(tmp, { force: true }).catch(() => {})
    }
  }
  await writeJsonAtomic(path.join(checkpoints, `${snapshot.id}.json`), snapshot)
  return snapshot.id
}

async function materialize(
  workspace: string,
  destination: string,
  snapshot: Snapshot,
): Promise<void> {
  const root = historyDir(workspace)
  await mkdir(destination, { recursive: true })
  for (const dir of snapshot.directories.sort((a, b) => a.path.length - b.path.length)) {
    const rel = safeRelative(dir.path)
    await mkdir(path.join(destination, rel), { recursive: true })
  }
  for (const file of snapshot.files) {
    const rel = safeRelative(file.path)
    const target = path.join(destination, rel)
    await mkdir(path.dirname(target), { recursive: true })
    if (file.kind === 'symlink') {
      await symlink(file.target ?? '', target)
      continue
    }
    if (!file.blob) throw new Error(`Checkpoint is missing data for ${rel}`)
    const blob = path.join(root, 'blobs', file.blob)
    if (!existsSync(blob)) throw new Error(`Checkpoint data is missing for ${rel}`)
    await copyFile(blob, target)
    await chmod(target, file.mode)
  }
  for (const dir of snapshot.directories.sort((a, b) => b.path.length - a.path.length))
    await chmod(path.join(destination, safeRelative(dir.path)), dir.mode)
}

/** Restore through a sibling directory so a failed copy cannot leave a half-restored workspace. */
export async function restoreWorkspaceCheckpoint(
  workspace: string,
  id: string,
): Promise<ProjectCheckpointState> {
  const snapshot = await readSnapshot(workspace, id)
  const parent = path.dirname(workspace)
  const base = path.basename(workspace)
  const staging = path.join(parent, `.${base}.restore-${randomUUID()}`)
  const backup = path.join(parent, `.${base}.backup-${randomUUID()}`)
  try {
    await materialize(workspace, staging, snapshot)
    await rename(workspace, backup)
    try {
      await rename(staging, workspace)
    } catch (error) {
      await rename(backup, workspace)
      throw error
    }
    await rm(backup, { recursive: true, force: true })
    return snapshot.project
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {})
  }
}

export async function readTurnHistory(workspace: string): Promise<Map<string, TurnRecord>> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(historyDir(workspace), 'turns.json'), 'utf8'),
    ) as TurnHistory
    if (parsed.version !== 1 || !parsed.turns) return new Map()
    return new Map(Object.entries(parsed.turns))
  } catch {
    return new Map()
  }
}

export async function saveTurnRecord(workspace: string, record: TurnRecord): Promise<void> {
  const previous = turnWrites.get(workspace) ?? Promise.resolve()
  const write = previous
    .catch(() => {})
    .then(async () => {
      const root = historyDir(workspace)
      await mkdir(root, { recursive: true })
      const turns = await readTurnHistory(workspace)
      turns.set(record.entryId, record)
      await writeJsonAtomic(path.join(root, 'turns.json'), {
        version: 1,
        turns: Object.fromEntries(turns),
      } satisfies TurnHistory)
    })
  turnWrites.set(workspace, write)
  try {
    await write
  } finally {
    if (turnWrites.get(workspace) === write) turnWrites.delete(workspace)
  }
}

export async function deleteWorkspaceHistory(workspace: string): Promise<void> {
  await rm(historyDir(workspace), { recursive: true, force: true })
}
