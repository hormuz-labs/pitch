import { randomUUID } from 'node:crypto'
import * as db from '@saas/db'

export interface IssueReportErrorItem {
  id?: string
  source: string
  message: string
  projectId?: string
  path?: string
  at?: string
}

export interface IssueReportRow {
  id: string
  userId: string | null
  userEmail: string | null
  userName: string | null
  category: string
  message: string
  projectId: string | null
  pageUrl: string | null
  recentErrors: IssueReportErrorItem[]
  screenshotName: string | null
  screenshotDataUrl: string | null
  sessionReplayUrl: string | null
  status: 'open' | 'resolved'
  createdAt: string
}

let tableReady: Promise<void> | null = null

async function ensureIssueReportTable(): Promise<void> {
  if (!tableReady) {
    tableReady = db.prisma
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "IssueReport" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT,
          "userEmail" TEXT,
          "userName" TEXT,
          "category" TEXT NOT NULL DEFAULT 'bug',
          "message" TEXT NOT NULL,
          "projectId" TEXT,
          "pageUrl" TEXT,
          "recentErrors" TEXT NOT NULL DEFAULT '[]',
          "screenshotName" TEXT,
          "screenshotDataUrl" TEXT,
          "sessionReplayUrl" TEXT,
          "status" TEXT NOT NULL DEFAULT 'open',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      .then(() => undefined)
      .catch(err => {
        tableReady = null
        throw err
      })
  }
  return tableReady
}

function parseErrors(raw: unknown): IssueReportErrorItem[] {
  if (Array.isArray(raw)) return raw as IssueReportErrorItem[]
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeRow(row: Record<string, any>): IssueReportRow {
  return {
    id: String(row.id),
    userId: row.userId ? String(row.userId) : null,
    userEmail: row.userEmail ? String(row.userEmail) : null,
    userName: row.userName ? String(row.userName) : null,
    category: String(row.category || 'bug'),
    message: String(row.message || ''),
    projectId: row.projectId ? String(row.projectId) : null,
    pageUrl: row.pageUrl ? String(row.pageUrl) : null,
    recentErrors: parseErrors(row.recentErrors),
    screenshotName: row.screenshotName ? String(row.screenshotName) : null,
    screenshotDataUrl: row.screenshotDataUrl ? String(row.screenshotDataUrl) : null,
    sessionReplayUrl: row.sessionReplayUrl ? String(row.sessionReplayUrl) : null,
    status: row.status === 'resolved' ? 'resolved' : 'open',
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt || new Date().toISOString()),
  }
}

export async function createIssueReport(input: {
  userId?: string | null
  userEmail?: string | null
  userName?: string | null
  category: string
  message: string
  projectId?: string | null
  pageUrl?: string | null
  recentErrors?: IssueReportErrorItem[]
  screenshotName?: string | null
  screenshotDataUrl?: string | null
  sessionReplayUrl?: string | null
}): Promise<IssueReportRow> {
  await ensureIssueReportTable()
  const id = `iss_${randomUUID().replace(/-/g, '').slice(0, 20)}`
  const createdAt = new Date()
  const recentErrorsJson = JSON.stringify(
    Array.isArray(input.recentErrors) ? input.recentErrors.slice(0, 10) : [],
  )
  await db.prisma.$executeRaw`
    INSERT INTO "IssueReport" (
      "id",
      "userId",
      "userEmail",
      "userName",
      "category",
      "message",
      "projectId",
      "pageUrl",
      "recentErrors",
      "screenshotName",
      "screenshotDataUrl",
      "sessionReplayUrl",
      "status",
      "createdAt"
    ) VALUES (
      ${id},
      ${input.userId ?? null},
      ${input.userEmail ?? null},
      ${input.userName ?? null},
      ${input.category},
      ${input.message},
      ${input.projectId ?? null},
      ${input.pageUrl ?? null},
      ${recentErrorsJson},
      ${input.screenshotName ?? null},
      ${input.screenshotDataUrl ?? null},
      ${input.sessionReplayUrl ?? null},
      ${'open'},
      ${createdAt}
    )
  `
  return {
    id,
    userId: input.userId ?? null,
    userEmail: input.userEmail ?? null,
    userName: input.userName ?? null,
    category: input.category,
    message: input.message,
    projectId: input.projectId ?? null,
    pageUrl: input.pageUrl ?? null,
    recentErrors: Array.isArray(input.recentErrors) ? input.recentErrors.slice(0, 10) : [],
    screenshotName: input.screenshotName ?? null,
    screenshotDataUrl: input.screenshotDataUrl ?? null,
    sessionReplayUrl: input.sessionReplayUrl ?? null,
    status: 'open',
    createdAt: createdAt.toISOString(),
  }
}

export async function listIssueReports(limit = 200): Promise<IssueReportRow[]> {
  await ensureIssueReportTable()
  const rows = await db.prisma.$queryRaw<Array<Record<string, any>>>`
    SELECT *
    FROM "IssueReport"
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `
  return rows.map(normalizeRow)
}

export async function updateIssueReportStatus(
  id: string,
  status: 'open' | 'resolved',
): Promise<boolean> {
  await ensureIssueReportTable()
  const updated = await db.prisma.$executeRaw`
    UPDATE "IssueReport"
    SET "status" = ${status}
    WHERE "id" = ${id}
  `
  return Number(updated) > 0
}

export async function deleteIssueReport(id: string): Promise<boolean> {
  await ensureIssueReportTable()
  const deleted = await db.prisma.$executeRaw`
    DELETE FROM "IssueReport"
    WHERE "id" = ${id}
  `
  return Number(deleted) > 0
}
