import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

export const ENHANCE_MAX_BYTES = 50 * 1024 * 1024
export const ENHANCE_EXTS = ['.pdf', '.pptx']
export const EDIT_MAX_BYTES = 500 * 1024 * 1024
export const EDIT_EXTS = ['.mp4', '.webm', '.mov', '.mkv', '.avi']

/**
 * Decode a base64 upload, validate its extension and size, and stage it as a
 * temp file. The job services take a local path, the way multer hands one over
 * on the browser routes. Shared by the MCP tools and the /v1 REST routes so
 * both enforce the same limits.
 */
export const stageBase64Upload = async (
  fileBase64: string,
  fileName: string,
  allowedExts: string[],
  maxBytes: number,
): Promise<string> => {
  const ext = extname(fileName).toLowerCase()
  if (!allowedExts.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext || '(none)'}. Allowed: ${allowedExts.join(', ')}`)
  }
  const buffer = Buffer.from(fileBase64, 'base64')
  if (buffer.length === 0) {
    throw new Error('fileBase64 decoded to an empty file')
  }
  if (buffer.length > maxBytes) {
    throw new Error(
      `File is too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB exceeds the ${maxBytes / 1024 / 1024} MB limit.`,
    )
  }
  const tmpFilePath = join(tmpdir(), `upload-${randomUUID()}${ext}`)
  await writeFile(tmpFilePath, buffer)
  return tmpFilePath
}
